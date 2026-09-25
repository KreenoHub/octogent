import { PROTOCOL_VERSION, type ServerEvent, parseServerEvent } from "@octogent/octoplan-protocol";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { type OctoplanServer, startOctoplanServer } from "../server/createServer";

let server: OctoplanServer | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
});

const start = async () => {
  server = await startOctoplanServer({ host: "127.0.0.1", port: 0 });
  return server.port;
};

const collectEvents = (port: number, send: unknown[], count: number) =>
  new Promise<ServerEvent[]>((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const events: ServerEvent[] = [];
    socket.on("open", () => {
      for (const message of send)
        socket.send(typeof message === "string" ? message : JSON.stringify(message));
    });
    socket.on("message", (data) => {
      const event = parseServerEvent(data.toString());
      if (event) events.push(event);
      if (events.length >= count) {
        socket.close();
        resolve(events);
      }
    });
    socket.on("error", reject);
  });

describe("octoplan server", () => {
  it("serves the health endpoint", async () => {
    const port = await start();
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      name: "octoplan",
      protocolVersion: PROTOCOL_VERSION,
    });
  });

  it("returns 404 for unknown routes", async () => {
    const port = await start();
    expect((await fetch(`http://127.0.0.1:${port}/api/nope`)).status).toBe(404);
  });

  it("greets websocket clients with a typed hello and answers client hello", async () => {
    const port = await start();
    const events = await collectEvents(
      port,
      [{ type: "hello", protocolVersion: PROTOCOL_VERSION }],
      2,
    );
    expect(events[0]).toMatchObject({ type: "hello", protocolVersion: PROTOCOL_VERSION });
    expect(events[1]).toEqual({ type: "sessions", sessions: [] });
  });

  it("rejects malformed client events", async () => {
    const port = await start();
    const events = await collectEvents(port, ["{broken"], 2);
    expect(events[1]).toMatchObject({ type: "error", message: "Malformed client event." });
  });
});
