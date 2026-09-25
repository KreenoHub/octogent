import {
  COVERAGE_DIMENSION_LABELS,
  type Question,
  encodeAnswerText,
} from "@octogent/octoplan-protocol";
import { useId } from "react";
import { ModifierBadge } from "./ModifierBadge";
import {
  type QuestionDraft,
  draftToAnswer,
  hasPreviews,
  isDraftAnswered,
  isRecommended,
} from "./draft";

export type QuestionBlockProps = {
  question: Question;
  index: number;
  draft: QuestionDraft;
  active: boolean;
  onActivate: (index: number) => void;
  onPick: (index: number, optionIndex: number) => void;
  onOtherText: (index: number, text: string) => void;
  onAssumption: (index: number, text: string) => void;
};

export const focusKey = (kind: "other" | "assumption", index: number) => `${kind}-${index}`;

export const QuestionBlock = ({
  question,
  index,
  draft,
  active,
  onActivate,
  onPick,
  onOtherText,
  onAssumption,
}: QuestionBlockProps) => {
  const baseId = useId();
  const textId = `${baseId}-text`;
  const answered = isDraftAnswered(draft);
  const withPreview = hasPreviews(question);
  const previewOption =
    question.options[draft.cursor] ??
    question.options.find((option) => draft.selected.includes(option.label));

  return (
    <div
      className="qc-question"
      data-testid={`qc-question-${question.id}`}
      data-active={active ? "true" : "false"}
      data-answered={answered ? "true" : "false"}
      onFocus={() => onActivate(index)}
    >
      <div className="qc-question-head">
        <span className="qc-chip">{question.header}</span>
        <span className="qc-question-id">{question.id}</span>
        <ModifierBadge modifier={draft.modifier} />
      </div>
      <p className="qc-question-text" id={textId}>
        {question.question}
      </p>

      <div className={withPreview ? "qc-body qc-body--preview" : "qc-body"}>
        <div
          role={question.multiSelect ? "group" : "radiogroup"}
          aria-labelledby={textId}
          className="qc-options"
        >
          {question.options.map((option, optionIndex) => {
            const labelId = `${baseId}-opt-${optionIndex}`;
            const descId = `${labelId}-desc`;
            const checked = draft.selected.includes(option.label);
            const classes = ["qc-option"];
            if (isRecommended(option.label)) classes.push("qc-option--recommended");
            if (checked) classes.push("qc-option--checked");
            if (active && draft.cursor === optionIndex) classes.push("qc-option--cursor");
            return (
              <label key={option.label} className={classes.join(" ")}>
                <input
                  type={question.multiSelect ? "checkbox" : "radio"}
                  name={`${baseId}-choice`}
                  tabIndex={-1}
                  checked={checked}
                  onChange={() => onPick(index, optionIndex)}
                  aria-labelledby={labelId}
                  aria-describedby={descId}
                />
                <span className="qc-key" aria-hidden="true">
                  {optionIndex + 1}
                </span>
                <span className="qc-option-text">
                  <span id={labelId} className="qc-option-label">
                    {option.label}
                  </span>
                  <span id={descId} className="qc-option-desc">
                    {option.description}
                  </span>
                </span>
              </label>
            );
          })}
          <div className={draft.otherActive ? "qc-other qc-other--active" : "qc-other"}>
            <span className="qc-key" aria-hidden="true">
              O
            </span>
            <input
              type="text"
              className="qc-input"
              tabIndex={-1}
              placeholder="Other…"
              aria-label="Other answer"
              data-focus-key={focusKey("other", index)}
              value={draft.otherText}
              onChange={(event) => onOtherText(index, event.target.value)}
            />
          </div>
        </div>
        {withPreview ? (
          <pre className="qc-preview" data-testid="qc-preview">
            {previewOption?.preview ?? ""}
          </pre>
        ) : null}
      </div>

      {draft.modifier === "parked" ? (
        <label className="qc-assumption">
          <span className="qc-assumption-label">ASSUME</span>
          <input
            type="text"
            className="qc-input"
            tabIndex={-1}
            aria-label={`Assumption for ${question.header || question.id}`}
            data-focus-key={focusKey("assumption", index)}
            value={draft.assumption}
            onChange={(event) => onAssumption(index, event.target.value)}
          />
        </label>
      ) : null}

      {answered ? (
        <p className="qc-receive" data-testid="qc-receive">
          <span className="qc-receive-label">Claude will receive:</span>{" "}
          <code>{encodeAnswerText(draftToAnswer(question, draft, ""))}</code>
        </p>
      ) : null}

      <WhyThisQuestion question={question} />
    </div>
  );
};

export const WhyThisQuestion = ({ question }: { question: Question }) =>
  question.dimension ? (
    <details className="qc-why">
      <summary>Why this question</summary>
      <p>
        Coverage dimension: <strong>{COVERAGE_DIMENSION_LABELS[question.dimension]}</strong>
      </p>
    </details>
  ) : null;
