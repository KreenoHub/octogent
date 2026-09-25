import {
  COVERAGE_DIMENSION_LABELS,
  type CoverageDimensionId,
  type CoverageState,
  type ModeId,
} from "@octogent/octoplan-protocol";
import { buildBrainstormKickoff, buildBrainstormPrompt } from "./prompts/brainstorm";
import { buildDeepInterviewKickoff, buildDeepInterviewPrompt } from "./prompts/deepInterview";
import { buildDevilsAdvocateKickoff, buildDevilsAdvocatePrompt } from "./prompts/devilsAdvocate";
import { buildQuickAlignKickoff, buildQuickAlignPrompt } from "./prompts/quickAlign";
import type { SharedRulesInput } from "./prompts/shared";
import type { ModeDefinition } from "./types";

/** SPEC §3.4: the only tools a planning session may use. */
export const PLANNING_ALLOWED_TOOLS: readonly string[] = [
  "Read",
  "Glob",
  "Grep",
  "AskUserQuestion",
  "mcp__octoplan__*",
];

export const MODE_IDS: readonly ModeId[] = [
  "deep-interview",
  "quick-align",
  "brainstorm",
  "devils-advocate",
];

const ROUND_SIZE = 4;
/** Quick align ends after this many answered rounds (SPEC §4: "after 1–2 rounds"). */
export const QUICK_ALIGN_MAX_ROUNDS = 2;

const allCovered = (coverage: CoverageState, dimensions: readonly CoverageDimensionId[]) =>
  dimensions.every(
    (id) => coverage.dimensions.find((dimension) => dimension.id === id)?.status === "covered",
  );

type ModeSpec = {
  label: string;
  dimensions: CoverageDimensionId[];
  buildPrompt: (input: SharedRulesInput) => string;
  buildKickoffPrompt: (topic: string) => string;
  /** `dimensions` is passed in so the rule never depends on a caller-mutated copy. */
  stopRule: (
    coverage: CoverageState,
    answeredRounds: number,
    dimensions: readonly CoverageDimensionId[],
  ) => boolean;
};

const SPECS: Record<ModeId, ModeSpec> = {
  "deep-interview": {
    label: "Deep interview",
    dimensions: Object.keys(COVERAGE_DIMENSION_LABELS) as CoverageDimensionId[],
    buildPrompt: buildDeepInterviewPrompt,
    buildKickoffPrompt: buildDeepInterviewKickoff,
    // D9: no question budget; only full coverage (or the user) ends it.
    stopRule: (coverage, _answered, dimensions) => allCovered(coverage, dimensions),
  },
  "quick-align": {
    label: "Quick align",
    dimensions: ["problem", "scope", "flows", "success"],
    buildPrompt: buildQuickAlignPrompt,
    buildKickoffPrompt: buildQuickAlignKickoff,
    stopRule: (coverage, answered, dimensions) =>
      answered >= QUICK_ALIGN_MAX_ROUNDS || allCovered(coverage, dimensions),
  },
  brainstorm: {
    label: "Brainstorm",
    dimensions: ["problem", "users", "flows"],
    buildPrompt: buildBrainstormPrompt,
    buildKickoffPrompt: buildBrainstormKickoff,
    // Ends when the user converges.
    stopRule: () => false,
  },
  "devils-advocate": {
    label: "Devil's advocate",
    dimensions: ["risks", "ops", "data", "integrations", "success"],
    buildPrompt: buildDevilsAdvocatePrompt,
    buildKickoffPrompt: buildDevilsAdvocateKickoff,
    // Ends when the user stops.
    stopRule: () => false,
  },
};

const PROMPTS = new Map<ModeId, string>(
  MODE_IDS.map((id) => {
    const { label, dimensions, buildPrompt } = SPECS[id];
    return [id, buildPrompt({ modeLabel: label, dimensions, roundSize: ROUND_SIZE })];
  }),
);

/**
 * Returns a fresh ModeDefinition. `stopRule`'s second argument is the number of
 * answered question ROUNDS (not individual questions).
 */
export const getMode = (id: ModeId): ModeDefinition => {
  const spec = (SPECS as Partial<Record<string, ModeSpec>>)[id];
  const prompt = PROMPTS.get(id);
  if (!spec || prompt === undefined) {
    throw new Error(`Unknown Octoplan mode "${id}". Expected one of: ${MODE_IDS.join(", ")}.`);
  }
  const dimensions = [...spec.dimensions];
  return {
    id,
    label: spec.label,
    systemPromptAppend: prompt,
    allowedTools: [...PLANNING_ALLOWED_TOOLS],
    dimensions: [...dimensions],
    roundSize: ROUND_SIZE,
    stopRule: (coverage, answeredCount) => spec.stopRule(coverage, answeredCount, dimensions),
    buildKickoffPrompt: spec.buildKickoffPrompt,
  };
};

/** Turns a kickoff topic into the first user turn for a session in `modeId`. */
export const buildKickoffPrompt = (modeId: ModeId, topic: string): string =>
  getMode(modeId).buildKickoffPrompt(topic);
