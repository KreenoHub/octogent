import { describe, expect, it } from "vitest";
import {
  type LaunchSpec,
  appleScriptString,
  buildLaunchSpec,
  createTerminalLauncher,
  manualCommandFor,
  terminalEnv,
} from "../../server/integrations/terminalLauncher";

const none = () => false;

describe("buildLaunchSpec (D59)", () => {
  it("Windows: `start` a new console with fixed text; the workspace only ever goes in as cwd", () => {
    const spec = buildLaunchSpec("win32", "C:\\Users\\me\\My Project & co", none, {
      ComSpec: "C:\\Windows\\system32\\cmd.exe",
    });
    expect(spec).toEqual({
      file: "C:\\Windows\\system32\\cmd.exe",
      args: ["/d", "/s", "/c", 'start "Octogent" cmd.exe /d /k octogent'],
      verbatim: true,
      detached: false,
    });
    expect(spec?.args.join(" ")).not.toContain("My Project");
  });

  it("macOS: Terminal via osascript, with the path escaped for AppleScript and shell-quoted", () => {
    const spec = buildLaunchSpec("darwin", '/Users/me/a "b"\\c', none);
    expect(spec?.file).toBe("osascript");
    expect(spec?.args[1]).toBe(
      'tell application "Terminal" to do script "cd " & quoted form of "/Users/me/a \\"b\\"\\\\c" & " && octogent"',
    );
    expect(spec?.detached).toBe(true);
  });

  it("Linux: the first terminal on PATH, or null when there is none", () => {
    const has = (name: string) => name === "gnome-terminal" || name === "xterm";
    expect(buildLaunchSpec("linux", "/w", has)).toEqual({
      file: "gnome-terminal",
      args: ["--", "octogent"],
      detached: true,
    });
    expect(buildLaunchSpec("linux", "/w", none)).toBeNull();
  });
});

describe("terminal launcher", () => {
  it("spawns in the workspace without Octoplan's PORT, and reports spawn errors", async () => {
    const spawned: Array<{ spec: LaunchSpec; cwd: string; env: NodeJS.ProcessEnv }> = [];
    let fail = false;
    const launcher = createTerminalLauncher({
      platform: "win32",
      env: { PORT: "8790", PATH: "C:\\bin", ComSpec: "cmd.exe" },
      hasCommand: () => true,
      spawnDetached: async (spec, { cwd, env }) => {
        spawned.push({ spec, cwd, env });
        return fail ? { ok: false, error: "EACCES" } : { ok: true };
      },
    });
    expect(await launcher.launch("C:\\work\\demo")).toMatchObject({ ok: true });
    expect(spawned[0]?.cwd).toBe("C:\\work\\demo");
    expect(spawned[0]?.env).toEqual({ PATH: "C:\\bin", ComSpec: "cmd.exe" });
    fail = true;
    const result = await launcher.launch("C:\\work\\demo");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("EACCES");
  });

  it("says so when there's no terminal to open", async () => {
    const launcher = createTerminalLauncher({ platform: "linux", hasCommand: none });
    expect((await launcher.launch("/w")).ok).toBe(false);
    expect(launcher.manualCommand("/w")).toBe("cd '/w' && octogent");
  });
});

describe("helpers", () => {
  it("quotes manual commands for the platform's shell", () => {
    expect(manualCommandFor("win32", "C:\\a b")).toBe('cd /d "C:\\a b" && octogent');
    expect(manualCommandFor("linux", "/it's")).toBe("cd '/it'\\''s' && octogent");
  });

  it("escapes AppleScript strings and drops only PORT from the env", () => {
    expect(appleScriptString('a"b\\c')).toBe('a\\"b\\\\c');
    expect(terminalEnv({ PORT: "1", OCTOGENT_API_PORT: "2", HOME: "/h" })).toEqual({
      OCTOGENT_API_PORT: "2",
      HOME: "/h",
    });
  });
});
