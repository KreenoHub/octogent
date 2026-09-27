import type { Answer, QuestionRound } from "@octogent/octoplan-protocol";
import { useState } from "react";
import { AnswerChips } from "./AnswerChips";
import { AnswerList, type AnsweredItem } from "./AnswerList";
import { RoundEditor } from "./RoundEditor";
import { buildChains } from "./draft";
import "./qcards.css";

export type QuestionRoundCardProps = {
  round: QuestionRound;
  // Answers (including revisions) already given for this round; when any exist the card is read-only.
  answered?: readonly Answer[];
  onAnswer: (answers: Answer[]) => void;
  onRevise: (answer: Answer) => void;
  /**
   * v2 (D25): when answered, render one chip line per question ("header → answer" +
   * modifier badge) until expanded. Default true; the stream's "expand all" passes false.
   */
  compact?: boolean;
};

export const QuestionRoundCard = ({
  round,
  answered,
  onAnswer,
  onRevise,
  compact = true,
}: QuestionRoundCardProps) => {
  // Set when a chip is expanded: which question to land on, and whether R opened its editor.
  const [expanded, setExpanded] = useState<{ questionId: string; revise: boolean } | null>(null);
  const chains = buildChains(answered ?? []);
  const items: AnsweredItem[] = round.questions.flatMap((question) => {
    const chain = chains.get(question.id);
    return chain && chain.length > 0 ? [{ question, chain }] : [];
  });
  const roundNumber = round.index;

  if (items.length > 0) {
    const showChips = compact && !expanded;
    return (
      <section
        className={
          showChips ? "qc-card qc-card--answered qc-card--compact" : "qc-card qc-card--answered"
        }
        aria-label={`Round ${roundNumber} answers`}
      >
        <header className="qc-card-head">
          <span className="qc-card-title">ROUND {roundNumber}</span>
          <span className="qc-card-tools">
            {compact ? (
              <button
                type="button"
                className="qc-button qc-button--ghost qc-button--small"
                aria-expanded={!showChips}
                onClick={() =>
                  setExpanded(
                    showChips ? { questionId: items[0]?.question.id ?? "", revise: false } : null,
                  )
                }
              >
                {showChips ? "Expand" : "Collapse"}
              </button>
            ) : null}
            <span className="qc-progress qc-progress--done">ANSWERED</span>
          </span>
        </header>
        {showChips ? (
          <AnswerChips
            label={`Answered round ${roundNumber}`}
            items={items}
            onExpand={(questionId, revise) => setExpanded({ questionId, revise })}
          />
        ) : (
          <AnswerList
            label={`Answered round ${roundNumber}`}
            items={items}
            onRevise={onRevise}
            initialSelectedId={expanded?.questionId}
            initialRevising={expanded?.revise}
            autoFocus={expanded !== null}
          />
        )}
      </section>
    );
  }

  return (
    <RoundEditor
      key={round.id}
      questions={round.questions}
      label={`Question round ${roundNumber}`}
      title={`ROUND ${roundNumber}`}
      confirmLabel="Confirm round"
      onConfirm={onAnswer}
    />
  );
};
