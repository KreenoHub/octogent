import type { Overview } from "@octogent/octoplan-protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOctoplan } from "./useOctoplan";

export const OVERVIEW_POLL_MS = 30_000;
export const OVERVIEW_DEBOUNCE_MS = 1_500;

type Pending = { repoPath: string; seen: Overview | undefined; errors: readonly unknown[] };

/**
 * The active repo's overview (D42): requested when the repo changes, shortly after each `plan`
 * change for it, and every 30 s. `loading` holds from a request until a new overview (or error).
 */
export const useOverview = (repoPath: string | null) => {
  const { state, sendClientEvent } = useOctoplan();
  const overview = repoPath ? state.overviewByRepo[repoPath] : undefined;
  const plan = repoPath ? state.planByRepo[repoPath] : undefined;
  const errors = state.errors;
  const [pending, setPending] = useState<Pending | null>(null);

  const snapshot = useRef({ overview, errors });
  snapshot.current = { overview, errors };

  const refresh = useCallback(() => {
    if (!repoPath) return;
    if (sendClientEvent({ type: "request-overview", repoPath })) {
      const { overview: seen, errors: seenErrors } = snapshot.current;
      setPending({ repoPath, seen, errors: seenErrors });
    }
  }, [repoPath, sendClientEvent]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, OVERVIEW_POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // Plan edits usually mean todos or decisions moved; ask again once the burst settles.
  const lastPlan = useRef(plan);
  useEffect(() => {
    if (lastPlan.current === plan) return;
    lastPlan.current = plan;
    if (!plan) return;
    const timer = setTimeout(refresh, OVERVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [plan, refresh]);

  const loading =
    pending !== null &&
    pending.repoPath === repoPath &&
    pending.seen === overview &&
    pending.errors === errors;

  return { overview, loading, refresh };
};
