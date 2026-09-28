import type { Overview } from "@octogent/octoplan-protocol";
import { historyTimeline } from "../app/boardView";

/** D24: decisions, revisions, branches, harvests and handoffs for the repo, newest last. */
export const HistoryTab = ({ overview }: { overview: Overview | undefined }) => {
  if (!overview) return <p className="op-empty">Loading history…</p>;
  const events = historyTimeline(overview);
  if (events.length === 0) return <p className="op-empty">No history yet.</p>;
  return (
    <ol className="op-history" aria-label="History">
      {events.map((event, index) => (
        <li
          key={`${event.at}-${event.refId}-${index}`}
          className="op-history-item"
          data-kind={event.kind}
          title={event.sessionFile}
        >
          <time className="op-history-at" dateTime={event.at}>
            {event.at.slice(0, 16).replace("T", " ")}
          </time>
          <span className={`op-badge op-badge--${event.kind}`}>{event.kind}</span>
          <span className="op-record-id">{event.refId}</span>
          <span className="op-record-title">{event.title}</span>
        </li>
      ))}
    </ol>
  );
};
