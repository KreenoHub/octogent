import type { Overview } from "@octogent/octoplan-protocol";
import { useOctoplan } from "../app/useOctoplan";
import { BranchGraphSlot, TentacleCardsSlot } from "./slots";

const NO_TENTACLES: Overview["tentacles"] = [];

/**
 * G: the tentacle overview for the active repo first (D21), the branch graph below as the
 * drill-down. The graph is requested when the overlay opens and on Refresh only; nothing polls
 * it while closed (the overview has its own slow poll for the header count).
 */
export const GraphOverlay = ({
  repoPath,
  overview,
  overviewLoading,
  onRefreshOverview,
  onRefresh,
  onClose,
}: {
  repoPath: string | null;
  overview: Overview | undefined;
  overviewLoading: boolean;
  onRefreshOverview: () => void;
  onRefresh: () => void;
  onClose: () => void;
}) => {
  const { graphByRepo, graphLoadingByRepo, sendClientEvent } = useOctoplan();
  return (
    <dialog open className="op-graph" aria-modal="true" aria-label="Branch graph">
      {repoPath ? (
        <>
          <TentacleCardsSlot
            tentacles={overview?.tentacles ?? NO_TENTACLES}
            workspace={overview?.workspace ?? null}
            loading={overviewLoading}
            onRefresh={onRefreshOverview}
          />
          <BranchGraphSlot
            graph={graphByRepo[repoPath] ?? null}
            loading={graphLoadingByRepo[repoPath] === true}
            onRefresh={onRefresh}
            onLinkBranch={(branchId, gitBranch) =>
              sendClientEvent({ type: "link-branch", repoPath, branchId, gitBranch })
            }
            onClose={onClose}
          />
        </>
      ) : (
        <div className="op-graph-empty">
          <p className="op-empty">Pick a session first: the graph shows its repo.</p>
          <button type="button" className="op-button" onClick={onClose}>
            Close
          </button>
        </div>
      )}
    </dialog>
  );
};
