// Pure selectors for the v2 plan board: needs-attention (D9, D17), conversation branches and
// cross-session rows (D13), drift badges and history (D24), and the header tentacle count (D42).
import type {
  DecisionDrift,
  GitGraph,
  HarvestCandidate,
  HistoryEvent,
  Overview,
  PlanSnapshot,
  Risk,
  Session,
} from "@octogent/octoplan-protocol";
import type { RoundEntry } from "./planClientReducer";

export type AttentionItem =
  | { kind: "stale"; id: string; title: string }
  | { kind: "round"; id: string; title: string; sessionId: string }
  | { kind: "risk"; id: string; title: string }
  | { kind: "harvest"; id: string; title: string; candidate: HarvestCandidate };

/** Risks the store wrote for a tentative answer carry an origin like "Q7 tentative". */
export const isTentativeRisk = (risk: Risk): boolean =>
  risk.status === "open" && /\btentative\b/i.test(risk.origin);

/** Everything on the board that is waiting for the user, in a fixed kind order. */
export const needsAttention = (
  plan: PlanSnapshot | undefined,
  rounds: Record<string, RoundEntry>,
  sessions: readonly Session[],
  repoPath: string,
): AttentionItem[] => {
  const repoSessions = new Map(
    sessions.filter((s) => s.repoPath === repoPath).map((s) => [s.id, s] as const),
  );
  const pending = Object.values(rounds)
    .filter((entry) => entry.status === "pending" && repoSessions.has(entry.round.sessionId))
    .sort((a, b) => a.round.askedAt.localeCompare(b.round.askedAt));
  return [
    ...(plan?.decisions ?? [])
      .filter((d) => d.status === "stale")
      .map((d): AttentionItem => ({ kind: "stale", id: d.id, title: d.title })),
    ...pending.map(({ round }): AttentionItem => {
      const session = repoSessions.get(round.sessionId);
      return {
        kind: "round",
        id: `Round ${round.index}`,
        title: `${session?.title || "Untitled"} · ${round.questions.length}Q`,
        sessionId: round.sessionId,
      };
    }),
    ...(plan?.risks ?? [])
      .filter(isTentativeRisk)
      .map((r): AttentionItem => ({ kind: "risk", id: r.id, title: r.title })),
    ...(plan?.harvest ?? [])
      .filter((h) => h.status === "pending")
      .map((h): AttentionItem => ({ kind: "harvest", id: h.id, title: h.title, candidate: h })),
  ];
};

/** "commit abc1234" or "todo ui-shell" for a harvest candidate's source line. */
export const harvestSource = (candidate: HarvestCandidate): string =>
  candidate.sourceKind === "commit"
    ? `commit ${candidate.source.slice(0, 7)}`
    : `todo ${candidate.source.replace(/^todo:/, "")}`;

export type BranchRow = {
  sessionId: string;
  title: string;
  parentTitle: string;
  status: string;
  gitBranch?: string;
};

/** Conversation branches: live forked sessions, enriched by the graph's B-records when loaded. */
export const conversationBranches = (
  sessions: readonly Session[],
  repoPath: string,
  graph: GitGraph | undefined,
): BranchRow[] => {
  const titles = new Map(sessions.map((s) => [s.id, s.title || "Untitled"] as const));
  const records = new Map((graph?.conversationBranches ?? []).map((b) => [b.sessionId, b]));
  const rows: BranchRow[] = sessions
    .filter((s) => s.repoPath === repoPath && s.parentSessionId)
    .map((s) => {
      const record = records.get(s.id);
      records.delete(s.id);
      return {
        sessionId: s.id,
        title: record?.title ?? (s.title || "Untitled"),
        parentTitle: titles.get(s.parentSessionId ?? "") ?? "an earlier session",
        status: record?.status ?? "exploring",
        ...(record?.gitBranch ? { gitBranch: record.gitBranch } : {}),
      };
    });
  for (const record of records.values()) {
    rows.push({
      sessionId: record.sessionId,
      title: record.title,
      parentTitle: titles.get(record.parentSessionId) ?? "an earlier session",
      status: record.status,
      ...(record.gitBranch ? { gitBranch: record.gitBranch } : {}),
    });
  }
  return rows;
};

export const driftByDecision = (overview: Overview | undefined): Map<string, DecisionDrift> =>
  new Map((overview?.drift ?? []).map((drift) => [drift.decisionId, drift]));

/** Oldest first, newest last; stable for equal timestamps. */
export const historyTimeline = (overview: Overview | undefined): HistoryEvent[] =>
  (overview?.history ?? [])
    .map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.at.localeCompare(b.event.at) || a.index - b.index)
    .map(({ event }) => event);

/** Aggregate todo progress across every tentacle, or null before the first overview. */
export const tentacleProgress = (
  overview: Overview | undefined,
): { done: number; total: number } | null =>
  overview
    ? overview.tentacles.reduce(
        (sum, t) => ({ done: sum.done + t.done, total: sum.total + t.total }),
        { done: 0, total: 0 },
      )
    : null;
