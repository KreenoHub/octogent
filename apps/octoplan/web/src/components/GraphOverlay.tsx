import { useOctoplan } from "../app/useOctoplan";
import { BranchGraphSlot } from "./slots";

/**
 * G: the branch graph for the active repo. The graph is requested when the overlay opens and on
 * Refresh only; nothing polls while it is closed.
 */
export const GraphOverlay = ({
  repoPath,
  onRefresh,
  onClose,
}: {
  repoPath: string | null;
  onRefresh: () => void;
  onClose: () => void;
}) => {
  const { graphByRepo, graphLoadingByRepo, sendClientEvent } = useOctoplan();
  return (
    <dialog open className="op-graph" aria-modal="true" aria-label="Branch graph">
      {repoPath ? (
        <BranchGraphSlot
          graph={graphByRepo[repoPath] ?? null}
          loading={graphLoadingByRepo[repoPath] === true}
          onRefresh={onRefresh}
          onLinkBranch={(branchId, gitBranch) =>
            sendClientEvent({ type: "link-branch", repoPath, branchId, gitBranch })
          }
          onClose={onClose}
        />
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
