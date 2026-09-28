import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createIntegrations } from "../../server/integrations";
import {
  INSTALL_HINT,
  type OctogentLaunchDeps,
  launchOctogent,
  octogentStatus,
} from "../../server/integrations/octogentLaunch";
import {
  HEALTH_PATH,
  createApiAnswers,
  parseRuntime,
  readOctogentRuntime,
  runtimePath,
} from "../../server/integrations/octogentRuntime";
import type { TerminalLauncher } from "../../server/integrations/terminalLauncher";
import { createFakeExec, fail, ok } from "./fakeExec";
import { plainRepoGit } from "./workspaceFixture";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const tempDir = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

const PROJECT_ID = "82e17e87-9979-4a1a-8284-f685fd8cf624";

/** A workspace plus a fake ~/.octogent; `init()` writes project.json, `run()` a runtime.json. */
const setup = () => {
  const root = tempDir("octoplan-launch-ws-");
  const home = tempDir("octoplan-launch-home-");
  const init = () => {
    mkdirSync(join(root, ".octogent"), { recursive: true });
    writeFileSync(
      join(root, ".octogent", "project.json"),
      JSON.stringify({ version: 1, projectId: PROJECT_ID, displayName: "demo" }),
    );
  };
  const run = (port = 8791, pid = 4242) => {
    const file = runtimePath(home, PROJECT_ID);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(
      file,
      JSON.stringify({
        apiBaseUrl: `http://127.0.0.1:${port}`,
        host: "127.0.0.1",
        port,
        pid,
        startedAt: "2026-09-28T10:00:00.000Z",
        workspaceCwd: root,
      }),
    );
  };
  return { root, home, init, run };
};

type Knobs = {
  alive?: boolean;
  answers?: boolean;
  cli?: boolean;
  launchOk?: boolean;
  initCode?: number;
};

const makeDeps = (ws: ReturnType<typeof setup>, knobs: Knobs = {}) => {
  const launches: string[] = [];
  const { exec, calls } = createFakeExec({
    ...plainRepoGit(ws.root),
    "octogent init": (call) => {
      if ((knobs.initCode ?? 0) !== 0) return fail(knobs.initCode ?? 1, "init exploded");
      ws.init();
      return ok(`Initialized Octogent project "demo" at ${call.cwd}`);
    },
  });
  const launcher: TerminalLauncher = {
    launch: async (workspace) => {
      launches.push(workspace);
      return knobs.launchOk === false
        ? { ok: false, message: "Couldn't find a terminal to open." }
        : { ok: true, message: `Opened a terminal in ${workspace}.` };
    },
    manualCommand: (workspace) => `cd "${workspace}" && octogent`,
  };
  const deps: OctogentLaunchDeps = {
    exec,
    launcher,
    hasCommand: () => knobs.cli !== false,
    probe: {
      octogentHome: ws.home,
      isPidAlive: () => knobs.alive !== false,
      apiAnswers: async () => knobs.answers !== false,
    },
  };
  return { deps, calls, launches };
};

describe("Octogent runtime (D61)", () => {
  it("reads the state from project.json, runtime.json, the pid and the API", async () => {
    const ws = setup();
    const probe = (alive: boolean, answers: boolean) => ({
      octogentHome: ws.home,
      isPidAlive: () => alive,
      apiAnswers: async () => answers,
    });
    expect(await readOctogentRuntime(probe(true, true), ws.root)).toEqual({
      state: "not-initialized",
    });
    ws.init();
    expect((await readOctogentRuntime(probe(true, true), ws.root)).state).toBe("not-running");
    ws.run(8801);
    expect(await readOctogentRuntime(probe(true, true), ws.root)).toMatchObject({
      state: "running",
      runtime: { apiBaseUrl: "http://127.0.0.1:8801", port: 8801 },
    });
    expect((await readOctogentRuntime(probe(true, false), ws.root)).state).toBe("not-responding");
    // A stale runtime.json left by a crash: the pid is gone.
    expect((await readOctogentRuntime(probe(false, true), ws.root)).state).toBe("not-running");
  });

  it("rejects runtime.json files that aren't Octogent's shape", () => {
    expect(parseRuntime(null)).toBeNull();
    expect(
      parseRuntime({ apiBaseUrl: "http://x", port: "80", pid: 1, workspaceCwd: "/" }),
    ).toBeNull();
    expect(
      parseRuntime({ apiBaseUrl: "http://x:1/", port: 1, pid: 2, workspaceCwd: "/w" }),
    ).toEqual({ apiBaseUrl: "http://x:1", port: 1, pid: 2, workspaceCwd: "/w" });
  });

  it("checks health on the endpoint the Octogent CLI uses, and treats errors as down", async () => {
    const seen: string[] = [];
    const answers = createApiAnswers((async (url: string) => {
      seen.push(String(url));
      if (String(url).includes(":1")) throw new Error("ECONNREFUSED");
      return new Response("[]", { status: 200 });
    }) as typeof fetch);
    expect(await answers("http://127.0.0.1:8787")).toBe(true);
    expect(await answers("http://127.0.0.1:1")).toBe(false);
    expect(seen[0]).toBe(`http://127.0.0.1:8787${HEALTH_PATH}`);
  });
});

