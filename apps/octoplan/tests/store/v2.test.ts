import {
  type Answer,
  type HandoffPlan,
  PLAN_FILES,
  type PlanSnapshot,
  type QuestionRound,
} from "@octogent/octoplan-protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFsPlanStore } from "../../server/store/fsPlanStore";
import type { HarvestCandidateInput, PlanStore } from "../../server/store/types";
import { type TempRepo, makeTempRepo, waitFor } from "./helpers";

let repo: TempRepo;
let store: PlanStore;

beforeEach(async () => {
  repo = await makeTempRepo();
  store = createFsPlanStore(repo.repoPath, { onWarning: () => undefined, debounceMs: 50 });
});

afterEach(async () => {
  await store.dispose();
  await repo.cleanup();
});

const harvestInput = (title: string, source = "abc1234"): HarvestCandidateInput => ({
  title,
  date: "2026-09-27",
  source,
  sourceKind: "commit",
  contradicts: [],
  body: `Seen in ${source}.`,
});

describe("HARVEST.md (D27)", () => {
  it("adds pending H-records and never re-adds a known title, whatever its status", async () => {
    const added = await store.addHarvest([
      harvestInput("Use pnpm workspaces"),
      harvestInput("Store transcripts as JSONL"),
    ]);
    expect(added.map((h) => [h.id, h.status])).toEqual([
      ["H1", "pending"],
      ["H2", "pending"],
    ]);
    const text = await repo.read(PLAN_FILES.harvest.path);
    expect(text.startsWith(PLAN_FILES.harvest.preamble)).toBe(true);

    await store.resolveHarvest("H1", "reject");
    const again = await store.addHarvest([
      harvestInput("  use PNPM workspaces "),
      harvestInput("store transcripts as jsonl"),
      harvestInput("Cache the digest"),
      harvestInput("cache the digest"),
    ]);
    expect(again.map((h) => [h.id, h.title])).toEqual([["H3", "Cache the digest"]]);
    expect((await store.readHarvest()).map((h) => [h.id, h.status])).toEqual([
      ["H1", "rejected"],
      ["H2", "pending"],
      ["H3", "pending"],
    ]);
  });

  it("accept writes a D-record and links it from the H-record; reject only flips status", async () => {
    await store.upsertDecision({
      title: "Existing",
      source: "session",
      questionIds: [],
      dependsOn: [],
      body: "",
    });
    await store.addHarvest([
      { ...harvestInput("Transcripts in ~/.octoplan"), contradicts: ["D1"] },
      harvestInput("Drop the dock"),
    ]);

    const { candidate, decision } = await store.resolveHarvest("H1", "accept");
    expect(decision).toMatchObject({
      id: "D2",
      title: "Transcripts in ~/.octoplan",
      source: "harvest H1",
      status: "active",
      body: "Seen in abc1234.",
    });
    expect(candidate).toMatchObject({ id: "H1", status: "accepted", decisionId: "D2" });
    expect(await repo.read(PLAN_FILES.harvest.path)).toContain("- decision: D2");
    expect(await repo.read(PLAN_FILES.decisions.path)).toContain("- source: harvest H1");

    // Accepting again keeps the same D-record.
    expect((await store.resolveHarvest("H1", "accept")).decision?.id).toBe("D2");
    const rejected = await store.resolveHarvest("H2", "reject");
    expect(rejected.decision).toBeUndefined();
    expect(rejected.candidate.status).toBe("rejected");

    const snapshot = await store.snapshot();
    expect(snapshot.decisions.map((d) => d.id)).toEqual(["D1", "D2"]);
    expect(snapshot.harvest?.map((h) => [h.id, h.status, h.decisionId])).toEqual([
      ["H1", "accepted", "D2"],
      ["H2", "rejected", undefined],
    ]);
    await expect(store.resolveHarvest("H9", "accept")).rejects.toThrow(/H9/);
  });

  it("keeps the harvest mark in the preamble", async () => {
    expect(await store.harvestMark()).toBeNull();
    await store.setHarvestMark("aaa111");
    await store.addHarvest([harvestInput("One")]);
    await store.setHarvestMark("bbb222");
    expect(await store.harvestMark()).toBe("bbb222");
    const text = await repo.read(PLAN_FILES.harvest.path);
    expect(text.match(/- last-harvest:/g)).toHaveLength(1);
    expect((await store.readHarvest()).map((h) => h.title)).toEqual(["One"]);
  });

  it("an external edit to HARVEST.md reaches onChange with the new harvest", async () => {
    await store.addHarvest([harvestInput("One")]);
    const events: PlanSnapshot[] = [];
    store.onChange((snapshot) => events.push(snapshot));
    await new Promise((done) => setTimeout(done, 100));
    const text = await repo.read(PLAN_FILES.harvest.path);
    await repo.write(PLAN_FILES.harvest.path, text.replace("## H1 — One", "## H1 — One, edited"));
    await waitFor(() => events.some((s) => s.harvest?.[0]?.title === "One, edited"));
  });
});

