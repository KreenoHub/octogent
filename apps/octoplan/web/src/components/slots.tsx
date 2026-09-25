// Mount points where the shell hands off to other tentacles' components:
// - QuestionRoundSlot -> QuestionRoundCard (qcards)
// - CoverageSlot -> CoverageMap (modes)
// Keeping the seam lets the shell's props stay stable while those components evolve.
import type {
  Answer,
  CoverageDimensionId,
  CoverageState,
  QuestionRound,
} from "@octogent/octoplan-protocol";
import { QuestionRoundCard } from "../qcards";
import { CoverageMap } from "./coverage";

export type QuestionRoundSlotProps = {
  round: QuestionRound;
  answered?: Answer[];
  onAnswer: (answers: Answer[]) => void;
  onRevise: (answer: Answer) => void;
};

export const QuestionRoundSlot = ({
  round,
  answered,
  onAnswer,
  onRevise,
}: QuestionRoundSlotProps) => (
  <div className="op-slot" data-testid="question-round-slot" data-round-id={round.id}>
    <QuestionRoundCard
      round={round}
      {...(answered ? { answered } : {})}
      onAnswer={onAnswer}
      onRevise={onRevise}
    />
  </div>
);

export type CoverageSlotProps = {
  coverage: CoverageState | undefined;
  dimensions: readonly CoverageDimensionId[];
};

const EMPTY_COVERAGE: CoverageState = { dimensions: [] };

export const CoverageSlot = ({ coverage, dimensions }: CoverageSlotProps) => (
  <div data-testid="coverage-slot">
    <CoverageMap coverage={coverage ?? EMPTY_COVERAGE} dimensions={dimensions} />
  </div>
);
