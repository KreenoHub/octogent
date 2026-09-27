import {
  PROTOCOL_VERSION,
  type ServerEvent,
  type TerminalServerMessage,
  parseServerEvent,
  terminalPath,
  terminalServerMessageSchema,
} from "@octogent/octoplan-protocol";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import {
  TERMINAL_MESSAGES,
  findOnWindowsPath,
  resolveClaudeLaunch,
  terminalEnv,
} from "../../server/bridge/popOut";
import type { BridgeDeps } from "../../server/bridge/types";
import { type OctoplanServer, startOctoplanServer } from "../../server/createServer";
import { NO_INTEGRATIONS_MESSAGE } from "../../server/planOps";
import { createFakePtyFactory, createFakeQuery, init, realDeps, tempRepo, until } from "./fakes";

const CLAUDE_ID = "3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

type Setup = { claudeId?: string | null; spawnPty?: boolean };

const startServer = async ({ claudeId = CLAUDE_ID, spawnPty = true }: Setup = {}) => {
  const repo = tempRepo();
  const fake = createFakeQuery(async function* ({ next }) {
    await next();
    if (claudeId) yield init(claudeId);
    await next();
  });
  const pty = createFakePtyFactory();
  const deps: BridgeDeps = {
    ...realDeps(fake.query),
    newId: () => "s1",
    ...(spawnPty ? { spawnPty: pty.spawnPty } : {}),
  };
  const server = await startOctoplanServer({ host: "127.0.0.1", port: 0, deps });
  cleanups.push(async () => {
    await server.close();
    repo.cleanup();
  });
  return { server, repo, pty };
};

const startSession = async (server: OctoplanServer, repoDir: string, claudeId: string | null) => {
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
  const events: ServerEvent[] = [];
  socket.on("message", (data) => {
    const event = parseServerEvent(data.toString());
    if (event) events.push(event);
  });
  await new Promise((resolve) => socket.on("open", resolve));
  cleanups.push(() => socket.close());
  socket.send(JSON.stringify({ type: "hello", protocolVersion: PROTOCOL_VERSION }));
  socket.send(
    JSON.stringify({ type: "start-session", repoPath: repoDir, mode: "quick-align", topic: "t" }),
  );
  await until(() =>
    events.some(
      (e) =>
        e.type === "session-updated" &&
        (claudeId ? e.session.claudeSessionId === claudeId : e.session.id === "s1"),
    ),
  );
  return { socket, events };
};

