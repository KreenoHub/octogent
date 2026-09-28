import { describe, expect, it } from "vitest";
import {
  type IngestDraft,
  clientEventSchema,
  ingestItemProblem,
  parseIngestDoc,
  planSnapshotSchema,
  serializeIngestDoc,
} from "../src";

const draft: IngestDraft = {
  status: "draft",
  createdAt: "2026-09-28T10:00:00.000Z",
  title: "Habit tracker",
  why: "Log a habit a day and keep a weekly streak.",
  maturity: "partial-plan",
  maturityReasons: "A spec with goals and two decisions; no scope or success criteria.",
  coverage: [
    { dimension: "problem", status: "covered" },
    { dimension: "users", status: "partial" },
    { dimension: "scope", status: "unknown" },
  ],
  sources: [
    {
      id: "S1",
      path: "C:\\repos\\habit",
      kind: "folder",
      main: true,
      maturity: "built",
      note: "A small CLI with tests.",
      skipped: ["design.docx", "mock.png"],
    },
    {
      id: "S2",
      path: "sources/pasted-1.md",
      kind: "paste",
      main: false,
      note: "",
      skipped: [],
    },
  ],
  items: [
    {
      id: "I1",
      kind: "decision",
      title: "Store habits in one JSON file",
      body: "Everything lives in ~/.habit.json; no database.",
      evidence: "found",
      source: "docs/SPEC.md",
      quote: "All data lives in ~/.habit.json",
      keep: true,
      tentative: false,
      disagreement: false,
    },
    {
      id: "I2",
      kind: "goal",
      title: "Show a weekly streak",
      body: "",
      evidence: "inferred",
      reason: "The README screenshot shows a 7-day grid.",
      keep: true,
      tentative: true,
      inPlan: "D3",
      disagreement: false,
    },
    {
      id: "I3",
      kind: "gap",
      title: "Sources disagree on the storage format",
      body: "SPEC.md says JSON; notes.txt says SQLite.",
      evidence: "found",
      source: "docs/SPEC.md, notes.txt",
      keep: true,
      tentative: false,
      disagreement: true,
      resolution: "open",
    },
  ],
};

describe("INGEST.md (D56)", () => {
  it("round-trips a draft with found, inferred and disagreement items byte-for-byte (DOD12)", () => {
    const text = serializeIngestDoc(draft);
    expect(parseIngestDoc(text)).toEqual(draft);
    expect(serializeIngestDoc(parseIngestDoc(text) as IngestDraft, text)).toBe(text);
    expect(text).toContain("<!-- op:id=S1 -->\n## S1 — C:\\repos\\habit");
    expect(text).toContain("- coverage: problem=covered, users=partial, scope=unknown");
  });

  it("keeps hand-added preamble lines and unknown meta keys on rewrite", () => {
    const text = serializeIngestDoc(draft)
      .replace("- coverage:", "- reviewer: me\n- coverage:")
      .replace("- kind: decision", "- kind: decision\n- note-to-self: check with Sam");
    const next = serializeIngestDoc({ ...draft, status: "applied", appliedAt: "x" }, text);
    expect(next).toContain("- reviewer: me");
    expect(next).toContain("- note-to-self: check with Sam");
    expect(next).toContain("- status: applied");
  });

  it("skips broken records and reads empty text as null", () => {
    const text = serializeIngestDoc(draft).replace("- kind: goal", "- kind: wish");
    expect(parseIngestDoc(text)?.items.map((i) => i.id)).toEqual(["I1", "I3"]);
    expect(parseIngestDoc("  \n")).toBeNull();
  });

  it("an open disagreement blocks apply until resolved, parked or dropped", () => {
    const gap = draft.items[2] as IngestDraft["items"][number];
    expect(ingestItemProblem(gap)).toMatch(/resolve or park/);
    expect(ingestItemProblem({ ...gap, resolution: "parked" })).toBeNull();
    expect(ingestItemProblem({ ...gap, keep: false })).toBeNull();
  });

  it("travels in the snapshot and the new client events", () => {
    expect(planSnapshotSchema.shape.ingest.safeParse(draft).success).toBe(true);
    expect(
      clientEventSchema.safeParse({
        type: "start-import",
        mainPath: "C:\\repos\\habit",
        extraPaths: ["D:\\notes"],
        pastes: ["an idea"],
        gitInit: true,
      }).success,
    ).toBe(true);
    expect(
      clientEventSchema.safeParse({
        type: "create-project",
        parentDir: "C:\\p",
        name: "",
        idea: "x",
      }).success,
    ).toBe(false);
  });
});
