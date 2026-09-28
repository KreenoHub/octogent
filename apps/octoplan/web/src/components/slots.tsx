// Mount points where the shell hands off to other tentacles' components:
// - QuestionRoundSlot -> QuestionRoundCard (qcards)
// - CoverageSlot -> CoverageMap (modes)
// - Wave 2 (placeholders until merged): BranchGraphSlot -> BranchGraph (integrations),
//   TerminalSlot -> TerminalPanel (bridge), BrainstormSlot -> BrainstormBoard (modes)
// Keeping the seam lets the shell's props stay stable while those components evolve.
import type {
  Answer,
  CoverageDimensionId,
  CoverageState,
  GitGraph,
  Idea,
  IdeaAction,
  QuestionRound,
} from "@octogent/octoplan-protocol";
import { BranchGraph } from "../integrations";
import { QuestionRoundCard } from "../qcards";
import { TerminalPanel } from "../terminal";
import { BrainstormBoard } from "./brainstorm";
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

// ---------- wave 2 ----------

/** Contract for integrations' `BranchGraph` (web/src/integrations/index.ts). */
export type BranchGraphSlotProps = {
  graph: GitGraph | null;
  loading: boolean;
  onRefresh: () => void;
  onLinkBranch: (branchId: string, gitBranch: string) => void;
  onClose: () => void;
};

export const BranchGraphSlot = (props: BranchGraphSlotProps) => (
  <div data-testid="branch-graph-slot">
    <BranchGraph {...props} />
  </div>
);

/** Contract for bridge's `TerminalPanel` (web/src/terminal/index.ts). */
export type TerminalSlotProps = { sessionId: string; onClose: () => void };

export const TerminalSlot = ({ sessionId, onClose }: TerminalSlotProps) => (
  <div data-testid="terminal-slot" data-session-id={sessionId}>
    <TerminalPanel sessionId={sessionId} onClose={onClose} />
  </div>
);

/** Contract for modes' `BrainstormBoard` (web/src/components/brainstorm/index.ts). */
export type BrainstormSlotProps = {
  ideas: readonly Idea[];
  onAction: (ideaId: string, action: IdeaAction, intoId?: string) => void;
  onConverge: () => void;
};

export const BrainstormSlot = (props: BrainstormSlotProps) => (
  <div data-testid="brainstorm-slot">
    <BrainstormBoard {...props} />
  </div>
);
