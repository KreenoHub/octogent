// D59: open a visible terminal running `octogent` in the workspace. Octoplan doesn't own that
// process: it outlives Octoplan and has no Stop button. The workspace always goes in as the
// child's cwd, never on a command line, so no path is ever re-parsed by a shell. On macOS the
// path has to go through AppleScript, where it's escaped and then shell-quoted by `quoted form`.
import { spawn } from "node:child_process";
import { constants, accessSync, statSync } from "node:fs";
import path from "node:path";
import { resolveCommand } from "./exec";

export type LaunchSpec = {
  file: string;
  args: string[];
  /** Windows only: pass `args` as one pre-quoted command line (fixed text, no user input). */
  verbatim?: boolean;
  /** POSIX: detach so the terminal survives Octoplan. Windows `start` already does that. */
  detached: boolean;
};

export type LaunchResult = { ok: true; message: string } | { ok: false; message: string };

export type SpawnDetached = (
  spec: LaunchSpec,
  options: { cwd: string; env: NodeJS.ProcessEnv },
) => Promise<{ ok: true } | { ok: false; error: string }>;

export type TerminalLauncher = {
  /** Opens a terminal running `octogent` in `workspace`; never throws. */
  launch(workspace: string): Promise<LaunchResult>;
  /** What to run by hand when `launch` can't open a terminal. */
  manualCommand(workspace: string): string;
};

export type TerminalLauncherDeps = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  hasCommand?: (name: string) => boolean;
  spawnDetached?: SpawnDetached;
};

const OCTOGENT = "octogent";

/** Linux terminals in order of preference, with the flag that runs a command in them. */
export const LINUX_TERMINALS: ReadonlyArray<{ file: string; args: string[] }> = [
  { file: "x-terminal-emulator", args: ["-e", OCTOGENT] },
  { file: "gnome-terminal", args: ["--", OCTOGENT] },
  { file: "konsole", args: ["-e", OCTOGENT] },
  { file: "xterm", args: ["-e", OCTOGENT] },
];

/** A string literal body for AppleScript: backslashes and double quotes escaped. */
export const appleScriptString = (text: string): string =>
  text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/** How to open the terminal on this platform, or null when there's no known way. */
export const buildLaunchSpec = (
  platform: NodeJS.Platform,
  workspace: string,
  hasCommand: (name: string) => boolean,
  env: NodeJS.ProcessEnv = {},
): LaunchSpec | null => {
  if (platform === "win32") {
    // `start` opens a new console window (Windows Terminal when it's the default terminal);
    // its first quoted argument is the window title. The cwd carries the workspace.
    return {
      file: env.ComSpec ?? env.COMSPEC ?? "cmd.exe",
      args: ["/d", "/s", "/c", `start "Octogent" cmd.exe /d /k ${OCTOGENT}`],
      verbatim: true,
      detached: false,
    };
  }
  if (platform === "darwin") {
    const script = `tell application "Terminal" to do script "cd " & quoted form of "${appleScriptString(
      workspace,
    )}" & " && ${OCTOGENT}"`;
    return {
      file: "osascript",
      args: ["-e", script, "-e", 'tell application "Terminal" to activate'],
      detached: true,
    };
  }
  const terminal = LINUX_TERMINALS.find((candidate) => hasCommand(candidate.file));
  return terminal ? { file: terminal.file, args: [...terminal.args], detached: true } : null;
};

export const manualCommandFor = (platform: NodeJS.Platform, workspace: string): string =>
  platform === "win32"
    ? `cd /d "${workspace}" && ${OCTOGENT}`
    : `cd '${workspace.replace(/'/g, "'\\''")}' && ${OCTOGENT}`;

const isExecutable = (candidate: string): boolean => {
  try {
    if (!statSync(candidate).isFile()) return false;
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

/** True when `name` resolves on PATH the way the terminal (or execFile) would find it. */
export const createHasCommand =
  (platform: NodeJS.Platform, env: NodeJS.ProcessEnv) =>
  (name: string): boolean => {
    if (platform === "win32") {
      const resolved = resolveCommand(name, [], { platform, env, nodePath: process.execPath });
      return !("error" in resolved && resolved.notFound);
    }
    return (env.PATH ?? "")
      .split(path.delimiter)
      .filter(Boolean)
      .some((dir) => isExecutable(path.join(dir, name)));
  };

export const nodeSpawnDetached: SpawnDetached = (spec, { cwd, env }) =>
  new Promise((resolve) => {
    try {
      const child = spawn(spec.file, spec.args, {
        cwd,
        env,
        stdio: "ignore",
        detached: spec.detached,
        // Hides only the launcher's own console; `start` still opens its window.
        windowsHide: true,
        windowsVerbatimArguments: spec.verbatim === true,
      });
      child.once("error", (error) => resolve({ ok: false, error: error.message }));
      child.once("spawn", () => {
        child.unref();
        resolve({ ok: true });
      });
    } catch (error) {
      resolve({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

/** Octoplan's own env minus what would steer Octogent onto Octoplan's port. */
export const terminalEnv = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  const { PORT: _port, ...rest } = env;
  return rest;
};

export const createTerminalLauncher = (deps: TerminalLauncherDeps = {}): TerminalLauncher => {
  const platform = deps.platform ?? process.platform;
  const env = deps.env ?? process.env;
  const hasCommand = deps.hasCommand ?? createHasCommand(platform, env);
  const spawnDetached = deps.spawnDetached ?? nodeSpawnDetached;

  return {
    manualCommand: (workspace) => manualCommandFor(platform, workspace),
    launch: async (workspace) => {
      const spec = buildLaunchSpec(platform, workspace, hasCommand, env);
      if (!spec) {
        return {
          ok: false,
          message: "Couldn't find a terminal to open. Run this in a terminal yourself:",
        };
      }
      const result = await spawnDetached(spec, { cwd: workspace, env: terminalEnv(env) });
      return result.ok
        ? { ok: true, message: `Opened a terminal running octogent in ${workspace}.` }
        : {
            ok: false,
            message: `Couldn't open a terminal (${result.error}). Run this in a terminal yourself:`,
          };
    },
  };
};
