import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { PROTOCOL_VERSION, type ServerEvent, parseClientEvent } from "@octogent/octoplan-protocol";
import { WebSocket, WebSocketServer } from "ws";

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

export const startOctoplanServer = (options: {
  host: string;
  port: number;
}): Promise<OctoplanServer> => {
  const httpServer = createServer(handleRequest);
  const wss = new WebSocketServer({ server: httpServer, path: WS_PATH });

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
      if (event.type === "hello") {
        send(socket, { type: "sessions", sessions: [] });
        return;
      }
      // Session handling lands with the bridge tentacle.
      send(socket, { type: "error", message: `Not implemented yet: ${event.type}` });
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
            for (const client of wss.clients) client.terminate();
            wss.close(() => httpServer.close(() => done()));
          }),
      });
    });
  });
};
