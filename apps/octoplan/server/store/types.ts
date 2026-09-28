// Contract between the store tentacle and its consumers (bridge, modes).
// Owned by the store tentacle; seeded by the octopus so wave-1 workers can build
// in parallel. Change it only through the octopus.
import type {
  Answer,
  ConversationBranch,
  CoverageDimension,
  CoverageState,
  Decision,
  Gap,
  GoalDoc,
  Idea,
  IdeaSearchResult,
  ModeId,
  ParkedItem,
  PlanSnapshot,
  QuestionRound,
  Risk,
  SessionLogEntry,
  Stage,
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

  // ---- Wave 2 ----
  /** Replaces an existing idea (status, tags, body) in IDEAS.md; unknown ids throw. */
  updateIdea(idea: Idea): Promise<Idea>;
  /** docs/plan/stages/STAGE-n.md, sorted by index. */
  readStages(): Promise<Stage[]>;
  /** Writes every stage file; STAGE-n files beyond the new list are removed. */
  writeStages(stages: readonly Stage[]): Promise<void>;
  /** docs/plan/branches.md (B-records). */
  readBranches(): Promise<ConversationBranch[]>;
  upsertBranch(input: BranchInput): Promise<ConversationBranch>;

  /** Fires after Octoplan's own writes and after external edits to docs/plan (debounced). */
  onChange(listener: PlanChangeListener): () => void;
  dispose(): Promise<void>;
}

export type BranchInput = Omit<ConversationBranch, "id"> & { id?: string };

export type PlanStoreFactory = (repoPath: string) => PlanStore;

/**
 * Cross-project idea search (wave 2). Known repos are listed in ~/.octoplan/projects.json
 * (paths only; the ideas stay in each repo's IDEAS.md).
 */
export interface IdeaRegistry {
  registerRepo(repoPath: string): Promise<void>;
  searchIdeas(query: string): Promise<IdeaSearchResult[]>;
}
