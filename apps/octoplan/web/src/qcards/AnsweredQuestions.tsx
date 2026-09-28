import type { Answer, Question, QuestionRound } from "@octogent/octoplan-protocol";
import { AnswerList, type AnsweredItem } from "./AnswerList";
import { buildChains } from "./draft";
import "./qcards.css";

export type AnsweredQuestionsProps = {
  rounds: readonly QuestionRound[];
  // Every answer of the session, revisions included (appended, never overwritten: D23).
  answers: readonly Answer[];
  onRevise: (answer: Answer) => void;
};

const latestAt = (item: AnsweredItem): string =>
  item.chain[item.chain.length - 1]?.answeredAt ?? "";

export const AnsweredQuestions = ({ rounds, answers, onRevise }: AnsweredQuestionsProps) => {
  const questions = new Map<string, Question>();
  for (const round of rounds) {
    for (const question of round.questions) {
      questions.set(question.id, question);
    }
  }
  const items: AnsweredItem[] = [];
  for (const [questionId, chain] of buildChains(answers)) {
    const question = questions.get(questionId);
    if (question) {
      items.push({ question, chain });
    }
  }
  // Newest first; Array.prototype.sort is stable, so ties keep answer order.
  items.sort((a, b) => (latestAt(a) === latestAt(b) ? 0 : latestAt(a) < latestAt(b) ? 1 : -1));

  return (
    <section className="qc-history" aria-label="Answered history">
      <h3 className="qc-history-title">ANSWERED</h3>
      {items.length === 0 ? (
        <p className="qc-empty">No answered questions yet.</p>
      ) : (
        <AnswerList label="Answered questions" items={items} onRevise={onRevise} />
      )}
    </section>
  );
};
