import {
  COVERAGE_DIMENSION_LABELS,
  type CoverageDimensionId,
  type CoverageState,
  type CoverageStatus,
  type ModeId,
} from "@octogent/octoplan-protocol";
import { describe, expect, it } from "vitest";
import { MODE_IDS, PLANNING_ALLOWED_TOOLS, buildKickoffPrompt, getMode } from "../../server/modes";

const ALL_DIMENSIONS = Object.keys(COVERAGE_DIMENSION_LABELS) as CoverageDimensionId[];

const stateWith = (
  dimensions: readonly CoverageDimensionId[],
  status: (id: CoverageDimensionId) => CoverageStatus,
): CoverageState => ({
  dimensions: dimensions.map((id) => ({
    id,
    status: status(id),
    confidence: "medium",
    questionIds: [],
    note: "",
  })),
});

describe("getMode", () => {
  it("returns all four modes", () => {
    expect(MODE_IDS).toEqual(["deep-interview", "quick-align", "brainstorm", "devils-advocate"]);
    for (const id of MODE_IDS) {
      const mode = getMode(id);
      expect(mode.id).toBe(id);
      expect(mode.label.length).toBeGreaterThan(0);
    }
  });

  it("throws on an unknown mode id", () => {
    expect(() => getMode("nope" as ModeId)).toThrow(/Unknown Octoplan mode/);
  });

  it.each([
    ["deep-interview", ALL_DIMENSIONS],
    ["quick-align", ["problem", "scope", "flows", "success"]],
    ["brainstorm", ["problem", "users", "flows"]],
    ["devils-advocate", ["risks", "ops", "data", "integrations", "success"]],
  ] as const)("%s has the specified dimensions", (id, dimensions) => {
    expect(getMode(id).dimensions).toEqual(dimensions);
  });

  it("uses round size 4 and the planning allowlist for every mode", () => {
    expect(PLANNING_ALLOWED_TOOLS).toEqual([
      "Read",
      "Glob",
      "Grep",
      "AskUserQuestion",
      "mcp__octoplan__*",
    ]);
    for (const id of MODE_IDS) {
      const mode = getMode(id);
      expect(mode.roundSize).toBe(4);
      expect(mode.allowedTools).toEqual(PLANNING_ALLOWED_TOOLS);
    }
  });

  it("hands out copies so callers cannot mutate the registry", () => {
    getMode("quick-align").dimensions.push("ops");
    getMode("quick-align").allowedTools.push("Bash");
    expect(getMode("quick-align").dimensions).toHaveLength(4);
    expect(getMode("quick-align").allowedTools).toEqual(PLANNING_ALLOWED_TOOLS);
  });
});

describe("stop rules", () => {
  const deep = getMode("deep-interview");

  it("deep interview: false while any dimension is partial", () => {
    const state = stateWith(ALL_DIMENSIONS, (id) => (id === "timeline" ? "partial" : "covered"));
    expect(deep.stopRule(state, 999)).toBe(false);
  });

  it("deep interview: true when every dimension is covered", () => {
    expect(
      deep.stopRule(
        stateWith(ALL_DIMENSIONS, () => "covered"),
        0,
      ),
    ).toBe(true);
  });

  it("deep interview: false when a dimension is missing from the state", () => {
    const withoutOps = ALL_DIMENSIONS.filter((id) => id !== "ops");
    const state = stateWith(withoutOps, () => "covered");
    expect(deep.stopRule(state, 50)).toBe(false);
  });

  it("deep interview: no question budget", () => {
    expect(
      deep.stopRule(
        stateWith(ALL_DIMENSIONS, () => "unknown"),
        10_000,
      ),
    ).toBe(false);
  });

  it("quick align: stops after two answered rounds or when its dimensions are covered", () => {
    const quick = getMode("quick-align");
    const empty = stateWith(quick.dimensions, () => "unknown");
    expect(quick.stopRule(empty, 0)).toBe(false);
    expect(quick.stopRule(empty, 1)).toBe(false);
    expect(quick.stopRule(empty, 2)).toBe(true);
    expect(
      quick.stopRule(
        stateWith(quick.dimensions, () => "covered"),
        1,
      ),
    ).toBe(true);
  });

  it("brainstorm and devil's advocate only stop when the user does", () => {
    for (const id of ["brainstorm", "devils-advocate"] as const) {
      const mode = getMode(id);
      expect(
        mode.stopRule(
          stateWith(ALL_DIMENSIONS, () => "covered"),
          100,
        ),
      ).toBe(false);
    }
  });
});

describe("kickoff prompt", () => {
  it("wraps the topic into a first user turn for every mode", () => {
    for (const id of MODE_IDS) {
      const turn = getMode(id).buildKickoffPrompt("  Add magic-link login  ");
      expect(turn).toContain("Add magic-link login");
      expect(turn).not.toContain("  Add");
      expect(turn).toContain("AskUserQuestion");
      expect(buildKickoffPrompt(id, "Add magic-link login")).toBe(turn);
    }
  });

  it("falls back to the repository when the topic is empty", () => {
    expect(getMode("deep-interview").buildKickoffPrompt("   ")).toContain("this repository");
  });
});
