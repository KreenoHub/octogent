// Pop-out terminal (D3, SPEC 3.5): `claude --resume <claudeSessionId>` in a PTY, streamed over
// its own socket (/ws/terminal/<sessionId>) so raw keystrokes never mix with planning events.
// Pattern read from apps/api/src/terminalRuntime (not imported): one PTY per socket, JSON frames.
//
// Windows: `claude` is usually an npm `.cmd` shim, which ConPTY can't start directly (CreateProcess
// runs only real executables). We look it up on PATH x PATHEXT ourselves: a real `.exe`/`.com`
// (the native installer) is spawned directly; anything else, including "not found", goes through
// `%ComSpec% /d /c claude --resume <id>` so cmd.exe does its own lookup. The only dynamic argument
// is the Claude session id, which must be a UUID (validated below), so nothing the browser sends
// ever reaches the command line.
import { statSync } from "node:fs";
import { win32 } from "node:path";
import {
  type Session,
  type TerminalServerMessage,
  terminalClientMessageSchema,
} from "@octogent/octoplan-protocol";
import type { PtyFactory, PtyProcess } from "./types";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DEFAULT_COLS = 120;
export const DEFAULT_ROWS = 32;

export type ClaudeLaunch = { file: string; args: string[] };

type LaunchEnv = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  isFile?: (path: string) => boolean;
};

const defaultIsFile = (path: string) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

/** Windows env names are case-insensitive (`Path` vs `PATH`). */
const envValue = (env: NodeJS.ProcessEnv, name: string) => {
  const key = Object.keys(env).find((k) => k.toUpperCase() === name);
  return key ? env[key] : undefined;
};

/** Finds `claude` the way cmd.exe would: each PATH folder, each PATHEXT extension. */
export const findOnWindowsPath = (
  command: string,
  env: NodeJS.ProcessEnv,
  isFile: (path: string) => boolean = defaultIsFile,
) => {
  const dirs = (envValue(env, "PATH") ?? "").split(";").filter(Boolean);
  const exts = (envValue(env, "PATHEXT") ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean);
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = win32.join(dir.replace(/^"(.*)"$/, "$1"), `${command}${ext.toLowerCase()}`);
      if (isFile(candidate)) return candidate;
    }
  }
  return null;
};

export const resolveClaudeLaunch = (
  claudeSessionId: string,
  { platform = process.platform, env = process.env, isFile = defaultIsFile }: LaunchEnv = {},
): ClaudeLaunch => {
  if (!UUID_RE.test(claudeSessionId)) {
    throw new Error(`Refusing to resume a malformed Claude session id: ${claudeSessionId}`);
  }
  const args = ["--resume", claudeSessionId];
  if (platform !== "win32") return { file: "claude", args };
  const found = findOnWindowsPath("claude", env, isFile);
  if (found && /\.(exe|com)$/i.test(found)) return { file: found, args };
  const shell = envValue(env, "COMSPEC") || "cmd.exe";
  return { file: shell, args: ["/d", "/c", "claude", ...args] };
};

/** Env for the pop-out: drop the nested-session marker so `claude` doesn't refuse to start. */
export const terminalEnv = (env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv => {
  const next: NodeJS.ProcessEnv = { ...env, TERM: "xterm-256color", COLORTERM: "truecolor" };
  for (const key of Object.keys(next)) {
    if (key.toUpperCase() === "CLAUDECODE") delete next[key];
  }
  return next;
};

/** The slice of a `ws` socket the terminal channel needs. */
export type TerminalSocket = {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: "message", listener: (data: { toString(): string }) => void): unknown;
  on(event: "close", listener: () => void): unknown;
};

const OPEN = 1;

export const TERMINAL_MESSAGES = {
  noBridge: "This Octoplan server was started without a Claude bridge, so there is no terminal.",
  noPty: "The pop-out terminal is not enabled on this server.",
  unknown: (id: string) => `Unknown session ${id}.`,
  noClaudeId:
    "This session has no Claude session id yet. Wait for Claude's first reply, then pop out again.",
};

export type AttachTerminalInput = {
  socket: TerminalSocket;
  sessionId: string;
  session: Session | undefined | null;
  spawnPty: PtyFactory | undefined;
  /** Refuse before looking anything up (e.g. the server has no bridge). */
  refusal?: string;
  resolveLaunch?: (claudeSessionId: string) => ClaudeLaunch;
  env?: NodeJS.ProcessEnv;
};

/** Wires one terminal socket to a fresh PTY; returns the PTY, or null when it refused. */
export const attachTerminal = ({
  socket,
  sessionId,
  session,
  spawnPty,
  refusal,
  resolveLaunch = resolveClaudeLaunch,
  env,
}: AttachTerminalInput): PtyProcess | null => {
  const send = (message: TerminalServerMessage) => {
    if (socket.readyState === OPEN) socket.send(JSON.stringify(message));
  };
  const refuse = (message: string) => {
    send({ type: "error", message });
    socket.close(1008, "refused");
    return null;
  };
  if (refusal) return refuse(refusal);
  if (!spawnPty) return refuse(TERMINAL_MESSAGES.noPty);
  if (!session) return refuse(TERMINAL_MESSAGES.unknown(sessionId));
  if (!session.claudeSessionId) return refuse(TERMINAL_MESSAGES.noClaudeId);

  let pty: PtyProcess;
  try {
    const launch = resolveLaunch(session.claudeSessionId);
    pty = spawnPty(launch.file, launch.args, {
      cwd: session.repoPath,
      cols: DEFAULT_COLS,
      rows: DEFAULT_ROWS,
      env: terminalEnv(env),
    });
  } catch (error) {
    return refuse(
      `Could not start claude: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let exited = false;
  pty.onData((data) => send({ type: "output", data }));
  pty.onExit(({ exitCode }) => {
    exited = true;
    send({ type: "exit", code: Number.isInteger(exitCode) ? exitCode : null });
    socket.close(1000, "exited");
  });
  socket.on("message", (raw) => {
    let json: unknown;
    try {
      json = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const parsed = terminalClientMessageSchema.safeParse(json);
    if (!parsed.success || exited) return;
    if (parsed.data.type === "input") pty.write(parsed.data.data);
    else pty.resize(parsed.data.cols, parsed.data.rows);
  });
  socket.on("close", () => {
    if (exited) return;
    exited = true;
    try {
      pty.kill();
    } catch {
      // Already gone.
    }
  });
  return pty;
};
