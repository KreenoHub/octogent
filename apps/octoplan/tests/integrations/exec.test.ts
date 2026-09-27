// Command resolution for the production Exec. Only the resolver is tested: nothing is spawned.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, win32 } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isCmdSafeArg, parseCmdShim, resolveCommand } from "../../server/integrations/exec";

const NPM_SHIM = `@ECHO off
GOTO start
:find_dp0
SET dp0=%~dp0
EXIT /b
:start
SETLOCAL
CALL :find_dp0

IF EXIST "%dp0%\\node.exe" (
  SET "_prog=%dp0%\\node.exe"
) ELSE (
  SET "_prog=node"
  SET PATHEXT=%PATHEXT:;.JS;=;%
)

endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\octogent\\bin\\octogent" %*
`;

const PNPM_SHIM = `@SETLOCAL
@IF EXIST "%~dp0\\node.exe" (
  "%~dp0\\node.exe"  "%~dp0\\..\\tool\\bin\\tool.js" %*
) ELSE (
  @SET PATHEXT=%PATHEXT:;.JS;=;%
  node  "%~dp0\\..\\tool\\bin\\tool.js" %*
)
`;

describe("parseCmdShim", () => {
  it("finds the script behind an npm shim", () => {
    expect(parseCmdShim(NPM_SHIM, "C:\\npm")).toBe(
      win32.resolve("C:\\npm\\node_modules\\octogent\\bin\\octogent"),
    );
  });
  it("finds the script behind a pnpm shim", () => {
    expect(parseCmdShim(PNPM_SHIM, "C:\\pnpm\\bin")).toBe(
      win32.resolve("C:\\pnpm\\tool\\bin\\tool.js"),
    );
  });
  it("returns null for an arbitrary batch file", () => {
    expect(parseCmdShim("@echo off\r\necho %1\r\n", "C:\\x")).toBeNull();
  });
});

describe("isCmdSafeArg", () => {
  it("only allows arguments that cmd.exe cannot reinterpret", () => {
    expect(isCmdSafeArg("--json")).toBe(true);
    expect(isCmdSafeArg("number,title,url")).toBe(true);
    expect(isCmdSafeArg("C:\\repo\\x")).toBe(true);
    for (const bad of ["a b", "a&b", "a|b", "%PATH%", "a^b", 'a"b', "a>b", "a!b", "(x)", ""]) {
      expect(isCmdSafeArg(bad)).toBe(false);
    }
  });
});

describe("resolveCommand on Windows", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "octoplan-exec-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const env = () => ({ Path: dir, PATHEXT: ".COM;.EXE;.BAT;.CMD" });

  it("prefers an .exe on PATH and runs it directly", () => {
    writeFileSync(join(dir, "gh.exe"), "");
    writeFileSync(join(dir, "gh.cmd"), NPM_SHIM);
    const resolved = resolveCommand("gh", ["pr", "list"], {
      platform: "win32",
      env: env(),
      nodePath: "C:\\node\\node.exe",
    });
    expect(resolved).toEqual({ file: join(dir, "gh.exe"), args: ["pr", "list"] });
  });

  it("runs an npm .cmd shim's script with node, passing arguments untouched", () => {
    writeFileSync(join(dir, "octogent.cmd"), NPM_SHIM);
    const script = join(dir, "node_modules", "octogent", "bin", "octogent");
    mkdirSync(join(dir, "node_modules", "octogent", "bin"), { recursive: true });
    writeFileSync(script, "#!/usr/bin/env node\n");
    const args = ["tentacle", "create", "x", "--description", 'a & b | "c" %PATH%'];
    const resolved = resolveCommand("octogent", args, {
      platform: "win32",
      env: env(),
      nodePath: "C:\\node\\node.exe",
    });
    expect(resolved).toEqual({
      file: "C:\\node\\node.exe",
      args: [win32.resolve(script), ...args],
    });
  });

  it("uses cmd.exe for an unknown batch file only when every argument is inert", () => {
    writeFileSync(join(dir, "tool.bat"), "@echo off\r\necho %*\r\n");
    const opts = { platform: "win32" as const, env: env(), nodePath: "node" };
    const safe = resolveCommand("tool", ["--json", "state"], opts);
    expect(safe).toMatchObject({ file: "cmd.exe", verbatim: true });
    const unsafe = resolveCommand("tool", ["a & calc"], opts);
    expect(unsafe).toMatchObject({ error: expect.stringMatching(/refusing/i) });
  });

  it("reports a command that is not on PATH", () => {
    expect(resolveCommand("nope", [], { platform: "win32", env: env(), nodePath: "n" })).toEqual({
      error: "command not found: nope",
      notFound: true,
    });
  });

  it("passes commands straight to execFile on other platforms", () => {
    expect(resolveCommand("gh", ["pr"], { platform: "linux", env: {}, nodePath: "n" })).toEqual({
      file: "gh",
      args: ["pr"],
    });
  });
});
