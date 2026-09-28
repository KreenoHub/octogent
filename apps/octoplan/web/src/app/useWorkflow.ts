// D62: the active repo's workflow, from what the client already holds. deriveWorkflow does the
// deciding; this only gathers its inputs.
import { type Overview, type Workflow, deriveWorkflow } from "@octogent/octoplan-protocol";
import { useMemo } from "react";
import { useOctoplan } from "./useOctoplan";

/** Todo progress of the tentacles the handoff wrote to (all tentacles when it named none). */
export const handedOffTodos = (overview: Overview | undefined, tentacleIds: readonly string[]) => {
  const tentacles = (overview?.tentacles ?? []).filter(
    (t) => tentacleIds.length === 0 || tentacleIds.includes(t.tentacleId),
  );
  return {
    done: tentacles.reduce((sum, t) => sum + t.done, 0),
    total: tentacles.reduce((sum, t) => sum + t.total, 0),
  };
};

export const useWorkflow = (overview: Overview | undefined): Workflow | null => {
  const { state, activeRepo, sessions } = useOctoplan();
  return useMemo(() => {
    if (!activeRepo) return null;
    const snapshot = state.planByRepo[activeRepo] ?? null;
    const repoSessions = new Set(
      sessions.filter((s) => s.repoPath === activeRepo).map((s) => s.id),
    );
    const pendingRound = Object.values(state.rounds).some(
      (entry) => entry.status === "pending" && repoSessions.has(entry.round.sessionId),
    );
    const handoffIds = snapshot?.handoff?.tentacles.map((t) => t.id) ?? [];
    const octogent = state.octogentStatusByRepo[activeRepo]?.state;
    return deriveWorkflow({
      snapshot,
      stageCount: state.stagesByRepo[activeRepo]?.length ?? 0,
      pendingRound,
      hasSession: repoSessions.size > 0,
      ...(octogent ? { octogent } : {}),
      todos: handedOffTodos(overview, handoffIds),
    });
  }, [state, activeRepo, sessions, overview]);
};
