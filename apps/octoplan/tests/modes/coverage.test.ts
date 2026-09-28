import type { CoverageState } from "@octogent/octoplan-protocol";
import { describe, expect, it } from "vitest";
import { getMode } from "../../server/modes";
import {
  applyAnsweredQuestions,
  applyCoverageUpdate,
  coverageScore,
  coverageUpdateSchema,
  initialCoverage,
} from "../../server/modes/coverage";

const quick = () => initialCoverage(getMode("quick-align"));
const dim = (state: CoverageState, id: string) => state.dimensions.find((d) => d.id === id);

describe("initialCoverage", () => {
  it("starts every mode dimension at unknown/low", () => {
    expect(quick()).toEqual({
      dimensions: ["problem", "scope", "flows", "success"].map((id) => ({
        id,
        status: "unknown",
        confidence: "low",
        questionIds: [],
        note: "",
      })),
    });
    expect(initialCoverage("deep-interview").dimensions).toHaveLength(12);
  });
});

describe("applyCoverageUpdate", () => {
  it("moves status forward and never mutates its input", () => {
    const start = quick();
    const next = applyCoverageUpdate(start, { id: "scope", status: "partial", note: " MVP only " });
    expect(dim(next, "scope")).toMatchObject({ status: "partial", note: "MVP only" });
    expect(dim(start, "scope")?.status).toBe("unknown");
    const covered = applyCoverageUpdate(next, { id: "scope", status: "covered" });
    expect(dim(covered, "scope")?.status).toBe("covered");
    expect(dim(covered, "scope")?.note).toBe("MVP only");
  });

  it("ignores backward moves without regress", () => {
    const covered = applyCoverageUpdate(quick(), { id: "flows", status: "covered" });
    const attempt = applyCoverageUpdate(covered, {
      id: "flows",
      status: "unknown",
      confidence: "high",
    });
    expect(dim(attempt, "flows")).toMatchObject({ status: "covered", confidence: "high" });
    const partial = applyCoverageUpdate(covered, { id: "flows", status: "partial" });
    expect(dim(partial, "flows")?.status).toBe("covered");
  });

  it("moves backward with an explicit regress", () => {
    const covered = applyCoverageUpdate(quick(), { id: "flows", status: "covered" });
    const reopened = applyCoverageUpdate(covered, {
      id: "flows",
      status: "partial",
      regress: true,
      note: "Revision of Q4 reopened checkout",
    });
    expect(dim(reopened, "flows")).toMatchObject({
      status: "partial",
      note: "Revision of Q4 reopened checkout",
    });
  });

  it("links question ids without duplicates, keeping order", () => {
    let state = applyCoverageUpdate(quick(), { id: "problem", questionIds: ["Q1", "Q2", "Q1"] });
    state = applyCoverageUpdate(state, { id: "problem", questionIds: ["Q2", " Q3 ", ""] });
    expect(dim(state, "problem")?.questionIds).toEqual(["Q1", "Q2", "Q3"]);
  });

  it("keeps the note when the update omits it or sends blank text", () => {
    let state = applyCoverageUpdate(quick(), { id: "problem", note: "Churn from slow login" });
    state = applyCoverageUpdate(state, { id: "problem", note: "   " });
    expect(dim(state, "problem")?.note).toBe("Churn from slow login");
  });

  it("appends a dimension outside the mode instead of dropping the update", () => {
    const state = applyCoverageUpdate(quick(), { id: "ops", status: "partial" });
    expect(state.dimensions.map((d) => d.id)).toEqual([
      "problem",
      "scope",
      "flows",
      "success",
      "ops",
    ]);
    expect(dim(state, "ops")).toMatchObject({ status: "partial", confidence: "low" });
  });

  it("validates tool payloads with coverageUpdateSchema", () => {
    expect(coverageUpdateSchema.safeParse({ id: "scope", status: "covered" }).success).toBe(true);
    expect(coverageUpdateSchema.safeParse({ id: "nope", status: "covered" }).success).toBe(false);
    expect(coverageUpdateSchema.safeParse({ id: "scope", status: "done" }).success).toBe(false);
  });
});

describe("applyAnsweredQuestions", () => {
  it("links answered questions to their dimension and lifts unknown to partial", () => {
    let state = applyCoverageUpdate(quick(), { id: "scope", status: "covered" });
    state = applyAnsweredQuestions(state, [
      { id: "Q1", dimension: "problem" },
      { id: "Q2", dimension: "scope" },
      { id: "Q3" },
    ]);
    expect(dim(state, "problem")).toMatchObject({ status: "partial", questionIds: ["Q1"] });
    expect(dim(state, "scope")).toMatchObject({ status: "covered", questionIds: ["Q2"] });
    expect(dim(state, "flows")?.questionIds).toEqual([]);
  });
});

describe("coverageScore", () => {
  it("returns the covered share", () => {
    expect(coverageScore({ dimensions: [] })).toBe(0);
    let state = quick();
    expect(coverageScore(state)).toBe(0);
    state = applyCoverageUpdate(state, { id: "problem", status: "covered" });
    state = applyCoverageUpdate(state, { id: "scope", status: "partial" });
    expect(coverageScore(state)).toBe(0.25);
    state = applyCoverageUpdate(state, { id: "scope", status: "covered" });
    expect(coverageScore(state)).toBe(0.5);
  });
});