const options = [
  { label: "A", description: "" },
  { label: "B", description: "" },
];

const round = (sessionId: string, index: number, askedAt: string): QuestionRound => ({
  id: `${sessionId}-r${index}`,
  sessionId,
  index,
  askedAt,
  questions: [
    { id: "Q1", question: "Which storage?", header: "Storage", multiSelect: false, options },
    { id: "Q2", question: "Which UI?", header: "UI", multiSelect: false, options },
  ],
});

const answer = (questionId: string, at: string, extra: Partial<Answer> = {}): Answer => ({
  questionId,
  selected: ["A"],
  modifier: "none",
  answeredAt: at,
  ...extra,
});

/** Two sessions: s1 (older) answers and revises; s2 parks one and answers one tentatively. */
const twoSessions = async () => {
  await store.startSessionLog({
    sessionId: "s1",
    title: "First pass",
    mode: "deep-interview",
    startedAt: "2026-09-25T09:00:00.000Z",
  });
  await store.recordAnswers("s1", round("s1", 1, "2026-09-25T09:01:00.000Z"), [
    answer("Q1", "2026-09-25T09:02:00.000Z"),
    answer("Q2", "2026-09-25T09:03:00.000Z"),
  ]);
  await store.recordAnswers("s1", round("s1", 2, "2026-09-25T09:04:00.000Z"), [
    answer("Q1", "2026-09-25T09:05:00.000Z", { selected: ["B"], revisionOf: "Q1" }),
  ]);
  await store.startSessionLog({
    sessionId: "s2",
    title: "Second pass",
    mode: "quick-align",
    startedAt: "2026-09-26T09:00:00.000Z",
    claudeSessionId: "claude-2",
  });
  await store.recordAnswers("s2", round("s2", 1, "2026-09-26T09:01:00.000Z"), [
    answer("Q1", "2026-09-26T09:02:00.000Z", { modifier: "parked", assumption: "files" }),
    answer("Q2", "2026-09-26T09:03:00.000Z", { modifier: "tentative" }),
  ]);
};

describe("cross-session aggregate (D13)", () => {
  it("summarizes every session log, newest first, with parked items on the snapshot", async () => {
    await twoSessions();
    const logs = await store.readSessionLogs();
    expect(logs).toEqual([
      {
        file: "2026-09-26-second-pass.md",
        title: "Second pass",
        mode: "quick-align",
        startedAt: "2026-09-26T09:00:00.000Z",
        claudeSessionId: "claude-2",
        summary: "",
        answers: 2,
        parked: 1,
        tentative: 1,
        revisions: 0,
      },
      {
        file: "2026-09-25-first-pass.md",
        title: "First pass",
        mode: "deep-interview",
        startedAt: "2026-09-25T09:00:00.000Z",
        summary: "",
        answers: 3,
        parked: 0,
        tentative: 0,
        revisions: 1,
      },
    ]);
    const snapshot = await store.snapshot();
    expect(snapshot.sessionLogs).toEqual(logs);
    expect(snapshot.parked.map((p) => [p.questionId, p.assumption])).toEqual([["Q1", "files"]]);
    expect(snapshot.risks.map((r) => r.origin)).toEqual(["Q2 tentative"]);
  });

  it("an external edit to a session log refreshes the summaries", async () => {
    await twoSessions();
    const events: PlanSnapshot[] = [];
    store.onChange((snapshot) => events.push(snapshot));
    await new Promise((done) => setTimeout(done, 100));
    const rel = "sessions/2026-09-25-first-pass.md";
    const text = await repo.read(rel);
    await repo.write(rel, text.replace("_In progress._", "Settled storage."));
    await waitFor(() =>
      events.some((s) => s.sessionLogs?.find((l) => l.title === "First pass")?.summary !== ""),
    );
  });
});

