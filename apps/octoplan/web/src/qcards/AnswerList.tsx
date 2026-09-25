import type { Answer, Question } from "@octogent/octoplan-protocol";
import { type KeyboardEvent, useId, useRef, useState } from "react";
import { ModifierBadge } from "./ModifierBadge";
import { WhyThisQuestion } from "./QuestionBlock";
import { RoundEditor } from "./RoundEditor";
import { answerLabel } from "./draft";

export type AnsweredItem = {
  question: Question;
  // Every answer to the question, oldest first; the last one is current.
  chain: readonly Answer[];
};

type AnswerListProps = {
  label: string;
  items: readonly AnsweredItem[];
  onRevise: (answer: Answer) => void;
};

const AnswerStep = ({ answer, superseded }: { answer: Answer; superseded: boolean }) => {
  const text = answerLabel(answer);
  return (
    <li className={superseded ? "qc-step qc-step--superseded" : "qc-step"}>
      {superseded ? (
        <s className="qc-step-label">{text}</s>
      ) : (
        <span className="qc-step-label">{text}</span>
      )}
      <ModifierBadge modifier={answer.modifier} />
      {answer.modifier === "parked" ? (
        <span className="qc-step-assumption">assuming “{answer.assumption?.trim() || text}”</span>
      ) : null}
    </li>
  );
};

// Keyboard-selectable list of answered questions. R reopens the selected one
// as a single-question editor whose confirmation emits one revised Answer.
export const AnswerList = ({ label, items, onRevise }: AnswerListProps) => {
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revisingId, setRevisingId] = useState<string | null>(null);

  const selectedIndex = Math.max(
    items.findIndex((item) => item.question.id === selectedId),
    0,
  );
  const selected = items[selectedIndex];
  const revising = items.find((item) => item.question.id === revisingId);
  const optionId = (questionId: string) => `${baseId}-${questionId}`;

  const closeEditor = () => {
    setRevisingId(null);
    listRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || items.length === 0) {
      return;
    }
    const move = (index: number) => {
      const target = items[Math.min(Math.max(index, 0), items.length - 1)];
      if (target) setSelectedId(target.question.id);
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(selectedIndex + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        move(selectedIndex - 1);
        return;
      case "Home":
        event.preventDefault();
        move(0);
        return;
      case "End":
        event.preventDefault();
        move(items.length - 1);
        return;
      case "r":
      case "R":
        event.preventDefault();
        if (selected) setRevisingId(selected.question.id);
        return;
      default:
        return;
    }
  };

  return (
    <div className="qc-answer-list">
      <div
        ref={listRef}
        className="qc-answers"
        // biome-ignore lint/a11y/useSemanticElements: options hold rich content (chain, badges, details) that a native <select> cannot render.
        role="listbox"
        aria-label={label}
        tabIndex={0}
        aria-activedescendant={selected ? optionId(selected.question.id) : undefined}
        onKeyDown={onKeyDown}
      >
        {items.map((item) => {
          const isSelected = item.question.id === selected?.question.id;
          return (
            // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard selection lives on the listbox (arrows, R).
            <div
              key={item.question.id}
              id={optionId(item.question.id)}
              // biome-ignore lint/a11y/useSemanticElements: a native <option> cannot hold the revision chain.
              role="option"
              tabIndex={-1}
              aria-selected={isSelected}
              data-question-id={item.question.id}
              className={isSelected ? "qc-answered qc-answered--selected" : "qc-answered"}
              onClick={() => setSelectedId(item.question.id)}
            >
              <div className="qc-question-head">
                <span className="qc-chip">{item.question.header}</span>
                <span className="qc-question-id">{item.question.id}</span>
              </div>
              <p className="qc-question-text">{item.question.question}</p>
              <ol className="qc-chain" aria-label="Revision chain">
                {item.chain.map((answer, position) => (
                  <AnswerStep
                    key={`${answer.answeredAt}-${position}`}
                    answer={answer}
                    superseded={position < item.chain.length - 1}
                  />
                ))}
              </ol>
              <WhyThisQuestion question={item.question} />
            </div>
          );
        })}
      </div>
      {revising ? (
        <RoundEditor
          key={revising.question.id}
          questions={[revising.question]}
          initial={revising.chain.slice(-1)}
          label={`Revise ${revising.question.id}`}
          title={`REVISE ${revising.question.id}`}
          confirmLabel="Confirm revision"
          revise
          autoFocus
          onConfirm={([answer]) => {
            if (answer) onRevise(answer);
            closeEditor();
          }}
          onCancel={closeEditor}
        />
      ) : null}
      <p className="qc-hints">↑/↓ select · R revise</p>
    </div>
  );
};
