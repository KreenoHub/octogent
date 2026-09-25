import type { RoundEntry } from "../app/planClientReducer";
import { roundAnchorId } from "../app/useRoundActions";

const jumpTo = (roundId: string) => {
  const target = document.getElementById(roundAnchorId(roundId));
  target?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  target?.focus?.();
};

/** Pins every pending round above the stream so no question gets buried. */
export const UnansweredTray = ({
  pending,
  onFocus,
}: {
  pending: RoundEntry[];
  onFocus: () => void;
}) => {
  if (pending.length === 0) return null;
  return (
    <section className="op-tray" aria-label="Unanswered">
      <header className="op-tray-header">
        <span className="op-tray-title">UNANSWERED · {pending.length}</span>
        <button type="button" className="op-button" onClick={onFocus}>
          [F] Focus
        </button>
      </header>
      <ul className="op-tray-list">
        {pending.map(({ round }) => (
          <li key={round.id}>
            <button type="button" className="op-tray-item" onClick={() => jumpTo(round.id)}>
              <span className="op-tray-round">Round {round.index + 1}</span>
              <span className="op-tray-headers">
                {round.questions.map((q) => q.header || q.question).join(" · ")}
              </span>
              <span className="op-tray-count">{round.questions.length}Q</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
