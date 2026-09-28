import type { Answer, Question } from "@octogent/octoplan-protocol";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { QuestionBlock, focusKey } from "./QuestionBlock";
import {
  type QuestionDraft,
  activateOther,
  draftFromAnswer,
  draftToAnswer,
  isDraftAnswered,
  moveCursor,
  pickOption,
  setOtherText,
  togglePark,
  toggleTentative,
} from "./draft";

export type RoundEditorProps = {
  questions: readonly Question[];
  // Accessible name of the card, e.g. "Question round 3" or "Revise Q4".
  label: string;
  title: string;
  confirmLabel: string;
  initial?: readonly Answer[];
  revise?: boolean;
  autoFocus?: boolean;
  onConfirm: (answers: Answer[]) => void;
  onCancel?: () => void;
};

type FocusRequest = { target: "card" } | { target: "other" | "assumption"; index: number };

const isTextField = (element: EventTarget): boolean =>
  (element instanceof HTMLInputElement && element.type === "text") ||
  element instanceof HTMLTextAreaElement;

const KEY_HINTS =
  "1-9 pick · Space toggle · O other · T tentative · P park · Tab next · Enter confirm";

export const RoundEditor = ({
  questions,
  label,
  title,
  confirmLabel,
  initial,
  revise = false,
  autoFocus = false,
  onConfirm,
  onCancel,
}: RoundEditorProps) => {
  const rootRef = useRef<HTMLFormElement>(null);
  const [drafts, setDrafts] = useState<QuestionDraft[]>(() =>
    questions.map((question) =>
      draftFromAnswer(
        question,
        initial?.find((answer) => answer.questionId === question.id),
      ),
    ),
  );
  const [active, setActive] = useState(0);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);

  useEffect(() => {
    if (autoFocus) {
      rootRef.current?.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    if (!focusRequest) {
      return;
    }
    const root = rootRef.current;
    if (focusRequest.target === "card") {
      root?.focus();
    } else {
      const selector = `[data-focus-key="${focusKey(focusRequest.target, focusRequest.index)}"]`;
      root?.querySelector<HTMLElement>(selector)?.focus();
    }
    setFocusRequest(null);
  }, [focusRequest]);

  const answeredCount = drafts.filter(isDraftAnswered).length;
  const complete = answeredCount === questions.length;

  const updateDraft = (
    index: number,
    change: (question: Question, draft: QuestionDraft) => QuestionDraft,
  ) =>
    setDrafts((current) =>
      current.map((draft, position) => {
        const question = questions[position];
        return position === index && question ? change(question, draft) : draft;
      }),
    );

  const confirm = () => {
    if (!complete) {
      return;
    }
    const answeredAt = new Date().toISOString();
    onConfirm(
      questions.map((question, index) =>
        draftToAnswer(
          question,
          drafts[index] ?? draftFromAnswer(question, undefined),
          answeredAt,
          revise,
        ),
      ),
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const inText = isTextField(event.target);

    if (event.key === "Enter") {
      const tag = (event.target as HTMLElement).tagName;
      if (tag === "BUTTON" || tag === "SUMMARY") {
        return;
      }
      event.preventDefault();
      if (complete) {
        confirm();
      } else if (inText) {
        const firstOpen = drafts.findIndex((draft) => !isDraftAnswered(draft));
        setActive(firstOpen >= 0 ? firstOpen : active);
        setFocusRequest({ target: "card" });
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (inText) {
        setFocusRequest({ target: "card" });
      } else {
        onCancel?.();
      }
      return;
    }
    if (inText) {
      return;
    }

    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (/^[1-9]$/.test(key)) {
      event.preventDefault();
      updateDraft(active, (question, draft) => pickOption(question, draft, Number(key) - 1));
      return;
    }
    switch (key) {
      case " ":
        event.preventDefault();
        updateDraft(active, (question, draft) => pickOption(question, draft, draft.cursor));
        return;
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault();
        updateDraft(active, (question, draft) =>
          moveCursor(question, draft, key === "ArrowDown" ? 1 : -1),
        );
        return;
      case "o":
        event.preventDefault();
        updateDraft(active, activateOther);
        setFocusRequest({ target: "other", index: active });
        return;
      case "t":
        event.preventDefault();
        updateDraft(active, (_question, draft) => toggleTentative(draft));
        return;
      case "p": {
        event.preventDefault();
        const willPark = drafts[active]?.modifier !== "parked";
        updateDraft(active, togglePark);
        if (willPark) {
          setFocusRequest({ target: "assumption", index: active });
        }
        return;
      }
      case "Tab": {
        const next = active + (event.shiftKey ? -1 : 1);
        if (next >= 0 && next < questions.length) {
          event.preventDefault();
          setActive(next);
        }
        return;
      }
      default:
        return;
    }
  };

  return (
    <form
      ref={rootRef}
      className={revise ? "qc-card qc-card--revise" : "qc-card"}
      aria-label={label}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the card is the keyboard scope; its keys act on the focused question.
      tabIndex={0}
      onKeyDown={onKeyDown}
      onSubmit={(event) => event.preventDefault()}
    >
      <header className="qc-card-head">
        <span className="qc-card-title">{title}</span>
        <span className="qc-progress">
          {answeredCount} / {questions.length} answered
        </span>
      </header>
      <div className="qc-questions">
        {questions.map((question, index) => (
          <QuestionBlock
            key={question.id}
            question={question}
            index={index}
            draft={drafts[index] ?? draftFromAnswer(question, undefined)}
            active={index === active}
            onActivate={setActive}
            onPick={(position, optionIndex) =>
              updateDraft(position, (q, draft) => pickOption(q, draft, optionIndex))
            }
            onOtherText={(position, text) =>
              updateDraft(position, (q, draft) => setOtherText(q, draft, text))
            }
            onAssumption={(position, text) =>
              updateDraft(position, (_q, draft) => ({ ...draft, assumption: text }))
            }
          />
        ))}
      </div>
      <footer className="qc-card-foot">
        <span className="qc-hints">{KEY_HINTS}</span>
        <span className="qc-actions">
          {onCancel ? (
            <button type="button" className="qc-button qc-button--ghost" onClick={onCancel}>
              Cancel [Esc]
            </button>
          ) : null}
          <button type="button" className="qc-button" disabled={!complete} onClick={confirm}>
            {confirmLabel} [Enter]
          </button>
        </span>
      </footer>
    </form>
  );
};
