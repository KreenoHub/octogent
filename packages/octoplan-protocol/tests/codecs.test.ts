import { describe, expect, it } from "vitest";
import {
  type ConversationBranch,
  type Decision,
  type Gap,
  type Idea,
  type ParkedItem,
  type RecordCodec,
  type Risk,
  branchCodec,
  coverageCodec,
  decisionCodec,
  gapCodec,
  ideaCodec,
  parkedCodec,
  parseRecordDoc,
  readItems,
  riskCodec,
  serializeRecordDoc,
  upsertItem,
} from "../src";

const roundTrip = <T extends { id: string }>(codec: RecordCodec<T>, item: T): T[] => {
  const doc = upsertItem({ preamble: "# Test", records: [] }, codec, item);
  return readItems(parseRecordDoc(serializeRecordDoc(doc)), codec);
};

describe("typed codecs round-trip through markdown", () => {
  it("decision", () => {
    const decision: Decision = {
      id: "D4",
      title: "Deep interview is the MVP",
      date: "2026-09-25",
      status: "active",
      source: "alignment interview",
      questionIds: ["Q3", "Q7"],
      dependsOn: ["D1"],
      body: "Chosen over the live Q-card loop.",
    };
    expect(roundTrip(decisionCodec, decision)).toEqual([decision]);
  });

  it("gap", () => {
    const gap: Gap = {
      id: "G1",
      title: "No ops story",
      dimension: "ops",
      status: "open",
      body: "",
    };
    expect(roundTrip(gapCodec, gap)).toEqual([gap]);
  });

  it("risk", () => {
    const risk: Risk = {
      id: "R2",
      title: "Tentative: first customer segment",
      likelihood: "medium",
      impact: "high",
      origin: "Q5 tentative",
      status: "open",
      body: "Re-ask after the first demo.",
    };
    expect(roundTrip(riskCodec, risk)).toEqual([risk]);
  });

  it("parked item", () => {
    const parked: ParkedItem = {
      id: "P1",
      title: "Pricing model?",
      questionId: "Q9",
      assumption: "free while local-only",
      date: "2026-09-25",
      status: "parked",
      body: "",
    };
    expect(roundTrip(parkedCodec, parked)).toEqual([parked]);
  });

  it("idea", () => {
    const idea: Idea = {
      id: "I3",
      title: "Voice answers",
      date: "2026-09-25",
      tags: ["ux", "later"],
      status: "starred",
      body: "Answer question cards by voice.",
    };
    expect(roundTrip(ideaCodec, idea)).toEqual([idea]);
  });

  it("conversation branch", () => {
    const branch: ConversationBranch = {
      id: "B1",
      title: "What if Supabase?",
      sessionId: "s2",
      parentSessionId: "s1",
      gitBranch: "octoplan/supabase-spike",
      status: "exploring",
      body: "",
    };
    expect(roundTrip(branchCodec, branch)).toEqual([branch]);
  });

  it("coverage keeps the human title", () => {
    const [dim] = roundTrip(coverageCodec, {
      id: "users",
      title: "Users",
      status: "partial",
      confidence: "medium",
      questionIds: ["Q1"],
      note: "Solo local user confirmed.",
    });
    expect(dim).toMatchObject({ id: "users", status: "partial", title: "Users" });
  });
});
