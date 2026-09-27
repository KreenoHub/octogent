import { type AttentionItem, harvestSource, needsAttention } from "../app/boardView";
import { useOctoplan } from "../app/useOctoplan";

const KIND_LABELS: Record<AttentionItem["kind"], string> = {
  stale: "Stale",
  round: "Unanswered",
  risk: "Tentative",
  harvest: "Harvest",
};

/**
 * D9/D17: what is waiting on the user in this repo: stale decisions, unanswered rounds (any
 * session), tentative risks and pending harvest candidates (accept writes a D-record).
 */
export const NeedsAttention = ({ repoPath }: { repoPath: string }) => {
  const { planByRepo, rounds, sessions, jobsByRepo, setActiveSession, sendClientEvent } =
    useOctoplan();
  const items = needsAttention(planByRepo[repoPath], rounds, sessions, repoPath);
  const harvesting = jobsByRepo[repoPath]?.harvest?.state === "running";

  const resolve = (harvestId: string, action: "accept" | "reject") =>
    sendClientEvent({ type: "resolve-harvest", repoPath, harvestId, action });

  return (
    <section className="op-attention" aria-label="Needs attention">
      <header className="op-attention-header">
        <span className="op-attention-title">NEEDS ATTENTION · {items.length}</span>
        <button
          type="button"
          className="op-card-action"
          disabled={harvesting}
          onClick={() => sendClientEvent({ type: "run-harvest", repoPath })}
        >
          {harvesting ? "Harvesting…" : "Harvest now"}
        </button>
      </header>
      {items.length === 0 ? (
        <p className="op-empty">Nothing waiting.</p>
      ) : (
        <ul className="op-attention-list">
          {items.map((item) => (
            <li
              key={`${item.kind}-${item.id}-${item.kind === "round" ? item.sessionId : ""}`}
              className="op-attention-item"
              data-kind={item.kind}
            >
              <span className={`op-attention-kind op-attention-kind--${item.kind}`}>
                {KIND_LABELS[item.kind]}
              </span>
              {item.kind === "round" ? (
                <button
                  type="button"
                  className="op-attention-jump"
                  title="Open this session"
                  onClick={() => setActiveSession(item.sessionId)}
                >
                  {item.id} · {item.title}
                </button>
              ) : (
                <span className="op-attention-text">
                  <span className="op-record-id">{item.id}</span> {item.title}
                </span>
              )}
              {item.kind === "harvest" ? (
                <span className="op-attention-harvest">
                  <span className="op-attention-source" title={item.candidate.body}>
                    {harvestSource(item.candidate)}
                  </span>
                  <button
                    type="button"
                    className="op-card-action"
                    aria-label={`Accept ${item.id}`}
                    onClick={() => resolve(item.id, "accept")}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="op-card-action"
                    aria-label={`Reject ${item.id}`}
                    onClick={() => resolve(item.id, "reject")}
                  >
                    Reject
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
