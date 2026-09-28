import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  type ClientEvent,
  PROTOCOL_VERSION,
  type ServerEvent,
  TERMINAL_PATH_RE,
  parseClientEvent,
} from "@octogent/octoplan-protocol";
import { WebSocket, WebSocketServer } from "ws";
import { TERMINAL_MESSAGES, attachTerminal } from "./bridge/popOut";
import { createSessionManager } from "./bridge/sessionManager";
import type { BridgeDeps, HeadlessRunner } from "./bridge/types";
import { applyIdeaAction, buildStages } from "./modes";
import { createPlanOps } from "./planOps";

export const SERVER_VERSION = "0.0.0";
export const WS_PATH = "/ws";

export type OctoplanServer = {
  port: number;
  close: () => Promise<void>;
};

const send = (socket: WebSocket, event: ServerEvent) => {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
};

const sendJson = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
};

const handleRequest = (request: IncomingMessage, response: ServerResponse) => {
  if (request.method === "GET" && request.url === "/api/health") {
    sendJson(response, 200, { ok: true, name: "octoplan", protocolVersion: PROTOCOL_VERSION });
    return;
  }
  sendJson(response, 404, { ok: false, error: "not found" });
};

export const NO_BRIDGE_MESSAGE =
  "This Octoplan server was started without a Claude bridge, so sessions are unavailable.";

export const notWiredMessage = (type: string) => `Not wired yet: ${type}`;

const pathOf = (url: string | undefined) => {
  try {
    return new URL(url ?? "/", "http://localhost").pathname;
  } catch {
    return null;
  }
};

const decodeSegment = (segment: string) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
};

