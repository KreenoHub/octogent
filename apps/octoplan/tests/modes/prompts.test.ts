import {
  COVERAGE_DIMENSION_LABELS,
  PARKED_MARKER,
  REVISION_MARKER,
  TENTATIVE_MARKER,
} from "@octogent/octoplan-protocol";
import { describe, expect, it } from "vitest";
import { MODE_IDS, getMode } from "../../server/modes";
import { PLAN_TOOLS, type PlanToolKey } from "../../server/modes/prompts/shared";

const REQUIRED_TOOLS: Record<(typeof MODE_IDS)[number], PlanToolKey[]> = {
  "deep-interview": ["updateCoverage", "recordDecision", "addRisk", "addGap", "park", "writeGoal"],
  "quick-align": ["updateCoverage", "recordDecision", "addRisk", "park"],
  brainstorm: ["updateCoverage", "recordDecision", "addRisk", "park", "addIdea"],
  "devils-advocate": ["updateCoverage", "recordDecision", "addRisk", "addGap", "park"],
};

describe("mode system prompts", () => {
  it.each(MODE_IDS)("%s follows the shared prompt rules", (id) => {
    const prompt = getMode(id).systemPromptAppend;
    expect(prompt).toContain("AskUserQuestion");
    expect(prompt).toContain("(Recommended)");
    expect(prompt).toContain("2–4");
    expect(prompt).toContain(PARKED_MARKER);
    expect(prompt).toContain(TENTATIVE_MARKER);
    expect(prompt).toContain(REVISION_MARKER);
    expect(prompt).toContain("questionIds");
    expect(prompt).toContain("regress");
  });

  it.each(MODE_IDS)("%s names every plan tool it needs", (id) => {
    const prompt = getMode(id).systemPromptAppend;
    for (const key of REQUIRED_TOOLS[id]) {
      expect(prompt).toContain(PLAN_TOOLS[key]);
    }
  });

  it.each(MODE_IDS)("%s lists its coverage dimensions by id and label", (id) => {
    const mode = getMode(id);
    for (const dimension of mode.dimensions) {
      expect(mode.systemPromptAppend).toContain(
        `\`${dimension}\` — ${COVERAGE_DIMENSION_LABELS[dimension]}`,
      );
    }
  });

  it.each(MODE_IDS)("%s picks the lowest-coverage dimension next", (id) => {
    expect(getMode(id).systemPromptAppend).toMatch(/lowest coverage first/i);
  });

  it("only the deep interview writes GOAL.md", () => {
    for (const id of MODE_IDS) {
      const hasWriteGoal = getMode(id).systemPromptAppend.includes(PLAN_TOOLS.writeGoal);
      expect(hasWriteGoal).toBe(id === "deep-interview");
    }
  });

  it("each mode states how it ends", () => {
    expect(getMode("deep-interview").systemPromptAppend).toMatch(/every dimension .*covered/i);
    expect(getMode("quick-align").systemPromptAppend).toContain("## Plan");
    expect(getMode("brainstorm").systemPromptAppend).toMatch(/6–10 ideas/);
    expect(getMode("brainstorm").systemPromptAppend).toMatch(/star.*merge.*kill.*park/is);
    expect(getMode("devils-advocate").systemPromptAppend).toMatch(/what breaks/i);
  });
});