const openTerminal = async (server: OctoplanServer, sessionId: string) => {
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}${terminalPath(sessionId)}`);
  const messages: TerminalServerMessage[] = [];
  let closed = false;
  socket.on("message", (data) => {
    messages.push(terminalServerMessageSchema.parse(JSON.parse(data.toString())));
  });
  socket.on("close", () => {
    closed = true;
  });
  await new Promise((resolve, reject) => {
    socket.on("open", resolve);
    socket.on("error", reject);
  });
  cleanups.push(() => socket.close());
  return {
    socket,
    messages,
    isClosed: () => closed,
    send: (message: unknown) => socket.send(JSON.stringify(message)),
  };
};

describe("pop-out terminal socket", () => {
  it("spawns claude --resume in the session's repo and pipes data both ways", async () => {
    const { server, repo, pty } = await startServer();
    await startSession(server, repo.dir, CLAUDE_ID);
    const terminal = await openTerminal(server, "s1");

    await until(() => pty.spawns.length === 1);
    const spawn = pty.spawns[0];
    if (!spawn) throw new Error("no spawn");
    expect(spawn.options.cwd).toBe(repo.dir);
    expect(spawn.args.slice(-2)).toEqual(["--resume", CLAUDE_ID]);
    if (process.platform !== "win32") expect(spawn.file).toBe("claude");
    expect(spawn.options.env.CLAUDECODE).toBeUndefined();

    spawn.pty.emitData("Welcome back\r\n");
    await until(() => terminal.messages.length === 1);
    expect(terminal.messages[0]).toEqual({ type: "output", data: "Welcome back\r\n" });

    terminal.send({ type: "input", data: "hello\r" });
    terminal.send({ type: "resize", cols: 100, rows: 40 });
    terminal.send({ type: "resize", cols: 1, rows: 1 }); // out of range: ignored
    terminal.socket.send("not json");
    await until(() => spawn.pty.written.length === 1 && spawn.pty.resizes.length === 1);
    expect(spawn.pty.written).toEqual(["hello\r"]);
    expect(spawn.pty.resizes).toEqual([[100, 40]]);

    spawn.pty.emitExit(0);
    await until(() => terminal.isClosed());
    expect(terminal.messages.at(-1)).toEqual({ type: "exit", code: 0 });
    expect(spawn.pty.killed).toBe(false);
  });

  it("kills the PTY when the browser closes the socket", async () => {
    const { server, repo, pty } = await startServer();
    await startSession(server, repo.dir, CLAUDE_ID);
    const terminal = await openTerminal(server, "s1");
    await until(() => pty.spawns.length === 1);
    terminal.socket.close();
    await until(() => pty.spawns[0]?.pty.killed === true);
  });

  it("keeps /ws working next to the terminal channel", async () => {
    const { server, repo } = await startServer();
    const { socket, events } = await startSession(server, repo.dir, CLAUDE_ID);
    // Any /ws round-trip proves the planning socket still answers; this server has no
    // integrations, so request-graph replies with that explanation.
    socket.send(JSON.stringify({ type: "request-graph", repoPath: repo.dir }));
    await until(() =>
      events.some((e) => e.type === "error" && e.message === NO_INTEGRATIONS_MESSAGE),
    );
  });

  const expectRefusal = async (server: OctoplanServer, sessionId: string, message: string) => {
    const terminal = await openTerminal(server, sessionId);
    await until(() => terminal.isClosed());
    expect(terminal.messages).toEqual([{ type: "error", message }]);
  };

  it("refuses an unknown session", async () => {
    const { server, pty } = await startServer();
    await expectRefusal(server, "nope", TERMINAL_MESSAGES.unknown("nope"));
    expect(pty.spawns).toHaveLength(0);
  });

  it("refuses a session without a Claude session id", async () => {
    const { server, repo, pty } = await startServer({ claudeId: null });
    await startSession(server, repo.dir, null);
    await expectRefusal(server, "s1", TERMINAL_MESSAGES.noClaudeId);
    expect(pty.spawns).toHaveLength(0);
  });

  it("refuses when the server has no PTY factory", async () => {
    const { server, repo } = await startServer({ spawnPty: false });
    await startSession(server, repo.dir, CLAUDE_ID);
    await expectRefusal(server, "s1", TERMINAL_MESSAGES.noPty);
  });

  it("refuses a Claude session id that is not a UUID", async () => {
    const { server, repo, pty } = await startServer({ claudeId: "x & calc" });
    await startSession(server, repo.dir, "x & calc");
    const terminal = await openTerminal(server, "s1");
    await until(() => terminal.isClosed());
    expect(terminal.messages[0]?.type).toBe("error");
    expect(pty.spawns).toHaveLength(0);
  });

  it("refuses when the server runs without a bridge", async () => {
    const server = await startOctoplanServer({ host: "127.0.0.1", port: 0 });
    cleanups.push(() => server.close());
    await expectRefusal(server, "s1", TERMINAL_MESSAGES.noBridge);
  });
});

describe("resolving claude", () => {
  it("runs claude directly off Windows", () => {
    expect(resolveClaudeLaunch(CLAUDE_ID, { platform: "linux" })).toEqual({
      file: "claude",
      args: ["--resume", CLAUDE_ID],
    });
  });

  it("spawns a native claude.exe found on PATH directly", () => {
    const env = { Path: "C:\\tools;C:\\bin", PATHEXT: ".COM;.EXE;.CMD" };
    const launch = resolveClaudeLaunch(CLAUDE_ID, {
      platform: "win32",
      env,
      isFile: (p) => p.toLowerCase().endsWith("bin\\claude.exe"),
    });
    expect(launch.file.toLowerCase()).toMatch(/bin[\\/]claude\.exe$/);
    expect(launch.args).toEqual(["--resume", CLAUDE_ID]);
  });

  it("goes through cmd.exe for an npm .cmd shim or when claude isn't found", () => {
    const env = {
      PATH: "C:\\npm",
      PATHEXT: ".EXE;.CMD",
      ComSpec: "C:\\Windows\\system32\\cmd.exe",
    };
    const shim = resolveClaudeLaunch(CLAUDE_ID, {
      platform: "win32",
      env,
      isFile: (p) => p.endsWith("claude.cmd"),
    });
    expect(shim).toEqual({
      file: "C:\\Windows\\system32\\cmd.exe",
      args: ["/d", "/c", "claude", "--resume", CLAUDE_ID],
    });
    const missing = resolveClaudeLaunch(CLAUDE_ID, { platform: "win32", env, isFile: () => false });
    expect(missing.args).toEqual(["/d", "/c", "claude", "--resume", CLAUDE_ID]);
  });

  it("never puts a non-UUID on the command line", () => {
    expect(() => resolveClaudeLaunch('abc" & del *', { platform: "win32" })).toThrow(/malformed/);
  });

  it("finds commands in PATH order", () => {
    const found = findOnWindowsPath("claude", { PATH: "C:\\a;C:\\b", PATHEXT: ".EXE" }, (p) =>
      p.startsWith("C:\\b"),
    );
    expect(found?.startsWith("C:\\b")).toBe(true);
  });

  it("drops the nested-session marker from the terminal env", () => {
    const env = terminalEnv({ CLAUDECODE: "1", PATH: "x" });
    expect(env.CLAUDECODE).toBeUndefined();
    expect(env.PATH).toBe("x");
    expect(env.TERM).toBe("xterm-256color");
  });
});
