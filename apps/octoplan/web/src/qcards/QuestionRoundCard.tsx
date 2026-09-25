import type { Answer, QuestionRound } from "@octogent/octoplan-protocol";
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
};

export const QuestionRoundCard = ({
  round,
  answered,
  onAnswer,
  onRevise,
}: QuestionRoundCardProps) => {
  const chains = buildChains(answered ?? []);
  const items: AnsweredItem[] = round.questions.flatMap((question) => {
    const chain = chains.get(question.id);
    return chain && chain.length > 0 ? [{ question, chain }] : [];
  });
  const roundNumber = round.index + 1;

  if (items.length > 0) {
    return (
      <section className="qc-card qc-card--answered" aria-label={`Round ${roundNumber} answers`}>
        <header className="qc-card-head">
          <span className="qc-card-title">ROUND {roundNumber}</span>
          <span className="qc-progress qc-progress--done">ANSWERED</span>
        </header>
        <AnswerList label={`Answered round ${roundNumber}`} items={items} onRevise={onRevise} />
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
