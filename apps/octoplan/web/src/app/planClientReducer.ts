import type {
  Answer,
  GitGraph,
  IdeaSearchResult,
  MessageBlock,
  PlanSnapshot,
  QuestionRound,
  ServerEvent,
  Session,
  Stage,
} from "@octogent/octoplan-protocol";

export type RoundEntry = {
  round: QuestionRound;
  status: "pending" | "answered";
  answers: Answer[];
};

export type ServerError = { message: string; sessionId?: string };

/** A server `notice`; `id` is a client-side sequence number so toasts can expire one by one. */
export type Notice = { id: number; message: string; sessionId?: string };

export type IdeaSearch = { query: string; results: IdeaSearchResult[] };

/** A server `export-result`; `seq` orders it against the moment a dialog submitted. */
export type ExportResult = {
  seq: number;
  repoPath: string;
  tentacleId: string;
  ok: boolean;
  message: string;
};

/** Client-only actions the store folds in next to server events. */
export type LocalAction = { type: "local/graph-requested"; repoPath: string };

export type PlanClientAction = ServerEvent | LocalAction;

export type PlanClientState = {
  serverVersion: string | null;
  sessions: Session[];
  blocksBySession: Record<string, MessageBlock[]>;
  /** Keyed by round id. */
  rounds: Record<string, RoundEntry>;
  /** round-answered events that arrived before their question-round, keyed by round id. */
  earlyAnswers: Record<string, Answer[]>;
  planByRepo: Record<string, PlanSnapshot>;
  errors: ServerError[];
  /** Monotonic counter for notice ids and export-result seqs. */
  seq: number;
  /** Most recent last; the toast component expires them, the reducer only caps the list. */
  notices: Notice[];
  /** The latest `ideas` reply, or null before any search. */
  ideaSearch: IdeaSearch | null;
  stagesByRepo: Record<string, Stage[]>;
  exportResults: ExportResult[];
  graphByRepo: Record<string, GitGraph>;
  /** True between a `request-graph` send and its `graph` reply (or any server error). */
  graphLoadingByRepo: Record<string, boolean>;
};

export const MAX_ERRORS = 20;
export const MAX_NOTICES = 20;
export const MAX_EXPORT_RESULTS = 20;

export const initialPlanClientState: PlanClientState = {
  serverVersion: null,
  sessions: [],
  blocksBySession: {},
  rounds: {},
  earlyAnswers: {},
  planByRepo: {},
  errors: [],
  seq: 0,
  notices: [],
  ideaSearch: null,
  stagesByRepo: {},
  exportResults: [],
  graphByRepo: {},
  graphLoadingByRepo: {},
};

const upsertById = <T extends { id: string }>(items: T[], item: T): T[] => {
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index === -1) return [...items, item];
  const next = items.slice();
  next[index] = item;
  return next;
};

export const planClientReducer = (
  state: PlanClientState,
  event: PlanClientAction,
): PlanClientState => {
  switch (event.type) {
    case "hello":
      return { ...state, serverVersion: event.serverVersion };
    case "sessions":
      return { ...state, sessions: event.sessions };
    case "session-updated":
      return { ...state, sessions: upsertById(state.sessions, event.session) };
    case "block": {
      const existing = state.blocksBySession[event.sessionId] ?? [];
      return {
        ...state,
        blocksBySession: {
          ...state.blocksBySession,
          [event.sessionId]: upsertById(existing, event.block),
        },
      };
    }
    case "question-round": {
      const { round } = event;
      const previous = state.rounds[round.id];
      const early = state.earlyAnswers[round.id];
      const { [round.id]: _consumed, ...earlyAnswers } = state.earlyAnswers;
      const entry: RoundEntry = early
        ? { round, status: "answered", answers: early }
        : previous?.status === "answered"
          ? { ...previous, round }
          : { round, status: "pending", answers: [] };
      return { ...state, rounds: { ...state.rounds, [round.id]: entry }, earlyAnswers };
    }
    case "round-answered": {
      const previous = state.rounds[event.roundId];
      if (!previous) {
        return {
          ...state,
          earlyAnswers: { ...state.earlyAnswers, [event.roundId]: event.answers },
        };
      }
      return {
        ...state,
        rounds: {
          ...state.rounds,
          [event.roundId]: { ...previous, status: "answered", answers: event.answers },
        },
      };
    }
    case "plan":
      return { ...state, planByRepo: { ...state.planByRepo, [event.repoPath]: event.plan } };
    case "error": {
      const error: ServerError =
        event.sessionId === undefined
          ? { message: event.message }
          : { message: event.message, sessionId: event.sessionId };
      // An error may be the reply to a pending graph request; never leave the spinner stuck.
      return {
        ...state,
        errors: [...state.errors, error].slice(-MAX_ERRORS),
        graphLoadingByRepo: {},
      };
    }
    case "notice": {
      const seq = state.seq + 1;
      const notice: Notice =
        event.sessionId === undefined
          ? { id: seq, message: event.message }
          : { id: seq, message: event.message, sessionId: event.sessionId };
      return { ...state, seq, notices: [...state.notices, notice].slice(-MAX_NOTICES) };
    }
    case "ideas":
      return { ...state, ideaSearch: { query: event.query, results: event.results } };
    case "stages":
      return { ...state, stagesByRepo: { ...state.stagesByRepo, [event.repoPath]: event.stages } };
    case "export-result": {
      const seq = state.seq + 1;
      const result: ExportResult = {
        seq,
        repoPath: event.repoPath,
        tentacleId: event.tentacleId,
        ok: event.ok,
        message: event.message,
      };
      return {
        ...state,
        seq,
        exportResults: [...state.exportResults, result].slice(-MAX_EXPORT_RESULTS),
      };
    }
    case "graph": {
      const { repoPath } = event.graph;
      const { [repoPath]: _done, ...graphLoadingByRepo } = state.graphLoadingByRepo;
      return {
        ...state,
        graphByRepo: { ...state.graphByRepo, [repoPath]: event.graph },
        graphLoadingByRepo,
      };
    }
    case "local/graph-requested":
      return {
        ...state,
        graphLoadingByRepo: { ...state.graphLoadingByRepo, [event.repoPath]: true },
      };
  }
};

/** Rounds still waiting for an answer in one session, oldest first. */
export const selectPendingRounds = (state: PlanClientState, sessionId: string): RoundEntry[] =>
  Object.values(state.rounds)
    .filter((entry) => entry.round.sessionId === sessionId && entry.status === "pending")
    .sort((a, b) => a.round.index - b.round.index);

/** Rounds already answered in one session, oldest first. */
export const selectAnsweredRounds = (state: PlanClientState, sessionId: string): RoundEntry[] =>
  Object.values(state.rounds)
    .filter((entry) => entry.round.sessionId === sessionId && entry.status === "answered")
    .sort((a, b) => a.round.index - b.round.index);
