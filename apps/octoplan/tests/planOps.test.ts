import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ConversationBranch,
  GitGraph,
  OctogentStatus,
  ServerEvent,
} from "@octogent/octoplan-protocol";
import { afterEach, describe, expect, it } from "vitest";
import type { Integrations } from "../server/integrations/types";
import { applyIdeaAction, buildStages } from "../server/modes";
import { NO_GOAL_MESSAGE, NO_INTEGRATIONS_MESSAGE, createPlanOps } from "../server/planOps";
import { createFsPlanStore } from "../server/store/fsPlanStore";
import type { IdeaRegistry, PlanStore } from "../server/store/types";

/** v2 members a wave-2 test doesn't exercise. */
const v2Unused: Omit<Integrations, "exportToTentacle" | "buildGraph"> = {
  resolveWorkspace: async (repoPath) => repoPath,
  tentacleSummaries: async () => [],
  computeDrift: async () => [],
  readHarvestInputs: async () => ({ headSha: null, commits: [], todos: [] }),
  existingTentacles: async () => [],
  applyHandoff: async () => {
    throw new Error("unused");
  },
  octogentStatus: async () => {
    throw new Error("unused");
  },
  launchOctogent: async () => {
    throw new Error("unused");
  },
  createProject: async () => {
    throw new Error("unused");
  },
  ensureGitRepo: async () => null,
};

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const setup = (
  extra: {
    integrations?: Integrations;
    ideaRegistry?: IdeaRegistry;
    launchPoll?: { intervalMs: number; timeoutMs: number };
    sleep?: (ms: number) => Promise<void>;
  } = {},
) => {
  const dir = mkdtempSync(join(tmpdir(), "octoplan-planops-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const stores = new Map<string, PlanStore>();
  const storeFor = (repoPath: string) => {
    const existing = stores.get(repoPath);
    if (existing) return existing;
    const store = createFsPlanStore(repoPath, { debounceMs: 20 });
    stores.set(repoPath, store);
    return store;
  };
  const events: ServerEvent[] = [];
  const ops = createPlanOps({
    storeFor,
    broadcast: (e) => events.push(e),
    applyIdeaAction,
    buildStages,
    ...extra,
  });
  return { dir, store: storeFor(dir), ops, events };
};

const idea = (title: string) => ({
  title,
  body: "",
  tags: ["ux"],
  date: "2026-09-27",
  status: "inbox" as const,
});

describe("plan ops", () => {
  it("applies brainstorm actions through the modes rules and reports illegal ones", async () => {
    const { dir, store, ops, events } = setup();
    const a = await store.addIdea(idea("Voice answers"));
    const b = await store.addIdea(idea("Voice notes"));
    await ops.updateIdea(dir, a.id, "star");
    await ops.updateIdea(dir, b.id, "merge", a.id);
    await ops.updateIdea(dir, a.id, "reopen");
    const ideas = (await store.snapshot()).ideas;
    expect(ideas.find((i) => i.id === a.id)?.status).toBe("starred");
    expect(ideas.find((i) => i.id === b.id)?.status).toBe("merged");
    expect(events.filter((e) => e.type === "notice").map((e) => e.message)).toEqual([
      `${a.id} starred`,
      `Merged ${b.id} into ${a.id}`,
    ]);
    expect(events.at(-1)).toMatchObject({ type: "error" });
  });

  it("searches ideas across the registry and this run's repos", async () => {
    const other = setup();
    const otherIdea = await other.store.addIdea(idea("Offline sync"));
    const registry: IdeaRegistry = {
      listRepos: async () => [],
      registerRepo: async () => {},
      searchIdeas: async () => [{ repoPath: other.dir, idea: otherIdea }],
    };
    const { dir, store, ops } = setup({ ideaRegistry: registry });
    await store.addIdea(idea("Offline export"));
    await ops.registerRepo(dir);
    const replies: ServerEvent[] = [];
    await ops.searchIdeas("offline", (e) => replies.push(e));
    const reply = replies[0];
    expect(reply?.type === "ideas" ? reply.results.map((r) => r.idea.title).sort() : []).toEqual([
      "Offline export",
      "Offline sync",
    ]);
  });

  it("generates stages from GOAL.md, and asks for a goal first when there is none", async () => {
    const { dir, store, ops, events } = setup();
    await ops.generateStages(dir);
    expect(events.at(-1)).toEqual({ type: "error", message: NO_GOAL_MESSAGE });
    await store.writeGoal({
      title: "Habit CLI",
      why: "Streaks keep habits.",
      goals: ["Log a habit"],
      nonGoals: [],
      done: [
        {
          id: "DOD1",
          text: "`habit log read` runs and shows today marked",
          status: "unknown",
          evidence: "",
        },
        { id: "DOD2", text: "`pnpm test` passes", status: "unknown", evidence: "" },
      ],
    });
    await ops.generateStages(dir);
    const stagesEvent = events.find((e) => e.type === "stages");
    expect(stagesEvent?.type === "stages" ? stagesEvent.stages.length : 0).toBeGreaterThanOrEqual(
      2,
    );
    expect(readdirSync(join(dir, "docs", "plan", "stages")).sort()[0]).toBe("STAGE-1.md");
  });

  it("exports to a tentacle with active decisions only, or explains that integrations are off", async () => {
    const off = setup();
    await off.ops.exportTentacle(off.dir, "habit-cli", ["a"]);
    expect(off.events.at(-1)).toMatchObject({ ok: false, message: NO_INTEGRATIONS_MESSAGE });

    const calls: unknown[] = [];
    const integrations: Integrations = {
      ...v2Unused,
      exportToTentacle: async (input) => {
        calls.push(input);
        return { ok: true, message: "Exported 1 task" };
      },
      buildGraph: async () => {
        throw new Error("unused");
      },
    };
    const { dir, store, ops, events } = setup({ integrations });
    const kept = await store.upsertDecision({
      title: "Keep",
      body: "",
      source: "t",
      questionIds: [],
      dependsOn: [],
    });
    const stale = await store.upsertDecision({
      title: "Old",
      body: "",
      source: "t",
      questionIds: [],
      dependsOn: [],
    });
    await store.markDecisionsStale([stale.id]);
    await ops.exportTentacle(dir, "habit-cli", ["Log a habit. Done when `habit log` runs."]);
    expect(events.at(-1)).toMatchObject({
      type: "export-result",
      ok: true,
      tentacleId: "habit-cli",
    });
    expect((calls[0] as { decisions: { id: string }[] }).decisions.map((d) => d.id)).toEqual([
      kept.id,
    ]);
  });

  it("builds the graph with the repo's conversation branches and links a branch", async () => {
    let seen: readonly ConversationBranch[] = [];
    const integrations: Integrations = {
      ...v2Unused,
      exportToTentacle: async () => ({ ok: true, message: "" }),
      buildGraph: async (repoPath, branches) => {
        seen = branches;
        const graph: GitGraph = {
          repoPath,
          commits: [],
          branches: [],
          prs: [],
          lanes: [],
          conversationBranches: [...branches],
          ghAvailable: false,
        };
        return graph;
      },
    };
    const { dir, store, ops, events } = setup({ integrations });
    const branch = await store.upsertBranch({
      title: "What if SQLite?",
      sessionId: "s2",
      parentSessionId: "s1",
      status: "exploring",
      body: "",
    });
    await ops.linkBranch(dir, branch.id, "octoplan/sqlite-spike");
    const replies: ServerEvent[] = [];
    await ops.requestGraph(dir, (e) => replies.push(e));
    expect(seen[0]?.gitBranch).toBe("octoplan/sqlite-spike");
    expect(replies[0]).toMatchObject({ type: "graph" });
    expect(events.find((e) => e.type === "notice")).toMatchObject({
      message: `Linked ${branch.id} to octoplan/sqlite-spike`,
    });
  });
});

describe("Run Octogent (D58–D61)", () => {
  const status = (state: OctogentStatus["state"], extra: Partial<OctogentStatus> = {}) =>
    ({
      repoPath: "ignored",
      workspace: "/ws",
      state,
      cliAvailable: true,
      message: state,
      ...extra,
    }) satisfies OctogentStatus;

  const withStatuses = (launch: OctogentStatus, polls: OctogentStatus[]) => {
    let launches = 0;
    const integrations: Integrations = {
      ...v2Unused,
      exportToTentacle: async () => ({ ok: true, message: "" }),
      buildGraph: async () => {
        throw new Error("unused");
      },
      launchOctogent: async () => {
        launches += 1;
        return launch;
      },
      octogentStatus: async () => polls.shift() ?? status("not-running"),
    };
    return { integrations, launches: () => launches };
  };
  const statuses = (events: ServerEvent[]) =>
    events.flatMap((e) => (e.type === "octogent-status" ? [e.status] : []));

  it("launches, polls until Octogent answers, and reports its port", async () => {
    const running = status("running", { port: 8791, url: "http://127.0.0.1:8791" });
    const fake = withStatuses(status("starting"), [status("not-running"), running]);
    const { dir, ops, events } = setup({
      integrations: fake.integrations,
      launchPoll: { intervalMs: 1, timeoutMs: 1000 },
      sleep: async () => {},
    });
    await ops.launchOctogent(dir);
    expect(fake.launches()).toBe(1);
    expect(statuses(events).map((s) => s.state)).toEqual(["starting", "running"]);
    expect(statuses(events).every((s) => s.repoPath === dir)).toBe(true);
    expect(events.find((e) => e.type === "notice")).toMatchObject({
      message: "Octogent is running on :8791.",
    });
  });

  it("gives up after the timeout with a pointer to the terminal", async () => {
    const fake = withStatuses(status("starting"), []);
    const { dir, ops, events } = setup({
      integrations: fake.integrations,
      launchPoll: { intervalMs: 10, timeoutMs: 30 },
      sleep: async () => {},
    });
    await ops.launchOctogent(dir);
    const last = statuses(events).at(-1);
    expect(last?.state).toBe("not-running");
    expect(last?.message).toContain("didn't report a port within");
  });

  it("stops after the launch when there's nothing to wait for", async () => {
    const fake = withStatuses(status("running", { port: 8787 }), []);
    const { dir, ops, events } = setup({ integrations: fake.integrations, sleep: async () => {} });
    await ops.launchOctogent(dir);
    expect(statuses(events).map((s) => s.state)).toEqual(["running"]);
  });

  it("replies to a status request, or explains that integrations are off", async () => {
    const fake = withStatuses(status("starting"), [status("not-initialized")]);
    const { dir, ops } = setup({ integrations: fake.integrations });
    const replies: ServerEvent[] = [];
    await ops.requestOctogentStatus(dir, (e) => replies.push(e));
    expect(replies[0]).toMatchObject({
      type: "octogent-status",
      status: { state: "not-initialized", repoPath: dir },
    });
    const bare = setup();
    await bare.ops.requestOctogentStatus(bare.dir, () => {});
    expect(bare.events.at(-1)).toMatchObject({ type: "error", message: NO_INTEGRATIONS_MESSAGE });
  });
});
