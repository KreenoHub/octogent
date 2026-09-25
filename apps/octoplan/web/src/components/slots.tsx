// Mount points for components other tentacles build. The octopus rewires these at merge:
// - QuestionRoundSlot -> QuestionRoundCard from web/src/qcards/index.ts (qcards)
// - CoverageSlot -> CoverageMap from web/src/components/coverage/index.ts (modes)
import {
  type Answer,
  COVERAGE_DIMENSION_LABELS,
  type CoverageDimensionId,
  type CoverageState,
  type QuestionRound,
} from "@octogent/octoplan-protocol";

export type QuestionRoundSlotProps = {
  round: QuestionRound;
  answered?: Answer[];
  onAnswer: (answers: Answer[]) => void;
  onRevise: (answer: Answer) => void;
};

/** Placeholder answer: the first option of every question. */
const firstOptionAnswers = (round: QuestionRound): Answer[] =>
  round.questions.map(
    (question): Answer => ({
      questionId: question.id,
      selected: question.options[0] ? [question.options[0].label] : [],
      modifier: "none",
      answeredAt: new Date().toISOString(),
    }),
  );

export const QuestionRoundSlot = ({ round, answered, onAnswer }: QuestionRoundSlotProps) => {
  const answerAll = () => onAnswer(firstOptionAnswers(round));
  return (
    <div className="op-slot" data-testid="question-round-slot" data-round-id={round.id}>
      <span className="op-slot-tag">QUESTION CARD · PLACEHOLDER</span>
      <ol className="op-slot-list">
        {round.questions.map((question) => {
          const chosen = answered?.find((a) => a.questionId === question.id);
          return (
            <li key={question.id}>
              <strong>{question.header}</strong> {question.question}
              {chosen ? (
                <span className="op-slot-answer"> → {chosen.selected.join(", ")}</span>
              ) : null}
            </li>
          );
        })}
      </ol>
      {answered ? null : (
        <button type="button" className="op-button" onClick={answerAll}>
          Answer with first options
        </button>
      )}
    </div>
  );
};

export type CoverageSlotProps = {
  coverage: CoverageState | undefined;
  dimensions: readonly CoverageDimensionId[];
};

export const CoverageSlot = ({ coverage, dimensions }: CoverageSlotProps) => {
  const statusOf = (id: CoverageDimensionId) =>
    coverage?.dimensions.find((d) => d.id === id)?.status ?? "unknown";
  return (
    <ul className="op-coverage" data-testid="coverage-slot">
      {dimensions.map((id) => (
        <li key={id} data-status={statusOf(id)}>
          {COVERAGE_DIMENSION_LABELS[id]}
        </li>
      ))}
    </ul>
  );
};
