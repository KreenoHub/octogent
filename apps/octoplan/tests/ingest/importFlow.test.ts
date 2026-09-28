import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerEvent } from "@octogent/octoplan-protocol";
import { afterEach, describe, expect, it } from "vitest";
import type { HeadlessRunner } from "../../server/bridge/types";
import type { Integrations } from "../../server/integrations/types";
import { applyIdeaAction, buildStages } from "../../server/modes";
import type { IngestReport } from "../../server/modes/ingest";
import { NO_IMPORT_MESSAGE, createPlanOps } from "../../server/planOps";
import { createFsPlanStore } from "../../server/store/fsPlanStore";
import type { PlanStore } from "../../server/store/types";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const tempDir = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

const REPORT: IngestReport = {
  title: "Habit tracker",
  why: "Keep a weekly streak.",
  maturity: "partial-plan",
  maturityReasons: "A spec and a half-built CLI.",
  sources: [
    { id: "S1", maturity: "built", note: "A CLI." },
    { id: "S2", maturity: "detailed-plan", note: "The spec." },
  ],
  items: [
    {
      kind: "decision",
      title: "JSON storage",
      evidence: "found",
      source: "SPEC.md",
      quote: "JSON",
    },
    { kind: "goal", title: "Weekly streak", evidence: "found", source: "README.md" },
    { kind: "gap", title: "Who uses it?", evidence: "inferred", reason: "No users section" },
    {
      kind: "gap",
      title: "Sources disagree on storage",
      evidence: "found",
      source: "SPEC.md, notes",
      disagreement: true,
    },
  ],
  coverage: [{ dimension: "problem", status: "covered" }],
};

const setup = (report: IngestReport | null = REPORT) => {
  const repo = tempDir("octoplan-import-");
  writeFileSync(join(repo, "README.md"), "# Habit");
  mkdirSync(join(repo, "node_modules", "x"), { recursive: true });
  writeFileSync(join(repo, "node_modules", "x", "i.js"), "dep");
  const spec = join(tempDir("octoplan-spec-"), "SPEC.md");
  writeFileSync(spec, "Store habits as JSON.");

  const stores = new Map<string, PlanStore>();
  const storeFor = (repoPath: string) => {
    const existing = stores.get(repoPath);
    if (existing) return existing;
    const store = createFsPlanStore(repoPath, { debounceMs: 20 });
    stores.set(repoPath, store);
    cleanups.push(() => void store.dispose());
    return store;
  };
  const ingestCalls: Array<{ prompt: string; additionalDirectories: string[] }> = [];
  const headless: HeadlessRunner = {
    harvest: async () => [],
    proposeHandoff: async () => [],
    ingest: async ({ prompt, additionalDirectories }) => {
      ingestCalls.push({ prompt, additionalDirectories });
      return report;
    },
  };
  const gitInits: string[] = [];
  const integrations = {
    ensureGitRepo: async (dir: string) => {
      gitInits.push(dir);
      return null;
    },
  } as unknown as Integrations;
  const events: ServerEvent[] = [];
  const ops = createPlanOps({
    storeFor,
    broadcast: (e) => events.push(e),
    applyIdeaAction,
    buildStages,
    integrations,
    headless,
    now: () => new Date("2026-09-28T10:00:00.000Z"),
  });
  return { repo, spec, ops, events, storeFor, ingestCalls, gitInits };
};

const jobs = (events: ServerEvent[]) =>
  events.flatMap((e) => (e.type === "plan-job" ? [`${e.job}:${e.state}`] : []));

