// v2 contracts owned by the modes tentacle (prompt text + pure plan transforms), seeded by the octopus.
import type {
  Decision,
  GoalDoc,
  HandoffPlan,
  HandoffTentacle,
  PlanSnapshot,
  Stage,
} from "@octogent/octoplan-protocol";
import type { ExistingTentacle, HarvestInputs } from "../integrations/types";

/** The headless harvest pass's prompt (D31): propose build-time decisions via plan_add_harvest. */
export type BuildHarvestPrompt = (input: {
  inputs: HarvestInputs;
  decisions: readonly Decision[];
  /** Titles of candidates already recorded (any status): don't propose these again. */
  knownTitles: readonly string[];
}) => string;

export type HandoffPromptInput = {
  snapshot: PlanSnapshot;
  stages: readonly Stage[];
  existing: readonly ExistingTentacle[];
  /** Repo-relative folders two levels deep (no node_modules/.git), for picking `owns`. */
  repoTree: readonly string[];
  heading: string;
};

/** The headless handoff pass's prompt (D45): propose tentacles via plan_propose_handoff. */
export type BuildHandoffPrompt = (input: HandoffPromptInput) => string;

/**
 * Without Claude (or when it proposes nothing usable): reuse existing tentacles as-is, and
 * turn each stage into one tentacle whose todos are that stage's Done-when items (D45).
 */
export type FallbackHandoff = (input: HandoffPromptInput) => HandoffTentacle[];

/**
 * Cleans a proposal: slug ids, one-line "Done when…" todos, known D-ids only, marks
 * `existing` from the workspace, merges duplicate ids. Never returns an empty id.
 */
export type NormalizeHandoff = (
  tentacles: readonly HandoffTentacle[],
  existing: readonly ExistingTentacle[],
  decisions: readonly Decision[],
) => HandoffTentacle[];

/** docs/plan/OCTOPUS.md (D47): the coordinating session's self-contained prompt. */
export type BuildOctopusPrompt = (input: {
  plan: Omit<HandoffPlan, "octopusPrompt">;
  goal: GoalDoc | null;
  decisions: readonly Decision[];
}) => string;
