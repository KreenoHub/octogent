import type { RoundEntry } from "../app/planClientReducer";
import { firstLine } from "../app/sessionView";
import { type ProseBlock, digestTitle } from "../app/streamView";
import { useRoundActions } from "../app/useRoundActions";
import { sectionAnchorId } from "./PinnedStrip";
import { QuestionRoundSlot } from "./slots";

export const DOCK_ID = "op-answer-dock";

/** Brings the dock into view and puts the keyboard on the round (the stream stub's jump). */
export const focusDock = () => {
  const dock = document.getElementById(DOCK_ID);
  dock?.scrollIntoView?.({ block: "nearest" });
  const target = dock?.querySelector<HTMLElement>("form, [tabindex], button") ?? dock;
  target?.focus?.();
};

/**
 * D14: the active session's oldest pending round, docked above the composer so it never scrolls
 * away under reply text. R3: the latest prose digest line sits above it for context.
 */
export const AnswerDock = ({
  sessionId,
  pending,
  latest,
  onFocus,
}: {
  sessionId: string;
  pending: RoundEntry[];
  latest: ProseBlock | null;
  onFocus: () => void;
}) => {
  const { answerRound, reviseAnswer } = useRoundActions(sessionId);
  const current = pending[0];
  if (!current) return null;
  const { round } = current;
  const preview = latest?.heading.trim() ? firstLine(latest.markdown) : "";

  return (
    <section id={DOCK_ID} className="op-dock" aria-label="Answer dock" tabIndex={-1}>
      <header className="op-dock-header">
        <span className="op-dock-title">ANSWER · ROUND {round.index}</span>
        {pending.length > 1 ? (
          <span className="op-dock-more">+{pending.length - 1} more waiting</span>
        ) : null}
        <button type="button" className="op-button" onClick={onFocus}>
          [F] Focus
        </button>
      </header>
      {latest ? (
        <button
          type="button"
          className="op-dock-digest"
          data-testid="dock-digest"
          title="Show this reply in the stream"
          onClick={() =>
            document
              .getElementById(sectionAnchorId(latest.id))
              ?.scrollIntoView?.({ block: "start", behavior: "smooth" })
          }
        >
          <span className="op-digest-title">{digestTitle(latest)}</span>
          {preview ? <span className="op-digest-line">{preview}</span> : null}
        </button>
      ) : null}
      <div className="op-dock-round">
        <QuestionRoundSlot
          key={round.id}
          round={round}
          onAnswer={(answers) => answerRound(round.id, answers)}
          onRevise={reviseAnswer}
        />
      </div>
    </section>
  );
};
