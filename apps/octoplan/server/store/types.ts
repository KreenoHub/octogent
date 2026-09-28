// Contract between the store tentacle and its consumers (bridge, modes).
// Owned by the store tentacle; seeded by the octopus so wave-1 workers can build
// in parallel. Change it only through the octopus.
import type {
  Answer,
  Convention,
  ConversationBranch,
  CoverageDimension,
  CoverageState,
  Decision,
  Gap,
  GoalDoc,
  HandoffPlan,
  IngestDraft,
  HarvestCandidate,
  HistoryEvent,
  Idea,
  IdeaSearchResult,
  ModeId,
  ParkedItem,
  PlanSnapshot,
  QuestionRound,
  Risk,
  ServerEvent,
  Session,
  SessionLogEntry,
  SessionLogSummary,
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

  // ---- v2 (waves 3–6) ----
  /** docs/plan/HARVEST.md H-records (D27). Also on `snapshot().harvest`. */
  readHarvest(): Promise<HarvestCandidate[]>;
  /**
   * Adds pending candidates. A candidate whose title matches (case-insensitive) an existing
   * candidate of any status is skipped, so rejected ideas never come back. Returns the added ones.
   */
  addHarvest(inputs: readonly HarvestCandidateInput[]): Promise<HarvestCandidate[]>;
  /** accept: writes a D-record from the candidate (source "harvest H<n>") and links it. */
  resolveHarvest(
    id: string,
    action: "accept" | "reject",
  ): Promise<{ candidate: HarvestCandidate; decision?: Decision }>;
  /** Newest commit sha the last harvest covered (HARVEST.md preamble), or null. */
  harvestMark(): Promise<string | null>;
  setHarvestMark(sha: string): Promise<void>;

  /** Every docs/plan/sessions/*.md summarized, newest first (D13). Also on the snapshot. */
  readSessionLogs(): Promise<SessionLogSummary[]>;
  /** Board History tab (D24): sessions, decisions (by date), revisions, stale marks, branches, harvest, handoff. */
  readHistory(): Promise<HistoryEvent[]>;

  /** docs/plan/HANDOFF.md (D46). Also on `snapshot().handoff`. */
  readHandoff(): Promise<HandoffPlan | null>;
  writeHandoff(plan: HandoffPlan): Promise<void>;
  /** docs/plan/OCTOPUS.md (D47). */
  writeOctopusPrompt(markdown: string): Promise<void>;

  // ---- v3 ----
  /** docs/plan/INGEST.md (D56). Also on `snapshot().ingest`. */
  readIngest(): Promise<IngestDraft | null>;
  writeIngest(draft: IngestDraft): Promise<void>;
  /** Saves pasted import text as docs/plan/sources/pasted-<n>.md; returns that plan-relative path. */
  writePastedSource(text: string): Promise<string>;

  /** Fires after Octoplan's own writes and after external edits to docs/plan (debounced). */
  onChange(listener: PlanChangeListener): () => void;
  dispose(): Promise<void>;
}

export type HarvestCandidateInput = Omit<
  HarvestCandidate,
  "id" | "status" | "decisionId" | "date"
> & {
  date?: string;
};

/**
 * Per-session event log for restoring the cockpit after a server restart (D29). Lives in
 * ~/.octoplan/transcripts/<sessionId>.jsonl: runtime state like projects.json, not plan
 * content (the plan itself is always in docs/plan).
 */
export type TranscriptRecord = {
  /** The last `session-updated` state. */
  session: Session;
  /** Every block, question-round and round-answered event, in order. */
  events: ServerEvent[];
};

export interface TranscriptStore {
  /** Appends one event; only session-updated, block, question-round and round-answered are kept. */
  append(sessionId: string, event: ServerEvent): Promise<void>;
  /** All transcripts, oldest session first. Corrupt lines are skipped, never thrown. */
  load(): Promise<TranscriptRecord[]>;
}

/** ~/.octoplan/CONVENTIONS.md C-records (D28). */
export interface ConventionsStore {
  list(): Promise<Convention[]>;
  add(input: { title: string; body: string }): Promise<Convention>;
  remove(id: string): Promise<void>;
}

export type UserStoresOptions = {
  /** Folder that holds `.octoplan/` (default: the user's home folder). */
  homeDir?: string;
  now?: () => Date;
};

export type BranchInput = Omit<ConversationBranch, "id"> & { id?: string };

export type PlanStoreFactory = (repoPath: string) => PlanStore;

/**
 * Cross-project idea search (wave 2). Known repos are listed in ~/.octoplan/projects.json
 * (paths only; the ideas stay in each repo's IDEAS.md).
 */
export interface IdeaRegistry {
  registerRepo(repoPath: string): Promise<void>;
  searchIdeas(query: string): Promise<IdeaSearchResult[]>;
  /** v3: known repos, oldest registration first (the default parent for a new project, D51). */
  listRepos(): Promise<string[]>;
}
