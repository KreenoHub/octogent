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

// ---------- wave 2 ----------

/** Contract for integrations' `BranchGraph` (web/src/integrations/index.ts). */
export type BranchGraphSlotProps = {
  graph: GitGraph | null;
  loading: boolean;
  onRefresh: () => void;
  onLinkBranch: (branchId: string, gitBranch: string) => void;
  onClose: () => void;
};

export const BranchGraphSlot = ({ graph, loading, onClose }: BranchGraphSlotProps) => (
  <div className="op-slot" data-testid="branch-graph-slot">
    <span className="op-slot-tag">BRANCH GRAPH · PLACEHOLDER</span>
    <p className="op-empty">
      {loading
        ? "Loading…"
        : `${graph?.commits.length ?? 0} commits, ${graph?.branches.length ?? 0} branches`}
    </p>
    <button type="button" className="op-button" onClick={onClose}>
      Close
    </button>
  </div>
);

/** Contract for bridge's `TerminalPanel` (web/src/terminal/index.ts). */
export type TerminalSlotProps = { sessionId: string; onClose: () => void };

export const TerminalSlot = ({ sessionId, onClose }: TerminalSlotProps) => (
  <div className="op-slot" data-testid="terminal-slot" data-session-id={sessionId}>
    <span className="op-slot-tag">TERMINAL · PLACEHOLDER</span>
    <button type="button" className="op-button" onClick={onClose}>
      Close
    </button>
  </div>
);

/** Contract for modes' `BrainstormBoard` (web/src/components/brainstorm/index.ts). */
export type BrainstormSlotProps = {
  ideas: readonly Idea[];
  onAction: (ideaId: string, action: IdeaAction, intoId?: string) => void;
  onConverge: () => void;
};

export const BrainstormSlot = ({ ideas }: BrainstormSlotProps) => (
  <div className="op-slot" data-testid="brainstorm-slot">
    <span className="op-slot-tag">BRAINSTORM BOARD · PLACEHOLDER</span>
    <p className="op-empty">{ideas.length} ideas</p>
  </div>
);
