import { readdir } from "node:fs/promises";
import { PLAN_FILES } from "@octogent/octoplan-protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFsPlanStore } from "../../server/store/fsPlanStore";
import type { PlanStore } from "../../server/store/types";
import { type TempRepo, makeTempRepo } from "./helpers";

let repo: TempRepo;
let store: PlanStore;
let warnings: string[];

beforeEach(async () => {
  repo = await makeTempRepo();
  warnings = [];
  store = createFsPlanStore(repo.repoPath, {
    onWarning: (warning) => warnings.push(`${warning.file}#${warning.recordId}`),
  });
});

afterEach(async () => {
  await store.dispose();
  await repo.cleanup();
});

const decisionInput = {
  title: "Use the Agent SDK",
  source: "interview",
  questionIds: ["Q3"],
  dependsOn: [],
  body: "Because it streams.",
};

const risk = (title: string) => ({
  title,
  likelihood: "medium" as const,
  impact: "high" as const,
  origin: "",
  status: "open" as const,
  body: "",
});

describe("createFsPlanStore", () => {
  it("returns an empty snapshot when docs/plan does not exist", async () => {
    const snapshot = await store.snapshot();
    expect(snapshot.decisions).toEqual([]);
    expect(snapshot.risks).toEqual([]);
    expect(snapshot.goal).toBeNull();
    expect(snapshot.coverage.dimensions).toHaveLength(12);
    expect(snapshot.coverage.dimensions.every((d) => d.status === "unknown")).toBe(true);
  });

  it("creates a missing file with its preamble on first write", async () => {
    const decision = await store.upsertDecision({ ...decisionInput, date: "2026-09-25" });
    expect(decision.id).toBe("D1");
    expect(decision.status).toBe("active");
    expect(await repo.read(PLAN_FILES.decisions.path)).toBe(
      [
        PLAN_FILES.decisions.preamble,
        "",
        "<!-- op:id=D1 -->",
        "## D1 — Use the Agent SDK",
        "- date: 2026-09-25",
        "- status: active",
        "- source: interview",
        "- questions: Q3",
        "",
        "Because it streams.",
        "",
      ].join("\n"),
    );
  });

  it("allocates ids per prefix", async () => {
    expect((await store.addGap({ title: "Auth?", status: "open", body: "" })).id).toBe("G1");
    const parked = await store.park({
      title: "Q",
      assumption: "a",
      date: "2026-09-25",
      status: "parked",
      body: "",
    });
    expect(parked.id).toBe("P1");
    const idea = await store.addIdea({
      title: "Dark mode",
      date: "2026-09-25",
      tags: ["ui"],
      status: "inbox",
      body: "",
    });
    expect(idea.id).toBe("I1");
    expect((await store.upsertDecision(decisionInput)).id).toBe("D1");
    expect((await store.upsertDecision(decisionInput)).id).toBe("D2");
  });

  it("preserves an unknown meta key, the preamble and a hand-written body on upsert", async () => {
    await repo.write(
      PLAN_FILES.decisions.path,
      [
        "# Decisions",
        "",
        "My own intro.",
        "",
        "<!-- op:id=D1 -->",
        "## D1 — Old title",
        "- date: 2026-09-01",
        "- status: active",
        "- owner: alex",
        "",
        "Hand-written body.",
        "",
        "With two paragraphs.",
        "",
      ].join("\r\n"),
    );
    const current = (await store.snapshot()).decisions[0];
    if (!current) throw new Error("missing D1");
    expect(current.body).toBe("Hand-written body.\n\nWith two paragraphs.");
    await store.upsertDecision({ ...current, title: "New title", questionIds: ["Q1"] });
    expect(await repo.read(PLAN_FILES.decisions.path)).toBe(
      [
        "# Decisions",
        "",
        "My own intro.",
        "",
        "<!-- op:id=D1 -->",
        "## D1 — New title",
        "- date: 2026-09-01",
        "- status: active",
        "- owner: alex",
        "- questions: Q1",
        "",
        "Hand-written body.",
        "",
        "With two paragraphs.",
        "",
      ].join("\n"),
    );
  });

  it("does not lose any of 20 concurrent addRisk calls", async () => {
    const risks = await Promise.all(
      Array.from({ length: 20 }, (_, i) => store.addRisk(risk(`Risk ${i + 1}`))),
    );
    const expected = Array.from({ length: 20 }, (_, i) => `R${i + 1}`);
    expect(risks.map((r) => r.id)).toEqual(expected);
    const snapshot = await store.snapshot();
    expect(snapshot.risks.map((r) => r.id)).toEqual(expected);
    expect(snapshot.risks.map((r) => r.title)).toEqual(expected.map((_, i) => `Risk ${i + 1}`));
    // The atomic writes leave no temp files behind.
    expect(await readdir(repo.planPath(""))).toEqual([PLAN_FILES.risks.path]);
  });

  it("marks decisions stale and finds dependents by questions and depends-on", async () => {
    await store.upsertDecision({ ...decisionInput, questionIds: ["Q1"] });
    await store.upsertDecision({ ...decisionInput, questionIds: [], dependsOn: ["Q1", "D1"] });
    await store.upsertDecision({ ...decisionInput, questionIds: ["Q2"] });
    expect((await store.dependentDecisions("Q1")).map((d) => d.id)).toEqual(["D1", "D2"]);
    await store.markDecisionsStale(["D2", "D99"]);
    const snapshot = await store.snapshot();
    expect(snapshot.decisions.map((d) => d.status)).toEqual(["active", "stale", "active"]);
    expect((await store.dependentDecisions("Q1")).map((d) => d.id)).toEqual(["D1"]);
  });

  it("updates a decision by id without touching its other fields", async () => {
    await store.upsertDecision({ ...decisionInput, date: "2026-09-01" });
    const updated = await store.upsertDecision({ ...decisionInput, id: "D1", title: "Renamed" });
    expect(updated).toMatchObject({ id: "D1", title: "Renamed", date: "2026-09-01" });
    expect((await store.snapshot()).decisions).toHaveLength(1);
  });

  it("replaces one coverage dimension and keeps a hand-edited label", async () => {
    await repo.write(
      PLAN_FILES.coverage.path,
      "# Coverage\n\n<!-- op:id=users -->\n## users — Who we serve\n- status: partial\n- confidence: low\n",
    );
    const coverage = await store.updateCoverage({
      id: "users",
      status: "covered",
      confidence: "high",
      questionIds: ["Q1", "Q2"],
      note: "Solo devs.",
    });
    expect(coverage.dimensions.find((d) => d.id === "users")).toEqual({
      id: "users",
      status: "covered",
      confidence: "high",
      questionIds: ["Q1", "Q2"],
      note: "Solo devs.",
    });
    await store.updateCoverage({
      id: "data",
      status: "partial",
      confidence: "medium",
      questionIds: [],
      note: "",
    });
    const text = await repo.read(PLAN_FILES.coverage.path);
    expect(text).toContain("## users — Who we serve");
    expect(text).toContain("## data — Data");
  });

  it("writes GOAL.md and keeps sections Octoplan does not own", async () => {
    await repo.write(PLAN_FILES.goal.path, "# Goal — Old\n\n## Why\n\nx\n\n## Notes\n\nMine.\n");
    const goal = {
      title: "Ship Octoplan",
      why: "Planning is slow.",
      goals: ["Ask better"],
      nonGoals: [],
      done: [{ id: "DOD1", text: "Store works", status: "partial" as const, evidence: "" }],
    };
    await store.writeGoal(goal);
    expect(await repo.read(PLAN_FILES.goal.path)).toContain("## Notes\n\nMine.");
    expect((await store.snapshot()).goal).toEqual(goal);
  });

  it("skips broken records with a single warning and never throws on read", async () => {
    await repo.write(
      PLAN_FILES.risks.path,
      "# Risks\n\n<!-- op:id=R1 -->\n## R1 — Fine\n- status: open\n\n<!-- op:id=R2 -->\n## R2 — Broken\n- status: exploded\n",
    );
    expect((await store.snapshot()).risks.map((r) => r.id)).toEqual(["R1"]);
    await store.snapshot();
    expect(warnings).toEqual(["RISKS.md#R2"]);
    // The broken record survives writes untouched so the human can fix it.
    await store.addRisk(risk("New"));
    const text = await repo.read(PLAN_FILES.risks.path);
    expect(text).toContain("## R2 — Broken\n- status: exploded");
    expect(text).toContain("## R3 — New");
  });

  it("snapshot matches the files after a reload", async () => {
    await store.upsertDecision(decisionInput);
    await store.addGap({ title: "Auth?", dimension: "architecture", status: "open", body: "Who" });
    await store.addRisk({ ...risk("Slow"), origin: "Q2 tentative" });
    await store.park({
      title: "Budget",
      questionId: "Q4",
      assumption: "small",
      date: "2026-09-25",
      status: "parked",
      body: "",
    });
    await store.addIdea({
      title: "Voice",
      date: "2026-09-25",
      tags: ["ux", "later"],
      status: "inbox",
      body: "hmm",
    });
    await store.updateCoverage({
      id: "scope",
      status: "partial",
      confidence: "medium",
      questionIds: ["Q1"],
      note: "",
    });
    await store.writeGoal({ title: "G", why: "", goals: [], nonGoals: [], done: [] });
    const before = await store.snapshot();
    expect(before.decisions).toHaveLength(1);
    await store.dispose();

    store = createFsPlanStore(repo.repoPath);
    expect(await store.snapshot()).toEqual(before);
  });
});
