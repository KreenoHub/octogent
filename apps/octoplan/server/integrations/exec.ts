// Production Exec: node:child_process.execFile with an argument array, never `shell: true`.
//
// Windows note. Since Node's fix for CVE-2024-27980, execFile refuses to launch `.cmd` / `.bat`
// files without a shell, and a shell would re-parse arguments (branch names, descriptions) as
// cmd.exe syntax. npm/pnpm install CLIs such as `octogent` as `.cmd` shims, so we resolve the
// command ourselves, walking PATH x PATHEXT like cmd.exe does:
//   1. `.exe` / `.com`            -> execFile the binary directly.
//   2. an npm/pnpm `.cmd` shim    -> read the shim, find the script it forwards `%*` to, and run
//                                    `<current node> <script> ...args`. No shell is involved, so
//                                    every argument reaches the script byte-for-byte.
//   3. any other `.cmd` / `.bat`  -> run through `cmd.exe /d /s /c` ONLY when every argument is in
//                                    a small inert charset (no spaces, quotes, &|<>^%!() etc.);
//                                    otherwise refuse with a clear error instead of quoting.
// `gh` and `git` normally ship as `.exe` on Windows and take path 1.
import { execFile } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { Exec, ExecResult } from "./types";

export const EXEC_TIMEOUT_MS = 20_000;
const MAX_BUFFER = 32 * 1024 * 1024;

export type ResolvedCommand =
  | { file: string; args: string[]; verbatim?: boolean }
  | { error: string; notFound?: boolean };

export type ResolveOptions = {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  nodePath: string;
};

const envValue = (env: ResolveOptions["env"], name: string): string | undefined => {
  const key = Object.keys(env).find((k) => k.toUpperCase() === name.toUpperCase());
  return key === undefined ? undefined : env[key];
};

const isFile = (candidate: string): boolean => {
  try {
    return existsSync(candidate) && statSync(candidate).isFile();
  } catch {
    return false;
  }
};

/**
 * Finds the script an npm (`"%dp0%\...\bin\x" %*`) or pnpm (`"%~dp0\..\x\bin\x.js" %*`) shim
 * forwards its arguments to. Returns an absolute path, or null when the file is not a shim.
 */
export const parseCmdShim = (content: string, shimDir: string): string | null => {
  const pattern = /"(%~?dp0%?[\\/][^"]+)"\s+%\*/g;
  for (const match of content.matchAll(pattern)) {
    const raw = match[1] as string;
    const relative = raw.replace(/^%~?dp0%?[\\/]/, "");
    if (/(^|[\\/])node(\.exe)?$/i.test(relative)) continue;
    return path.win32.resolve(shimDir, relative);
  }
  return null;
};

/** Characters cmd.exe treats literally in every position (used only for the batch fallback). */
export const isCmdSafeArg = (arg: string): boolean => /^[A-Za-z0-9_\-.,:=@+/\\]+$/.test(arg);

export const resolveCommand = (
  command: string,
  args: readonly string[],
  options: ResolveOptions,
): ResolvedCommand => {
  if (options.platform !== "win32") return { file: command, args: [...args] };

  const win = path.win32;
  const pathExts = (envValue(options.env, "PATHEXT") ?? ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((ext) => ext.trim().toLowerCase())
    .filter((ext) => ext.length > 0);
  const hasExt = win.extname(command) !== "";
  const hasDir = /[\\/]/.test(command);
  const dirs = hasDir
    ? [""]
    : (envValue(options.env, "PATH") ?? "")
        .split(";")
        .map((dir) => dir.trim().replace(/^"(.*)"$/, "$1"))
        .filter((dir) => dir.length > 0);
  const names = hasExt ? [command] : pathExts.map((ext) => `${command}${ext}`);

  for (const dir of dirs) {
    for (const name of names) {
      const candidate = dir ? win.join(dir, name) : name;
      if (!isFile(candidate)) continue;
      const ext = win.extname(candidate).toLowerCase();
      if (ext !== ".cmd" && ext !== ".bat") return { file: candidate, args: [...args] };

      const script = parseCmdShim(readFileSync(candidate, "utf8"), win.dirname(candidate));
      if (script && isFile(script)) {
        return /\.(exe|com)$/i.test(script)
          ? { file: script, args: [...args] }
          : { file: options.nodePath, args: [script, ...args] };
      }
      const unsafe = args.find((arg) => !isCmdSafeArg(arg));
      if (unsafe !== undefined) {
        return {
          error: `refusing to pass ${JSON.stringify(unsafe)} to ${candidate} through cmd.exe`,
        };
      }
      const comspec = envValue(options.env, "ComSpec") ?? "cmd.exe";
      // /s strips the outer quotes; the path came from PATH, the args passed isCmdSafeArg.
      return {
        file: comspec,
        args: ["/d", "/s", "/c", `""${candidate}" ${args.join(" ")}"`],
        verbatim: true,
      };
    }
  }
  return { error: `command not found: ${command}`, notFound: true };
};

export type NodeExecOptions = {
  timeoutMs?: number;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  nodePath?: string;
};

/**
 * Never rejects: a missing command resolves with code 127, a timeout with 124, and any other
 * spawn error with code 1 and the message on stderr.
 */
export const createNodeExec = (options: NodeExecOptions = {}): Exec => {
  const timeout = options.timeoutMs ?? EXEC_TIMEOUT_MS;
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const nodePath = options.nodePath ?? process.execPath;

  return (command, args, cwd) =>
    new Promise<ExecResult>((resolve) => {
      const resolved = resolveCommand(command, args, { platform, env, nodePath });
      if ("error" in resolved) {
        resolve({ code: resolved.notFound ? 127 : 1, stdout: "", stderr: resolved.error });
        return;
      }
      execFile(
        resolved.file,
        resolved.args,
        {
          cwd,
          env,
          timeout,
          maxBuffer: MAX_BUFFER,
          windowsHide: true,
          windowsVerbatimArguments: resolved.verbatim === true,
          encoding: "utf8",
        },
        (error, stdout, stderr) => {
          if (!error) {
            resolve({ code: 0, stdout, stderr });
            return;
          }
          const err = error as NodeJS.ErrnoException & { killed?: boolean; code?: unknown };
          if (err.code === "ENOENT") {
            resolve({ code: 127, stdout, stderr: `command not found: ${command}` });
          } else if (err.killed) {
            resolve({
              code: 124,
              stdout,
              stderr: `${stderr}\n${command} timed out after ${Math.round(timeout / 1000)} s`,
            });
          } else {
            resolve({
              code: typeof err.code === "number" ? err.code : 1,
              stdout,
              stderr: stderr || err.message,
            });
          }
        },
      );
    });
};
