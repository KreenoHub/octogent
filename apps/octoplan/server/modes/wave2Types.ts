// Wave-2 contracts owned by the modes tentacle, seeded by the octopus.
import type { Decision, GoalDoc, Idea, IdeaAction, Stage } from "@octogent/octoplan-protocol";

export type IdeaActionResult = { ok: true; changed: Idea[] } | { ok: false; error: string };

/**
 * Pure brainstorm transition: returns only the ideas that changed (the store writes them).
 * "merge" folds `ideaId` into `intoId` and records both ids in the surviving idea's body.
 */
export type ApplyIdeaAction = (
  ideas: readonly Idea[],
  ideaId: string,
  action: IdeaAction,
  intoId?: string,
) => IdeaActionResult;

/** The user turn that asks Claude to turn starred ideas into decisions. */
export type BuildConvergeTurn = (ideas: readonly Idea[]) => string;

/** Self-contained build-a-stage-then-stop prompts from the plan. */
export type BuildStages = (goal: GoalDoc, decisions: readonly Decision[]) => Stage[];