describe("launchOctogent (D58–D60)", () => {
  it("never starts a second instance when Octogent already runs (DOD8)", async () => {
    const ws = setup();
    ws.init();
    ws.run(8795);
    const { deps, calls, launches } = makeDeps(ws);
    const status = await launchOctogent(deps, ws.root);
    expect(status).toMatchObject({ state: "running", port: 8795, url: "http://127.0.0.1:8795" });
    expect(launches).toEqual([]);
    expect(calls.some((c) => c.command === "octogent")).toBe(false);
  });

  it("doesn't launch over a live process that isn't answering yet", async () => {
    const ws = setup();
    ws.init();
    ws.run();
    const { deps, launches } = makeDeps(ws, { answers: false });
    expect((await launchOctogent(deps, ws.root)).state).toBe("not-responding");
    expect(launches).toEqual([]);
  });

  it("runs `octogent init` first in an uninitialized workspace, then opens the terminal there", async () => {
    const ws = setup();
    const { deps, calls, launches } = makeDeps(ws);
    const status = await launchOctogent(deps, ws.root);
    expect(calls.filter((c) => c.command === "octogent")).toEqual([
      { command: "octogent", args: ["init"], cwd: ws.root },
    ]);
    expect(launches).toEqual([ws.root]);
    expect(status).toMatchObject({ state: "starting", workspace: ws.root, cliAvailable: true });
  });

  it("skips init when project.json exists", async () => {
    const ws = setup();
    ws.init();
    const { deps, calls, launches } = makeDeps(ws);
    expect((await launchOctogent(deps, ws.root)).state).toBe("starting");
    expect(calls.some((c) => c.command === "octogent")).toBe(false);
    expect(launches).toEqual([ws.root]);
  });

  it("reports a failed init and doesn't open a terminal", async () => {
    const ws = setup();
    const { deps, launches } = makeDeps(ws, { initCode: 2 });
    const status = await launchOctogent(deps, ws.root);
    expect(status.state).toBe("not-initialized");
    expect(status.message).toContain("init exploded");
    expect(launches).toEqual([]);
  });

  it("shows how to install when the CLI isn't on PATH", async () => {
    const ws = setup();
    const { deps, calls, launches } = makeDeps(ws, { cli: false });
    const status = await launchOctogent(deps, ws.root);
    expect(status).toMatchObject({ cliAvailable: false, message: INSTALL_HINT });
    expect(launches).toEqual([]);
    expect(calls.some((c) => c.command === "octogent")).toBe(false);
  });

  it("falls back to a command to copy when no terminal opens", async () => {
    const ws = setup();
    ws.init();
    const { deps } = makeDeps(ws, { launchOk: false });
    const status = await launchOctogent(deps, ws.root);
    expect(status.state).toBe("not-running");
    expect(status.manualCommand).toBe(`cd "${ws.root}" && octogent`);
  });

  it("status explains a missing setup before anything runs", async () => {
    const ws = setup();
    const { deps } = makeDeps(ws);
    const status = await octogentStatus(deps, ws.root);
    expect(status.state).toBe("not-initialized");
    expect(status.message).toContain("octogent init");
  });
});

describe("handoff deck URL (D61)", () => {
  it("links to the port from runtime.json, and to nothing when Octogent isn't running", async () => {
    const ws = setup();
    ws.init();
    const { exec } = createFakeExec({
      ...plainRepoGit(ws.root),
      "octogent tentacle create": fail(1, "Could not reach API"),
    });
    const integrations = createIntegrations({
      exec,
      octogentHome: ws.home,
      isPidAlive: () => true,
      apiAnswers: async () => true,
      hasCommand: () => true,
    });
    const input = {
      repoPath: ws.root,
      plan: {
        status: "draft" as const,
        generatedAt: "2026-09-28T10:00:00Z",
        source: "fallback" as const,
        workspace: ws.root,
        heading: "v3",
        octopusPrompt: "go",
        tentacles: [],
      },
      goal: null,
      decisions: [],
    };
    expect((await integrations.applyHandoff(input)).deckUrl).toBeUndefined();
    ws.run(8802);
    expect((await integrations.applyHandoff(input)).deckUrl).toBe("http://127.0.0.1:8802");
  });
});
