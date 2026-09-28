import type { Answer } from "@octogent/octoplan-protocol";
import type { KeyboardEvent } from "react";
import type { AnsweredItem } from "./AnswerList";
import { ModifierBadge } from "./ModifierBadge";
import { answerLabel } from "./draft";

type AnswerChipsProps = {
  label: string;
  items: readonly AnsweredItem[];
  // Opens the full answered card focused on this question; `revise` also opens its editor (R).
  onExpand: (questionId: string, revise: boolean) => void;
};

// One line per answered question (D25): "header → answer", parked shows its assumption.
export const chipSummary = (answer: Answer): string =>
  answer.modifier === "parked"
    ? `parked: ${answer.assumption?.trim() || answerLabel(answer)}`
    : answerLabel(answer);

export const AnswerChips = ({ label, items, onExpand }: AnswerChipsProps) => {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, questionId: string) => {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    if (event.key === "r" || event.key === "R") {
      event.preventDefault();
      onExpand(questionId, true);
    }
  };

  return (
    <div className="qc-answer-list">
      <ul className="qc-chips" aria-label={label}>
        {items.map(({ question, chain }) => {
          const current = chain[chain.length - 1];
          if (!current) return null;
          return (
            <li key={question.id} className="qc-chip-row" data-question-id={question.id}>
              <button
                type="button"
                className="qc-answer-chip"
                aria-expanded={false}
                title={question.question}
                onClick={() => onExpand(question.id, false)}
                onKeyDown={(event) => onKeyDown(event, question.id)}
              >
                <span className="qc-answer-chip-text">
                  {question.header} → {chipSummary(current)}
                </span>
                <ModifierBadge modifier={current.modifier} />
                {chain.length > 1 ? <span className="qc-revised">revised</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="qc-hints">Enter expand · R revise</p>
    </div>
  );
};
