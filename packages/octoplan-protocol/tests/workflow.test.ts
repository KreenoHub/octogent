import { describe, expect, it } from "vitest";
import {
  COVERAGE_DIMENSION_LABELS,
  type CoverageDimensionId,
  type IngestDraft,
  type PlanSnapshot,
  type WorkflowInput,
  deriveWorkflow,
  unknownDimensions,
} from "../src";

const allPartial = (Object.keys(COVERAGE_DIMENSION_LABELS) as CoverageDimensionId[]).map((id) => ({
  id,
  status: "partial" as const,
  confidence: "medium" as const,
  questionIds: [],
  note: "",
}));

const snap = (overrides: Partial<PlanSnapshot> = {}): PlanSnapshot => ({
  decisions: [],
  gaps: [],
  risks: [],
  parked: [],
  ideas: [],
  coverage: { dimensions: [] },
  goal: null,
  ...overrides,
});

const goal = {
  title: "Habit",
  why: "",
  goals: [],
  nonGoals: [],
  done: [{ id: "DOD1", text: "Run the tests", status: "unknown" as const, evidence: "" }],
};

const ingest = (status: IngestDraft["status"]): IngestDraft => ({
  status,
  createdAt: "t",
  title: "",
  why: "",
  maturity: "notes",
  maturityReasons: "",
  coverage: [],
  sources: [],
  items: [],
});

const handoff = (status: "draft" | "applied") => ({
  status,
  generatedAt: "t",
  source: "claude" as const,
  workspace: "/w",
  heading: "v1",
  tentacles: [],
  octopusPrompt: "",
});

const base: WorkflowInput = {
  snapshot: snap(),
  stageCount: 0,
  pendingRound: false,
  hasSession: true,
};

const current = (input: Partial<WorkflowInput>) => deriveWorkflow({ ...base, ...input }).current;

describe("deriveWorkflow (D62, DOD6)", () => {
  it.each<[string, Partial<WorkflowInput>, string]>([
    ["no project open", { snapshot: null }, "start"],
    ["a new empty project", { snapshot: snap(), hasSession: false }, "interview"],
    ["an import still running", { snapshot: snap({ ingest: ingest("running") }) }, "understand"],
    ["an imported draft", { snapshot: snap({ ingest: ingest("draft") }) }, "understand"],
    ["an applied import", { snapshot: snap({ ingest: ingest("applied") }) }, "interview"],
    [
      "a pending round with everything covered",
      { snapshot: snap({ coverage: { dimensions: allPartial } }), pendingRound: true },
      "interview",
    ],
    [
      "coverage done, no goal",
      { snapshot: snap({ coverage: { dimensions: allPartial } }) },
      "goal",
    ],
    [
      "GOAL.md without done-when items (as an import writes it)",
      { snapshot: snap({ goal: { ...goal, done: [] }, coverage: { dimensions: allPartial } }) },
      "goal",
    ],
    ["GOAL.md present", { snapshot: snap({ goal }) }, "stages"],
    ["stages present", { snapshot: snap({ goal }), stageCount: 4 }, "handoff"],
    [
      "a handoff draft not applied",
      { snapshot: snap({ goal, handoff: handoff("draft") }), stageCount: 4 },
      "handoff",
    ],
    [
      "HANDOFF.md applied",
      { snapshot: snap({ goal, handoff: handoff("applied") }), stageCount: 4 },
      "build",
    ],
    [
      "all handed-off todos ticked",
      {
        snapshot: snap({ goal, handoff: handoff("applied") }),
        stageCount: 4,
        todos: { done: 9, total: 9 },
      },
      "build",
    ],
  ])("%s → %s", (_name, input, expected) => {
    expect(current(input)).toBe(expected);
  });

  it("marks steps done, current, upcoming or skipped, each with a reason", () => {
    const flow = deriveWorkflow({ ...base, snapshot: snap({ goal }), stageCount: 0 });
    expect(flow.steps.map((s) => `${s.id}:${s.state}`)).toEqual([
      "start:done",
      "understand:skipped",
      "interview:done",
      "goal:done",
      "stages:current",
      "handoff:upcoming",
      "build:upcoming",
    ]);
    expect(flow.steps.find((s) => s.id === "goal")?.reason).toBe("GOAL.md has 1 done-when item.");
    expect(flow.steps.find((s) => s.id === "understand")?.reason).toBe("Nothing was imported.");
  });

  it("offers exactly one next action per situation (D64)", () => {
    const next = (input: Partial<WorkflowInput>) => deriveWorkflow({ ...base, ...input }).next;
    expect(next({ snapshot: snap({ ingest: ingest("running") }) }).kind).toBe("wait");
    expect(next({ snapshot: snap({ ingest: ingest("draft") }) }).kind).toBe("open-review");
    expect(next({ hasSession: false }).kind).toBe("start-interview");
    expect(next({ pendingRound: true })).toMatchObject({
      kind: "answer-round",
      reason: "A question is waiting for your answer.",
    });
    expect(next({}).reason).toBe("12 dimensions still unknown.");
    expect(next({ snapshot: snap({ coverage: { dimensions: allPartial } }) }).kind).toBe(
      "write-goal",
    );
    expect(next({ snapshot: snap({ goal }) }).kind).toBe("generate-stages");
    expect(next({ snapshot: snap({ goal }), stageCount: 2 }).kind).toBe("hand-off");
    const built = { snapshot: snap({ goal, handoff: handoff("applied") }), stageCount: 2 };
    expect(next(built).kind).toBe("run-octogent");
    expect(next({ ...built, octogent: "running" }).kind).toBe("open-octogent");
    expect(next({ ...built, todos: { done: 3, total: 3 } }).kind).toBe("finished");
  });

  it("counts missing coverage records as unknown", () => {
    expect(unknownDimensions(null)).toHaveLength(12);
    expect(unknownDimensions(snap({ coverage: { dimensions: allPartial.slice(2) } }))).toEqual([
      "problem",
      "users",
    ]);
  });
});
