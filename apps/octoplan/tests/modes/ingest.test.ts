import type { IngestDraft, IngestSource, PlanSnapshot } from "@octogent/octoplan-protocol";
import { describe, expect, it } from "vitest";
import {
  MATURITY_FOCUS,
  buildImportBrief,
  buildIngestPrompt,
  normalizeIngest,
} from "../../server/modes/ingest";

const snapshot = (overrides: Partial<PlanSnapshot> = {}): PlanSnapshot => ({
  decisions: [
    {
      id: "D3",
      title: "Store habits in one JSON file",
      date: "2026-09-27",
      status: "active",
      source: "interview",
      questionIds: [],
      dependsOn: [],
      body: "",
    },
  ],
  gaps: [],
  risks: [],
  parked: [],
  ideas: [],
  coverage: { dimensions: [] },
  goal: { title: "Habit", why: "", goals: ["Weekly streak view"], nonGoals: [], done: [] },
  ...overrides,
});

const sources: IngestSource[] = [
  { id: "S1", path: "C:\\repos\\habit", kind: "folder", main: true, note: "", skipped: [] },
  { id: "S2", path: "sources/pasted-1.md", kind: "paste", main: false, note: "", skipped: [] },
];

describe("buildIngestPrompt (D53)", () => {
  it("lists every source, the plan digest and earlier titles, and asks for evidence", () => {
    const prompt = buildIngestPrompt({
      sources: [
        { ...sources[0], listing: "doc  1 KB  README.md" } as never,
        { ...sources[1], text: "Maybe sync to a phone?" } as never,
      ],
      digest: "## Plan digest\n- D3 — Store habits in one JSON file",
      previousTitles: ["Weekly streak view"],
    });
    expect(prompt).toContain("### S1 — main folder — this becomes the project: C:\\repos\\habit");
    expect(prompt).toContain("doc  1 KB  README.md");
    expect(prompt).toContain("<<<\nMaybe sync to a phone?\n>>>");
    expect(prompt).toContain("set inPlan to its id");
    expect(prompt).toContain("- Weekly streak view");
    expect(prompt).toContain("Never mark an inference as found");
    expect(prompt).toContain('"Sources disagree on <topic>"');
  });
});

describe("normalizeIngest (D55, D56)", () => {
  const report = {
    title: "Habit tracker",
    why: "Keep a streak.",
    maturity: "partial-plan",
    maturityReasons: "Spec with gaps.",
    sources: [{ id: "S1", maturity: "built", note: "A CLI." }],
    items: [
      {
        kind: "decision",
        title: "Use Rust",
        evidence: "found",
        source: "SPEC.md",
        quote: "written in Rust",
      },
      { kind: "goal", title: "Weekly streak view", evidence: "found", source: "README.md" },
      { kind: "decision", title: "Store habits in one JSON file", evidence: "inferred" },
      {
        kind: "risk",
        title: "No backups",
        evidence: "found",
        reason: "says found without a source",
      },
      {
        kind: "gap",
        title: "Sources disagree on storage",
        evidence: "found",
        source: "SPEC.md, notes.txt",
        disagreement: true,
      },
      { kind: "wish", title: "Bad kind" },
      { kind: "goal", title: "  " },
      { kind: "goal", title: "use rust" },
    ],
    coverage: [
      { dimension: "problem", status: "covered" },
      { dimension: "vibes", status: "covered" },
      { dimension: "users", status: "great" },
    ],
  };

  it("numbers items, keeps found ones, marks inferred ones tentative and plan matches not kept", () => {
    const draft = normalizeIngest({
      report,
      sources,
      snapshot: snapshot(),
      previous: null,
      now: "2026-09-28T10:00:00.000Z",
    });
    expect(draft).toMatchObject({
      status: "draft",
      title: "Habit tracker",
      maturity: "partial-plan",
      coverage: [{ dimension: "problem", status: "covered" }],
    });
    expect(draft.sources[0]).toMatchObject({ maturity: "built", note: "A CLI." });
    const byTitle = Object.fromEntries(draft.items.map((i) => [i.title, i]));
    expect(draft.items.map((i) => i.id)).toEqual(["I1", "I2", "I3", "I4", "I5"]);
    expect(byTitle["Use Rust"]).toMatchObject({
      evidence: "found",
      keep: true,
      tentative: false,
      quote: "written in Rust",
    });
    expect(byTitle["Weekly streak view"]).toMatchObject({ inPlan: "goal", keep: false });
    expect(byTitle["Store habits in one JSON file"]).toMatchObject({
      inPlan: "D3",
      keep: false,
      evidence: "inferred",
      tentative: true,
    });
    // "found" without a source is an inference.
    expect(byTitle["No backups"]).toMatchObject({ evidence: "inferred", tentative: true });
    expect(byTitle["Sources disagree on storage"]).toMatchObject({
      kind: "gap",
      disagreement: true,
      resolution: "open",
    });
  });

  it("on re-import keeps earlier items and adds only new titles, numbered after them", () => {
    const first = normalizeIngest({
      report,
      sources,
      snapshot: null,
      previous: null,
      now: "t1",
    });
    const second = normalizeIngest({
      report: {
        items: [
          { kind: "goal", title: "Use Rust" },
          { kind: "risk", title: "Scope creep" },
        ],
      },
      sources,
      snapshot: null,
      previous: first,
      now: "t2",
    });
    expect(second.createdAt).toBe("t1");
    expect(second.title).toBe("Habit tracker");
    expect(second.items.map((i) => i.title).slice(-1)).toEqual(["Scope creep"]);
    expect(second.items.at(-1)?.id).toBe(`I${first.items.length + 1}`);
  });
});

describe("buildImportBrief (D57)", () => {
  const draft: IngestDraft = {
    status: "applied",
    createdAt: "t",
    title: "Habit",
    why: "",
    maturity: "detailed-plan",
    maturityReasons: "Nearly complete spec.",
    coverage: [],
    sources,
    items: [],
  };

  it("names the sources, the open gaps, parked items and weak dimensions", () => {
    const brief = buildImportBrief(
      draft,
      snapshot({
        gaps: [{ id: "G1", title: "Who uses it?", status: "open", body: "" }],
        parked: [
          {
            id: "P1",
            title: "Sources disagree on storage",
            assumption: "",
            date: "2026-09-28",
            status: "parked",
            body: "",
          },
        ],
        coverage: {
          dimensions: [
            { id: "users", status: "unknown", confidence: "low", questionIds: [], note: "" },
            { id: "problem", status: "covered", confidence: "low", questionIds: [], note: "" },
          ],
        },
      }),
    );
    expect(brief).toContain("Maturity: Detailed plan — Nearly complete spec.");
    expect(brief).toContain("- S1 folder (main): C:\\repos\\habit");
    expect(brief).toContain(MATURITY_FOCUS["detailed-plan"]);
    expect(brief).toContain("- G1 — Who uses it?");
    expect(brief).toContain("- P1 (parked) — Sources disagree on storage");
    expect(brief).toContain("Never re-ask a decision or goal the plan digest already lists");
    expect(brief).toMatch(/### Weak coverage\n- Users \(unknown\)/);
    expect(brief).not.toContain("Problem (covered)");
  });

  it("points a built project at what's next", () => {
    expect(buildImportBrief({ ...draft, maturity: "built" }, snapshot())).toContain(
      "Working code already exists",
    );
  });
});
