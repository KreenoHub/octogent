import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IngestDraft, IngestItem } from "@octogent/octoplan-protocol";
import { afterEach, describe, expect, it } from "vitest";
import { applyIngestToPlan, ingestProblem } from "../../server/ingest/applyIngest";
import { createFsPlanStore } from "../../server/store/fsPlanStore";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const repo = () => {
  const dir = mkdtempSync(join(tmpdir(), "octoplan-apply-"));
  const store = createFsPlanStore(dir, { debounceMs: 20 });
  cleanups.push(() => {
    void store.dispose();
    rmSync(dir, { recursive: true, force: true });
  });
  return { dir, store };
};

const item = (id: string, patch: Partial<IngestItem>): IngestItem => ({
  id,
  kind: "decision",
  title: id,
  body: "",
  evidence: "found",
  source: "docs/SPEC.md",
  quote: "q",
  keep: true,
  tentative: false,
  disagreement: false,
  ...patch,
});

const draft = (items: IngestItem[]): IngestDraft => ({
  status: "draft",
  createdAt: "2026-09-28T09:00:00.000Z",
  title: "Habit tracker",
  why: "Keep a streak.",
  maturity: "partial-plan",
  maturityReasons: "",
  coverage: [
    { dimension: "problem", status: "covered" },
    { dimension: "users", status: "partial" },
  ],
  sources: [
    { id: "S1", path: "C:\\repos\\habit", kind: "folder", main: true, note: "", skipped: [] },
  ],
  items,
});

const NOW = "2026-09-28T10:00:00.000Z";

describe("applying an import (D56)", () => {
  it("writes kept items with their evidence, leaves dropped and in-plan ones out", async () => {
    const { dir, store } = repo();
    const summary = await applyIngestToPlan(
      store,
      draft([
        item("I1", { title: "Store habits in JSON" }),
        item("I2", { title: "Use Rust", keep: false }),
        item("I3", { title: "Weekly streak view", kind: "goal" }),
        item("I4", { title: "No sync", kind: "non-goal" }),
        item("I5", {
          title: "Who uses it?",
          kind: "gap",
          evidence: "inferred",
          reason: "No users section",
          tentative: true,
        }),
        item("I6", { title: "Data loss", kind: "risk" }),
        item("I7", { title: "Existing decision", inPlan: "D1", keep: false }),
        item("I8", {
          title: "CLI only",
          evidence: "inferred",
          reason: "There's no UI code",
          tentative: true,
        }),
      ]),
      NOW,
    );
    expect(summary).toEqual({ decisions: 2, goals: 2, gaps: 1, risks: 2, parked: 0 });

    const plan = await store.snapshot();
    expect(plan.decisions.map((d) => d.title)).toEqual(["Store habits in JSON", "CLI only"]);
    expect(plan.decisions[0]).toMatchObject({
      source: "import (docs/SPEC.md)",
      date: "2026-09-28",
      status: "active",
    });
    expect(plan.decisions[0]?.body).toContain("Imported from docs/SPEC.md: “q”");
    expect(plan.decisions[1]?.body).toContain("Inferred on import: There's no UI code.");
    expect(plan.goal).toMatchObject({
      title: "Habit tracker",
      why: "Keep a streak.",
      goals: ["Weekly streak view"],
      nonGoals: ["No sync"],
    });
    expect(plan.gaps.map((g) => g.title)).toEqual(["Who uses it?"]);
    // The inferred decision also becomes an assumption risk; the inferred gap doesn't.
    expect(plan.risks.map((r) => r.title)).toEqual(["Data loss", "Assumed on import: CLI only"]);
    expect(plan.coverage.dimensions.find((d) => d.id === "problem")?.status).toBe("covered");
    expect(plan.ingest).toMatchObject({ status: "applied", appliedAt: NOW });
    expect(readFileSync(join(dir, "docs", "plan", "INGEST.md"), "utf8")).toContain(
      "- status: applied",
    );
  });

  it("writes a resolved disagreement as a decision and a parked one as parked", async () => {
    const { store } = repo();
    const summary = await applyIngestToPlan(
      store,
      draft([
        item("I1", {
          kind: "gap",
          title: "Sources disagree on storage",
          body: "JSON it is.",
          disagreement: true,
          resolution: "resolved",
        }),
        item("I2", {
          kind: "gap",
          title: "Sources disagree on sync",
          disagreement: true,
          resolution: "parked",
        }),
      ]),
      NOW,
    );
    expect(summary).toMatchObject({ decisions: 1, parked: 1, gaps: 0 });
    const plan = await store.snapshot();
    expect(plan.decisions[0]?.title).toBe("Sources disagree on storage");
    expect(plan.parked[0]).toMatchObject({ title: "Sources disagree on sync", status: "parked" });
  });

  it("merges into an existing goal and never lowers coverage", async () => {
    const { store } = repo();
    await store.writeGoal({
      title: "Existing",
      why: "Because.",
      goals: ["Weekly streak view"],
      nonGoals: [],
      done: [{ id: "DOD1", text: "Run the tests", status: "unknown", evidence: "" }],
    });
    await store.updateCoverage({
      id: "problem",
      status: "covered",
      confidence: "high",
      questionIds: ["Q1"],
      note: "From the interview.",
    });
    await applyIngestToPlan(
      store,
      {
        ...draft([
          item("I1", { kind: "goal", title: "weekly streak view" }),
          item("I2", { kind: "goal", title: "Reminders" }),
        ]),
        coverage: [
          { dimension: "problem", status: "partial" },
          { dimension: "users", status: "partial" },
        ],
      },
      NOW,
    );
    const plan = await store.snapshot();
    expect(plan.goal).toMatchObject({
      title: "Existing",
      why: "Because.",
      goals: ["Weekly streak view", "Reminders"],
    });
    expect(plan.goal?.done).toHaveLength(1);
    const problem = plan.coverage.dimensions.find((d) => d.id === "problem");
    expect(problem).toMatchObject({
      status: "covered",
      confidence: "high",
      note: "From the interview.",
    });
    expect(plan.coverage.dimensions.find((d) => d.id === "users")?.status).toBe("partial");
  });

  it("blocks apply on an open disagreement, a running pass or an applied draft", () => {
    const open = draft([item("I1", { kind: "gap", disagreement: true, resolution: "open" })]);
    expect(ingestProblem(open)).toMatch(/resolve or park/);
    expect(ingestProblem({ ...open, items: [] })).toBeNull();
    expect(ingestProblem({ ...open, status: "running" })).toMatch(/still running/);
    expect(ingestProblem({ ...open, status: "applied" })).toMatch(/already applied/);
  });
});
