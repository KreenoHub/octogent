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
import type { BridgeDeps } from "./bridge/types";
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
        })
      : null;

  const handle = async (socket: WebSocket, event: ClientEvent) => {
    if (event.type === "hello") {
      if (manager) await manager.replay((e) => send(socket, e));
      else send(socket, { type: "sessions", sessions: [] });
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
        await planOps?.exportTentacle(event.repoPath, event.tentacleId, event.tasks);
        return;
      case "request-graph":
        await planOps?.requestGraph(event.repoPath, (e) => send(socket, e));
        return;
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
    send(socket, {
      type: "hello",
      protocolVersion: PROTOCOL_VERSION,
      serverVersion: SERVER_VERSION,
    });
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

  return new Promise((resolve, reject) => {
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
  });
};
