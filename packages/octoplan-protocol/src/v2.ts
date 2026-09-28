// v2 contracts (waves 3–6), seeded by the octopus before any worker starts (D35).
// Change them only through the octopus.
import { z } from "zod";
import { isoDate, modeIdSchema } from "./domain";

// ---------- Wave 4: memory ----------

/** H-record in docs/plan/HARVEST.md: a build-time decision Octoplan noticed (D27). */
export const harvestCandidateSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  date: isoDate,
  /** A commit sha, or `todo:<tentacleId>` for a todo change. */
  source: z.string(),
  sourceKind: z.enum(["commit", "todo"]),
  status: z.enum(["pending", "accepted", "rejected"]),
  /** The D-record created when accepted. */
  decisionId: z.string().optional(),
  /** Active decisions this candidate contradicts (drives the "diverged" drift badge, D26). */
  contradicts: z.array(z.string()),
  body: z.string(),
});
export type HarvestCandidate = z.infer<typeof harvestCandidateSchema>;

/** C-record in ~/.octoplan/CONVENTIONS.md: a cross-repo personal convention (D28). */
export const conventionSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  date: isoDate,
  body: z.string(),
});
export type Convention = z.infer<typeof conventionSchema>;

/** One session log in docs/plan/sessions, summarized for the cross-session board (D13). */
export const sessionLogSummarySchema = z.object({
  file: z.string(),
  title: z.string(),
  mode: modeIdSchema,
  startedAt: z.string(),
  claudeSessionId: z.string().optional(),
  summary: z.string(),
  answers: z.number().int().nonnegative(),
  parked: z.number().int().nonnegative(),
  tentative: z.number().int().nonnegative(),
  revisions: z.number().int().nonnegative(),
});
export type SessionLogSummary = z.infer<typeof sessionLogSummarySchema>;

// ---------- Wave 5: overview ----------

export const driftStatusSchema = z.enum(["untouched", "implemented", "diverged"]);
export type DriftStatus = z.infer<typeof driftStatusSchema>;

/** Where a decision stands in the code (D24, D26). Computed, never stored. */
export const decisionDriftSchema = z.object({
  decisionId: z.string(),
  status: driftStatusSchema,
  /** Short human-readable proofs: "abc1234 feat: dock [D14]", "todo ticked in ui-shell", "H3". */
  evidence: z.array(z.string()),
});
export type DecisionDrift = z.infer<typeof decisionDriftSchema>;

/** One tentacle as a card in the G overlay and the header count (D22, D23, D42). */
export const tentacleSummarySchema = z.object({
  tentacleId: z.string(),
  /** CONTEXT.md's first `# Heading`, or the id. */
  name: z.string(),
  description: z.string(),
  done: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  /** Local branches mapped to this tentacle (octogent/<id>/... or containing the id). */
  branches: z.array(z.string()),
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  pr: z
    .object({
      number: z.number().int().positive(),
      state: z.enum(["open", "closed", "merged"]),
      isDraft: z.boolean(),
      checks: z.enum(["pending", "passing", "failing", "none"]),
      url: z.string(),
    })
    .optional(),
  /** Unix seconds of the newest commit on its branches, or the todo.md mtime. */
  lastActivity: z.number().int().optional(),
});
export type TentacleSummary = z.infer<typeof tentacleSummarySchema>;

/** Board History tab (D24). */
export const historyEventSchema = z.object({
  /** ISO date or date-time; sorted ascending by the store. */
  at: z.string(),
  kind: z.enum(["session", "decision", "revision", "stale", "branch", "harvest", "handoff"]),
  /** D12, A7, B2, H3, a session file name... */
  refId: z.string(),
  title: z.string(),
  sessionFile: z.string().optional(),
});
export type HistoryEvent = z.infer<typeof historyEventSchema>;

/** Everything the header button, G cards, drift badges and History tab need for one repo. */
export const overviewSchema = z.object({
  repoPath: z.string(),
  /** The checkout Octogent runs in (D48). */
  workspace: z.string(),
  tentacles: z.array(tentacleSummarySchema),
  drift: z.array(decisionDriftSchema),
  history: z.array(historyEventSchema),
});
export type Overview = z.infer<typeof overviewSchema>;

// ---------- Wave 6: handoff ----------

export const handoffTodoSchema = z.object({
  /** One line, ends with a "Done when …" clause (v1 D24). */
  text: z.string().min(1),
  decisionIds: z.array(z.string()),
  /** "Wave 3", "Stage 2"...; empty = no subheading. */
  wave: z.string(),
});
export type HandoffTodo = z.infer<typeof handoffTodoSchema>;

export const handoffTentacleSchema = z.object({
  /** Octogent tentacle id: lowercase letters, digits and dashes. */
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  description: z.string(),
  /** Repo-relative folders/globs this tentacle owns. */
  owns: z.array(z.string()),
  /** True when the tentacle already exists in the workspace (reused, D33). */
  existing: z.boolean(),
  todos: z.array(handoffTodoSchema),
});
export type HandoffTentacle = z.infer<typeof handoffTentacleSchema>;

/** docs/plan/HANDOFF.md (D46). */
export const handoffPlanSchema = z.object({
  status: z.enum(["draft", "applied"]),
  generatedAt: z.string(),
  appliedAt: z.string().optional(),
  /** "claude" (D45) or "fallback" (from stages, no Claude). */
  source: z.enum(["claude", "fallback"]),
  /** Octogent workspace the plan applies to (D48). */
  workspace: z.string(),
  /** The `## <heading>` todos go under in each todo.md. */
  heading: z.string().min(1),
  tentacles: z.array(handoffTentacleSchema),
  /** docs/plan/OCTOPUS.md content (D47). */
  octopusPrompt: z.string(),
});
export type HandoffPlan = z.infer<typeof handoffPlanSchema>;

export const handoffApplyTentacleResultSchema = z.object({
  tentacleId: z.string(),
  created: z.boolean(),
  added: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  ok: z.boolean(),
  message: z.string(),
});
export type HandoffApplyTentacleResult = z.infer<typeof handoffApplyTentacleResultSchema>;

export const handoffResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  workspace: z.string(),
  tentacles: z.array(handoffApplyTentacleResultSchema),
  /** Octogent UI to open next, when known (e.g. http://localhost:8787). */
  deckUrl: z.string().optional(),
});
export type HandoffResult = z.infer<typeof handoffResultSchema>;
