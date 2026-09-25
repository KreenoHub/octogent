import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  type ClientEvent,
  PROTOCOL_VERSION,
  type ServerEvent,
  parseClientEvent,
} from "@octogent/octoplan-protocol";
import { WebSocket, WebSocketServer } from "ws";
import { createSessionManager } from "./bridge/sessionManager";
import type { BridgeDeps } from "./bridge/types";

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

export const startOctoplanServer = (options: {
  host: string;
  port: number;
  /** Real or fake Claude bridge dependencies; without them only hello/health work. */
  deps?: BridgeDeps;
}): Promise<OctoplanServer> => {
  const httpServer = createServer(handleRequest);
  const wss = new WebSocketServer({ server: httpServer, path: WS_PATH });
  const broadcast = (event: ServerEvent) => {
    for (const client of wss.clients) send(client, event);
  };
  const manager = options.deps ? createSessionManager(options.deps, broadcast) : null;

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
        manager.stop(event.sessionId);
        return;
      case "capture-idea":
        await manager.captureIdea(event.repoPath, event.title);
        return;
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
            for (const client of wss.clients) client.terminate();
            wss.close(() => httpServer.close(() => done()));
          }),
      });
    });
  });
};