export const startOctoplanServer = (options: {
  host: string;
  port: number;
  /** Real or fake Claude bridge dependencies; without them only hello/health work. */
  deps?: BridgeDeps;
  /** v2: harvest + handoff passes (D31, D45); absent = those use their fallbacks/errors. */
  headless?: HeadlessRunner;
}): Promise<OctoplanServer> => {
  const httpServer = createServer(handleRequest);
  // Both sockets share the HTTP server: /ws carries planning events, /ws/terminal/<id> a PTY.
  const wss = new WebSocketServer({ noServer: true });
  const terminalWss = new WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (request, socket, head) => {
    const path = pathOf(request.url);
    if (path === WS_PATH) {
      wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
      return;
    }
    const match = path ? TERMINAL_PATH_RE.exec(path) : null;
    const sessionId = match?.[1] ? decodeSegment(match[1]) : null;
    if (!sessionId) {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    terminalWss.handleUpgrade(request, socket, head, (ws) => {
      attachTerminal({
        socket: ws,
        sessionId,
        session: manager?.getSession(sessionId),
        spawnPty: options.deps?.spawnPty,
        ...(manager ? {} : { refusal: TERMINAL_MESSAGES.noBridge }),
      });
    });
  });
  const broadcast = (event: ServerEvent) => {
    for (const client of wss.clients) send(client, event);
  };
  const manager = options.deps ? createSessionManager(options.deps, broadcast) : null;
  const planOps =
    manager && options.deps
      ? createPlanOps({
          storeFor: manager.storeFor,
          broadcast,
          applyIdeaAction,
          buildStages,
          ...(options.deps.integrations ? { integrations: options.deps.integrations } : {}),
          ...(options.deps.ideaRegistry ? { ideaRegistry: options.deps.ideaRegistry } : {}),
          ...(options.deps.conventions ? { conventions: options.deps.conventions } : {}),
          ...(options.headless ? { headless: options.headless } : {}),
          ...(options.deps.now ? { now: options.deps.now } : {}),
        })
      : null;

  const handle = async (socket: WebSocket, event: ClientEvent) => {
    if (event.type === "hello") {
      if (manager) await manager.replay((e) => send(socket, e));
      else send(socket, { type: "sessions", sessions: [] });
      await planOps?.sendConventions((e) => send(socket, e));
      return;
    }
    if (!manager) {
      send(socket, { type: "error", message: NO_BRIDGE_MESSAGE });
      return;
    }
    switch (event.type) {
      case "start-session":
        await manager.start(event);
        await planOps?.registerRepo(event.repoPath);
        // D17: harvest on repo open, only when there are new commits (never blocks the session).
        void planOps?.runHarvest(event.repoPath, { auto: true });
        return;
      case "send-message":
        manager.sendMessage(event.sessionId, event.text);
        return;
      case "answer-round":
        await manager.answerRound(event.sessionId, event.roundId, event.answers);
        return;
      case "revise-answer":
        await manager.reviseAnswer(event.sessionId, event.answer);
        return;
      case "stop-session":
        await manager.stop(event.sessionId);
        return;
      case "capture-idea":
        await manager.captureIdea(event.repoPath, event.title, event.tags ?? []);
        await planOps?.registerRepo(event.repoPath);
        return;
      case "branch-session":
        await manager.branch(event.sessionId, event.title, event.fromBlockId);
        return;
      case "converge":
        await manager.converge(event.sessionId);
        return;
      // Plan operations that don't need a Claude session (planOps.ts).
      case "search-ideas":
        await planOps?.searchIdeas(event.query, (e) => send(socket, e));
        return;
      case "update-idea":
        await planOps?.updateIdea(event.repoPath, event.ideaId, event.action, event.intoId);
        return;
      case "generate-stages":
        await planOps?.generateStages(event.repoPath);
        return;
      case "export-tentacle":
        await planOps?.exportTentacle(event.repoPath, event.tentacleId, event.tasks, event.heading);
        return;
      // v2
      case "request-overview":
        await planOps?.requestOverview(event.repoPath, (e) => send(socket, e));
        return;
      case "run-harvest":
        await planOps?.runHarvest(event.repoPath);
        return;
      case "resolve-harvest":
        await planOps?.resolveHarvest(event.repoPath, event.harvestId, event.action);
        return;
      case "add-convention":
        await planOps?.addConvention(event.title, event.body);
        return;
      case "remove-convention":
        await planOps?.removeConvention(event.conventionId);
        return;
      case "generate-handoff":
        await planOps?.generateHandoff(event.repoPath, event.heading);
        return;
      case "save-handoff":
        await planOps?.saveHandoff(event.repoPath, event.plan);
        return;
      case "apply-handoff":
        await planOps?.applyHandoff(event.repoPath);
        return;
      case "request-graph":
        await planOps?.requestGraph(event.repoPath, (e) => send(socket, e));
        return;
      case "request-octogent-status":
        await planOps?.requestOctogentStatus(event.repoPath, (e) => send(socket, e));
        return;
      case "launch-octogent":
        await planOps?.launchOctogent(event.repoPath);
        return;
      // v3 entry paths (D50–D57): both end in a deep interview the requester is moved to.
      case "create-project": {
        const repoPath = await planOps?.createProject(event);
        if (!repoPath) return;
        send(socket, { type: "focus-repo", repoPath });
        const session = await manager.start({ repoPath, mode: "deep-interview", topic: event.idea });
        if (session) send(socket, { type: "focus-session", sessionId: session.id });
        return;
      }
      case "start-import":
        await planOps?.startImport(event, (e) => send(socket, e));
        return;
      case "save-ingest":
        await planOps?.saveIngest(event.repoPath, event.draft);
        return;
      case "apply-ingest": {
        const applied = await planOps?.applyIngest(event.repoPath, event.draft);
        if (!applied) return;
        const session = await manager.start({
          repoPath: applied.repoPath,
          mode: "deep-interview",
          topic: applied.topic,
          brief: applied.brief,
        });
        if (session) send(socket, { type: "focus-session", sessionId: session.id });
        // D57: a built project also gets its history harvested (only when there are commits).
        void planOps?.runHarvest(applied.repoPath, { auto: true });
        return;
      }
      case "link-branch":
        await planOps?.linkBranch(event.repoPath, event.branchId, event.gitBranch);
        return;
      default: {
        const unhandled: never = event;
        send(socket, {
          type: "error",
          message: notWiredMessage((unhandled as { type: string }).type),
        });
      }
    }
  };

  wss.on("connection", (socket) => {
    void (async () => {
      const defaultProjectsDir = await planOps?.defaultProjectsDir().catch(() => undefined);
      send(socket, {
        type: "hello",
        protocolVersion: PROTOCOL_VERSION,
        serverVersion: SERVER_VERSION,
        ...(defaultProjectsDir ? { defaultProjectsDir } : {}),
      });
    })();
    socket.on("message", (data) => {
      const event = parseClientEvent(data.toString());
      if (!event) {
        send(socket, { type: "error", message: "Malformed client event." });
        return;
      }
      handle(socket, event).catch((error) =>
        send(socket, { type: "error", message: `Server error: ${String(error)}` }),
      );
    });
  });

  // D29: bring back sessions from before a restart before anyone connects.
  const restored = manager
    ? manager.restore().catch((error) => {
        console.warn(`[octoplan] could not restore sessions: ${String(error)}`);
        return 0;
      })
    : Promise.resolve(0);

  return restored.then(
    () =>
      new Promise((resolve, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(options.port, options.host, () => {
          const { port } = httpServer.address() as AddressInfo;
          resolve({
            port,
            close: () =>
              new Promise<void>((done) => {
                void manager?.dispose();
                for (const client of [...wss.clients, ...terminalWss.clients]) client.terminate();
                terminalWss.close();
                wss.close(() => httpServer.close(() => done()));
              }),
          });
        });
      }),
  );
};