describe("history timeline (D24)", () => {
  it("returns sessions, decisions, revisions, branches, harvest and handoff in date order", async () => {
    await twoSessions();
    await store.upsertDecision({
      title: "Files over a database",
      date: "2026-09-25",
      source: "session",
      questionIds: ["Q1"],
      dependsOn: [],
      body: "",
    });
    await store.upsertDecision({
      title: "Old UI plan",
      date: "2026-09-24",
      source: "session",
      questionIds: ["Q2"],
      dependsOn: [],
      body: "",
    });
    await store.markDecisionsStale(["D2"]);
    await store.upsertBranch({
      title: "List layout",
      sessionId: "s2",
      parentSessionId: "s1",
      status: "exploring",
      body: "",
    });
    // Branch records carry their date as an extra meta key; pin it for the test.
    const branches = await repo.read(PLAN_FILES.branches.path);
    await repo.write(
      PLAN_FILES.branches.path,
      branches.replace(/- date: \d{4}-\d{2}-\d{2}/, "- date: 2026-09-26T12:00:00.000Z"),
    );
    await store.addHarvest([{ ...harvestInput("Harvested"), date: "2026-09-27" }]);
    await store.resolveHarvest("H1", "reject");
    await store.writeHandoff({ ...handoffPlan, generatedAt: "2026-09-28T08:00:00.000Z" });

    const history = await store.readHistory();
    expect(history.map((e) => [e.kind, e.refId])).toEqual([
      ["decision", "D2"],
      ["stale", "D2"],
      ["decision", "D1"],
      ["session", "2026-09-25-first-pass.md"],
      ["revision", "A3"],
      ["session", "2026-09-26-second-pass.md"],
      ["branch", "B1"],
      ["harvest", "H1"],
      ["handoff", "HANDOFF.md"],
      ["handoff", "HANDOFF.md"],
    ]);
    const ats = history.map((e) => e.at);
    expect([...ats].sort()).toEqual(ats);
    expect(history.find((e) => e.kind === "revision")).toMatchObject({
      at: "2026-09-25T09:05:00.000Z",
      sessionFile: "2026-09-25-first-pass.md",
    });
    expect(history.find((e) => e.kind === "branch")?.sessionFile).toBe("2026-09-26-second-pass.md");
  });
});

const handoffPlan: HandoffPlan = {
  status: "applied",
  generatedAt: "2026-09-27T10:00:00.000Z",
  appliedAt: "2026-09-28T11:00:00.000Z",
  source: "claude",
  workspace: "/work/octogent",
  heading: "Octoplan v2",
  tentacles: [
    {
      id: "store",
      name: "Store",
      description: "Reads and writes docs/plan.",
      owns: ["apps/octoplan/server/store"],
      existing: true,
      todos: [
        { text: "HARVEST.md. Done when it round-trips.", decisionIds: ["D27"], wave: "Wave 4" },
        { text: "History. Done when ordered.", decisionIds: ["D24", "D9"], wave: "Wave 5" },
      ],
    },
    {
      id: "ui-shell",
      name: "UI shell",
      description: "The cockpit.",
      owns: ["apps/octoplan/web"],
      existing: false,
      todos: [
        { text: "Loose todo. Done when done.", decisionIds: [], wave: "" },
        { text: "Dock. Done when docked.", decisionIds: ["D14"], wave: "Wave 3" },
      ],
    },
  ],
  octopusPrompt: "# Octopus\n\nCoordinate the tentacles.\n",
};

describe("HANDOFF.md + OCTOPUS.md (D46, D47)", () => {
  it("round-trips the plan, keeps the prompt in OCTOPUS.md and puts it on the snapshot", async () => {
    expect(await store.readHandoff()).toBeNull();
    await store.writeHandoff(handoffPlan);
    expect(await store.readHandoff()).toEqual(handoffPlan);
    expect((await store.snapshot()).handoff).toEqual(handoffPlan);
    expect(await repo.read(PLAN_FILES.handoff.path)).not.toContain("Coordinate the tentacles");
    expect(await repo.read(PLAN_FILES.octopus.path)).toBe(handoffPlan.octopusPrompt);

    await store.writeOctopusPrompt("# Octopus v2\n");
    expect((await store.readHandoff())?.octopusPrompt).toBe("# Octopus v2\n");
  });

  it("a hand edit to a todo line survives a re-read and the next write", async () => {
    await store.writeHandoff(handoffPlan);
    const text = await repo.read(PLAN_FILES.handoff.path);
    await repo.write(
      PLAN_FILES.handoff.path,
      text.replace(
        "- [ ] [D14] Dock. Done when docked.",
        "- [ ] [D14, D30] Dock, restored after restart. Done when docked.",
      ),
    );
    const read = await store.readHandoff();
    expect(read?.tentacles[1]?.todos[1]).toEqual({
      text: "Dock, restored after restart. Done when docked.",
      decisionIds: ["D14", "D30"],
      wave: "Wave 3",
    });
    if (!read) throw new Error("unreadable");
    await store.writeHandoff({ ...read, status: "draft" });
    expect(await repo.read(PLAN_FILES.handoff.path)).toContain(
      "- [ ] [D14, D30] Dock, restored after restart. Done when docked.",
    );
  });

  it("a missing OCTOPUS.md reads as an empty prompt", async () => {
    await store.writeHandoff({ ...handoffPlan, octopusPrompt: "" });
    expect((await store.readHandoff())?.octopusPrompt).toBe("");
  });
});
