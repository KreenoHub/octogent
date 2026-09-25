import { PROTOCOL_VERSION, type ServerEvent, parseServerEvent } from "@octogent/octoplan-protocol";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import {
  NO_BRIDGE_MESSAGE,
  type OctoplanServer,
  startOctoplanServer,
} from "../../server/createServer";
import { createFakeQuery, init, realDeps, roundInput, tempRepo, until } from "./fakes";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const connect = async (server: OctoplanServer) => {
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
  const events: ServerEvent[] = [];
  socket.on("message", (data) => {
    const event = parseServerEvent(data.toString());
    if (event) events.push(event);
  });
  await new Promise((resolve) => socket.on("open", resolve));
  cleanups.push(() => socket.close());
  return { socket, events, send: (e: unknown) => socket.send(JSON.stringify(e)) };
};

describe("server with the Claude bridge", () => {
  it("starts a session over WebSocket and delivers the question round to the browser", async () => {
    const repo = tempRepo();
    const fake = createFakeQuery(async function* ({ next, askTool }) {
      await next();
      yield init("claude-ws");
      await askTool("AskUserQuestion", roundInput);
    });
    const server = await startOctoplanServer({
      host: "127.0.0.1",
      port: 0,
      deps: realDeps(fake.query),
    });
    cleanups.push(async () => {
      await server.close();
      repo.cleanup();
    });
    const client = await connect(server);
    client.send({ type: "hello", protocolVersion: PROTOCOL_VERSION });
    client.send({ type: "start-session", repoPath: repo.dir, mode: "deep-interview", topic: "ws" });
    await until(() => client.events.some((e) => e.type === "question-round"));
    expect(client.events.some((e) => e.type === "plan")).toBe(true);

    // A second browser (reload) gets the pending round replayed on hello.
    const second = await connect(server);
    second.send({ type: "hello", protocolVersion: PROTOCOL_VERSION });
    await until(() => second.events.some((e) => e.type === "question-round"));
  });

  it("explains that sessions need the bridge when started without deps", async () => {
    const server = await startOctoplanServer({ host: "127.0.0.1", port: 0 });
    cleanups.push(() => server.close());
    const client = await connect(server);
    client.send({ type: "start-session", repoPath: "C:/x", mode: "brainstorm", topic: "t" });
    await until(() => client.events.some((e) => e.type === "error"));
    expect(client.events.find((e) => e.type === "error")).toMatchObject({
      message: NO_BRIDGE_MESSAGE,
    });
  });
});
