// Contract between the store tentacle and its consumers (bridge, modes).
// Owned by the store tentacle; seeded by the octopus so wave-1 workers can build
// in parallel. Change it only through the octopus.
import type {
  Answer,
  CoverageDimension,
  CoverageState,
  Decision,
  Gap,
  GoalDoc,
  Idea,
  ModeId,
  ParkedItem,
  PlanSnapshot,
  QuestionRound,
  Risk,
  SessionLogEntry,
} from "@octogent/octoplan-protocol";

export type DecisionInput = Omit<Decision, "id" | "date" | "status"> & {
  // Omit id to allocate the next D<n>; pass one to update an existing decision.
  id?: string;
  date?: string;
  status?: Decision["status"];
};

export type StartSessionLogInput = {
  sessionId: string;
  title: string;
  mode: ModeId;
  startedAt: string;
  claudeSessionId?: string;
};

export type PlanChangeListener = (snapshot: PlanSnapshot) => void;

export interface PlanStore {
  readonly repoPath: string;

  /** Everything the plan board needs, read from docs/plan (rebuildable, never cached-only). */
  snapshot(): Promise<PlanSnapshot>;

  /** Creates docs/plan/sessions/<date>-<slug>.md for this Octoplan session. Returns its absolute path. */
  startSessionLog(input: StartSessionLogInput): Promise<string>;
  setClaudeSessionId(sessionId: string, claudeSessionId: string): Promise<void>;
  writeSessionSummary(sessionId: string, summary: string): Promise<void>;

  /**
   * Appends one session-log entry per answer (A<n>). Parked answers also add a PARKED.md
   * item; tentative answers also add a RISKS.md item. An answer with `revisionOf` becomes
   * a new entry with `revises: A<k>` pointing at that question's latest entry (D23).
   */
  recordAnswers(
    sessionId: string,
    round: QuestionRound,
    answers: Answer[],
  ): Promise<SessionLogEntry[]>;
  /** Latest recorded entry for a question in a session, or null. */
  latestAnswer(sessionId: string, questionId: string): Promise<SessionLogEntry | null>;

  upsertDecision(input: DecisionInput): Promise<Decision>;
  markDecisionsStale(ids: readonly string[]): Promise<void>;
  /** Active decisions whose `questions` or `depends-on` include the question id. */
  dependentDecisions(questionId: string): Promise<Decision[]>;

  addGap(input: Omit<Gap, "id">): Promise<Gap>;
  addRisk(input: Omit<Risk, "id">): Promise<Risk>;
  park(input: Omit<ParkedItem, "id">): Promise<ParkedItem>;
  addIdea(input: Omit<Idea, "id">): Promise<Idea>;

  /** Replaces one dimension's record in COVERAGE.md; returns the full coverage state. */
  updateCoverage(dimension: CoverageDimension): Promise<CoverageState>;
  writeGoal(goal: GoalDoc): Promise<void>;

  /** Fires after Octoplan's own writes and after external edits to docs/plan (debounced). */
  onChange(listener: PlanChangeListener): () => void;
  dispose(): Promise<void>;
}

export type PlanStoreFactory = (repoPath: string) => PlanStore;