describe("import flow (D52–D57)", () => {
  it("saves pasted text, lists sources, runs one pass and writes an INGEST.md draft", async () => {
    const { repo, spec, ops, events, storeFor, ingestCalls, gitInits } = setup();
    const replies: ServerEvent[] = [];
    await ops.startImport(
      {
        mainPath: `"${repo}"`,
        extraPaths: [spec],
        pastes: ["Maybe sync to a phone?"],
        gitInit: true,
      },
      (e) => replies.push(e),
    );
    expect(replies).toEqual([{ type: "focus-repo", repoPath: repo }]);
    expect(gitInits).toEqual([repo]);
    expect(readFileSync(join(repo, "docs", "plan", "sources", "pasted-1.md"), "utf8")).toBe(
      "Maybe sync to a phone?\n",
    );
    const call = ingestCalls[0];
    expect(call?.additionalDirectories).toEqual([join(spec, "..")]);
    expect(call?.prompt).toContain("README.md");
    expect(call?.prompt).not.toContain("node_modules");
    expect(call?.prompt).toContain("Maybe sync to a phone?");

    const draft = await storeFor(repo).readIngest();
    expect(draft).toMatchObject({
      status: "draft",
      title: "Habit tracker",
      maturity: "partial-plan",
    });
    expect(draft?.sources.map((s) => [s.id, s.kind, s.main])).toEqual([
      ["S1", "folder", true],
      ["S2", "file", false],
      ["S3", "paste", false],
    ]);
    expect(draft?.items).toHaveLength(4);
    expect(jobs(events).at(-1)).toBe("ingest:done");
  });

  it("won't apply with an open disagreement; applies the reviewed draft and returns the brief", async () => {
    const { repo, ops, events, storeFor } = setup();
    await ops.startImport({ mainPath: repo, extraPaths: [], pastes: [], gitInit: false }, () => {});
    expect(await ops.applyIngest(repo)).toBeNull();
    expect(jobs(events).at(-1)).toBe("ingest-apply:failed");

    const store = storeFor(repo);
    const draft = await store.readIngest();
    if (!draft) throw new Error("no draft");
    const reviewed = {
      ...draft,
      items: draft.items.map((item) =>
        item.disagreement
          ? { ...item, resolution: "parked" as const }
          : item.title === "Weekly streak"
            ? { ...item, keep: false }
            : item,
      ),
    };
    const applied = await ops.applyIngest(repo, reviewed);
    expect(applied?.repoPath).toBe(repo);
    expect(applied?.topic).toBe("Habit tracker");
    expect(applied?.brief).toContain("Maturity: Partial plan");
    expect(applied?.brief).toContain("Who uses it?");
    const plan = await store.snapshot();
    expect(plan.decisions.map((d) => d.title)).toEqual(["JSON storage"]);
    expect(plan.goal?.goals).toEqual([]);
    expect(plan.parked.map((p) => p.title)).toEqual(["Sources disagree on storage"]);
    expect(plan.ingest?.status).toBe("applied");
  });

  it("re-import keeps what was there and adds the new sources and items", async () => {
    const { repo, ops, storeFor } = setup();
    await ops.startImport({ mainPath: repo, extraPaths: [], pastes: [], gitInit: false }, () => {});
    const other = setup({ items: [{ kind: "risk", title: "Scope creep", evidence: "inferred" }] });
    // Same repo, second pass with a different report.
    await other.ops.startImport(
      { mainPath: repo, extraPaths: [], pastes: ["More notes"], gitInit: false },
      () => {},
    );
    const draft = await other.storeFor(repo).readIngest();
    expect(draft?.sources.map((s) => s.id)).toEqual(["S1", "S2"]);
    expect(draft?.items.map((i) => i.title)).toEqual([
      "JSON storage",
      "Weekly streak",
      "Who uses it?",
      "Sources disagree on storage",
      "Scope creep",
    ]);
    void storeFor;
  });

  it("reports a missing folder, a missing extra and a server without Claude", async () => {
    const { repo, ops, events } = setup();
    await ops.startImport(
      { mainPath: join(repo, "nope"), extraPaths: [], pastes: [], gitInit: false },
      () => {},
    );
    expect(events.at(-1)).toMatchObject({
      type: "error",
      message: expect.stringMatching(/Main folder not found/),
    });
    await ops.startImport(
      { mainPath: repo, extraPaths: [join(repo, "missing.md")], pastes: [], gitInit: false },
      () => {},
    );
    expect(events.at(-1)).toMatchObject({
      type: "error",
      message: expect.stringMatching(/Not found/),
    });

    const bare = createPlanOps({
      storeFor: (p) => createFsPlanStore(p),
      broadcast: (e) => events.push(e),
      applyIdeaAction,
      buildStages,
    });
    await bare.startImport(
      { mainPath: repo, extraPaths: [], pastes: [], gitInit: false },
      () => {},
    );
    expect(events.at(-1)).toMatchObject({ type: "error", message: NO_IMPORT_MESSAGE });
  });

  it("marks the job failed and leaves a draft when Claude reports nothing", async () => {
    const { repo, ops, events, storeFor } = setup(null);
    await ops.startImport({ mainPath: repo, extraPaths: [], pastes: [], gitInit: false }, () => {});
    expect(jobs(events).at(-1)).toBe("ingest:failed");
    expect((await storeFor(repo).readIngest())?.status).toBe("draft");
  });
});
