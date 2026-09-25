import type {
  Answer,
  MessageBlock,
  PlanSnapshot,
  QuestionRound,
  ServerEvent,
  Session,
} from "@octogent/octoplan-protocol";

export type RoundEntry = {
  round: QuestionRound;
  status: "pending" | "answered";
  answers: Answer[];
};

export type ServerError = { message: string; sessionId?: string };

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
};

export const MAX_ERRORS = 20;

export const initialPlanClientState: PlanClientState = {
  serverVersion: null,
  sessions: [],
  blocksBySession: {},
  rounds: {},
  earlyAnswers: {},
  planByRepo: {},
  errors: [],
};

const upsertById = <T extends { id: string }>(items: T[], item: T): T[] => {
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index === -1) return [...items, item];
  const next = items.slice();
  next[index] = item;
  return next;
};

export const planClientReducer = (state: PlanClientState, event: ServerEvent): PlanClientState => {
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
      return { ...state, errors: [...state.errors, error].slice(-MAX_ERRORS) };
    }
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
