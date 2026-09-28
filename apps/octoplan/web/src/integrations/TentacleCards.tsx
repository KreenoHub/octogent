// G overlay, first view (D21/D23): one pixel card per Octogent tentacle, scannable in about two
// seconds: name, todo progress n/m, CI + PR dots, ahead/behind main, last activity.
import type { TentacleSummary } from "@octogent/octoplan-protocol";
import type { TentacleCardsSlotProps } from "../components/slots";
import "./tentacleCards.css";

type PrInfo = NonNullable<TentacleSummary["pr"]>;

const CI_LABEL: Record<PrInfo["checks"], string> = {
  passing: "CI passing",
  failing: "CI failing",
  pending: "CI running",
  none: "no CI checks",
};

const prState = (pr: PrInfo | undefined) => (!pr ? "none" : pr.isDraft ? "draft" : pr.state);

const PR_LABEL: Record<ReturnType<typeof prState>, string> = {
  none: "no PR",
  draft: "draft PR",
  open: "PR open",
  merged: "PR merged",
  closed: "PR closed",
};

/** "just now", "5m ago", "3h ago", "2d ago", or a date past a month. */
export const relativeTime = (seconds: number, nowMs: number = Date.now()): string => {
  const diff = Math.max(0, Math.round(nowMs / 1000 - seconds));
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 30 * 86_400) return `${Math.floor(diff / 86_400)}d ago`;
  return new Date(seconds * 1000).toISOString().slice(0, 10);
};

/** Ten pixel segments; any started work lights at least one. */
const SEGMENTS = 10;
const litSegments = (done: number, total: number) => {
  if (total === 0 || done === 0) return 0;
  return Math.max(1, Math.floor((done / total) * SEGMENTS));
};

const TentacleCard = ({ tentacle }: { tentacle: TentacleSummary }) => {
  const { done, total, pr } = tentacle;
  const lit = litSegments(done, total);
  const complete = total > 0 && done === total;
  const checks = pr?.checks ?? "none";
  const state = prState(pr);
  const dots = (
    <>
      <span
        className={`op-tc-dot op-tc-dot--ci-${checks}`}
        data-testid="tc-ci-dot"
        data-status={checks}
        title={CI_LABEL[checks]}
        role="img"
        aria-label={CI_LABEL[checks]}
      />
      <span
        className={`op-tc-dot op-tc-dot--pr-${state}`}
        data-testid="tc-pr-dot"
        data-status={state}
        title={pr ? `#${pr.number} ${PR_LABEL[state]}` : PR_LABEL[state]}
        role="img"
        aria-label={PR_LABEL[state]}
      />
    </>
  );

  return (
    <li
      className="op-tc-card"
      data-testid="tentacle-card"
      data-tentacle-id={tentacle.tentacleId}
      data-complete={complete ? "true" : undefined}
    >
      <div className="op-tc-head">
        <h3 className="op-tc-name" title={tentacle.description || tentacle.name}>
          {tentacle.name}
        </h3>
        <span className="op-tc-dots">
          {pr ? (
            <a
              className="op-tc-pr-link"
              href={pr.url}
              target="_blank"
              rel="noreferrer"
              title={`Open PR #${pr.number}`}
            >
              {dots}
            </a>
          ) : (
            dots
          )}
        </span>
      </div>

      <div className="op-tc-progress">
        <span
          className="op-tc-bar"
          role="img"
          aria-label={`${tentacle.name}: ${done} of ${total} todos done`}
          data-testid="tc-bar"
        >
          {Array.from({ length: SEGMENTS }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-size pixel segments
            <span key={i} className="op-tc-seg" data-lit={i < lit ? "true" : undefined} />
          ))}
        </span>
        <span className="op-tc-count" data-testid="tc-count">
          {done}/{total}
        </span>
      </div>

      <div className="op-tc-foot">
        <span
          className="op-tc-ab"
          data-testid="tc-ahead-behind"
          title={
            tentacle.branches.length > 0
              ? `${tentacle.branches.join(", ")}: ${tentacle.ahead} ahead of, ${tentacle.behind} behind main`
              : "No branch for this tentacle yet"
          }
        >
          {tentacle.branches.length > 0 ? (
            <>
              <span data-dir="ahead">↑{tentacle.ahead}</span>
              <span data-dir="behind">↓{tentacle.behind}</span>
            </>
          ) : (
            <span className="op-tc-muted">no branch</span>
          )}
        </span>
        <span className="op-tc-when" data-testid="tc-last-activity">
          {tentacle.lastActivity !== undefined ? relativeTime(tentacle.lastActivity) : "—"}
        </span>
      </div>
    </li>
  );
};

export const TentacleCards = ({
  tentacles,
  workspace,
  loading,
  onRefresh,
}: TentacleCardsSlotProps) => {
  const done = tentacles.reduce((sum, t) => sum + t.done, 0);
  const total = tentacles.reduce((sum, t) => sum + t.total, 0);
  return (
    <section className="op-tc" data-testid="tentacle-cards" aria-label="Tentacles">
      <header className="op-tc-header">
        <h2 className="op-tc-title">Tentacles</h2>
        {tentacles.length > 0 ? (
          <span className="op-tc-total">
            {tentacles.length} · {done}/{total} done
          </span>
        ) : null}
        {loading ? <span className="op-tc-loading">reading…</span> : null}
        <button
          type="button"
          className="op-button op-tc-refresh"
          onClick={onRefresh}
          disabled={loading}
        >
          Refresh
        </button>
      </header>
      {workspace ? (
        <p className="op-tc-workspace" title={workspace}>
          {workspace}
        </p>
      ) : null}

      {tentacles.length === 0 ? (
        loading ? null : (
          <div className="op-tc-empty" data-testid="tentacle-cards-empty">
            <p>No tentacles in this workspace yet.</p>
            <p>
              Tentacles are the folders under <code>.octogent/tentacles/</code>. Hand the plan off
              to Octogent in the Hand off step (or create one in Octogent's Deck) and they show up here
              with their todo progress, branches and PRs.
            </p>
          </div>
        )
      ) : (
        <ul className="op-tc-grid">
          {tentacles.map((tentacle) => (
            <TentacleCard key={tentacle.tentacleId} tentacle={tentacle} />
          ))}
        </ul>
      )}
    </section>
  );
};
