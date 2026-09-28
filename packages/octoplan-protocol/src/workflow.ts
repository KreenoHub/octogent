// D62: the seven workflow steps, derived from what's on disk and in the session, never stored.
// One pure function so the rules (G3, R8) are cheap to tune and table-test; the UI only maps
// the result onto the stepper and the next-action bar (D63, D64).
import { COVERAGE_DIMENSION_LABELS, type CoverageDimensionId } from "./domain";
import type { PlanSnapshot } from "./events";
import type { OctogentRunState } from "./v3";

export const WORKFLOW_STEPS = [
  "start",
  "understand",
  "interview",
  "goal",
  "stages",
  "handoff",
  "build",
] as const;
export type WorkflowStepId = (typeof WORKFLOW_STEPS)[number];

export const WORKFLOW_LABELS: Record<WorkflowStepId, string> = {
  start: "Start",
  understand: "Understand",
  interview: "Interview",
  goal: "Goal",
  stages: "Stages",
  handoff: "Hand off",
  build: "Build",
};

export type WorkflowStepState = "done" | "current" | "upcoming" | "skipped";

export type WorkflowStep = {
  id: WorkflowStepId;
  state: WorkflowStepState;
  /** One line: why it's done, or what it's waiting for. */
  reason: string;
};

/** What the next-action bar's one primary button does (D64); the UI wires each kind. */
export type NextActionKind =
  | "open-review"
  | "wait"
  | "start-interview"
  | "answer-round"
  | "keep-interviewing"
  | "write-goal"
  | "generate-stages"
  | "hand-off"
  | "run-octogent"
  | "open-octogent"
  | "finished";

export type NextAction = { kind: NextActionKind; label: string; reason: string };

export type WorkflowInput = {
  snapshot: PlanSnapshot | null;
  /** docs/plan/stages/STAGE-*.md count (the `stages` event). */
  stageCount: number;
  /** A question round is waiting for an answer in this repo. */
  pendingRound: boolean;
  /** The repo has a live or restored planning session. */
  hasSession: boolean;
  octogent?: OctogentRunState;
  /** Handed-off todo checkboxes across the workspace's tentacles (from the overview). */
  todos?: { done: number; total: number };
};

export type Workflow = {
  steps: WorkflowStep[];
  current: WorkflowStepId;
  next: NextAction;
};

const DIMENSIONS = Object.keys(COVERAGE_DIMENSION_LABELS) as CoverageDimensionId[];
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Coverage dimensions still unknown (missing from COVERAGE.md counts as unknown). */
export const unknownDimensions = (snapshot: PlanSnapshot | null): CoverageDimensionId[] => {
  const byId = new Map((snapshot?.coverage.dimensions ?? []).map((d) => [d.id, d.status]));
  return DIMENSIONS.filter((id) => (byId.get(id) ?? "unknown") === "unknown");
};

export const deriveWorkflow = (input: WorkflowInput): Workflow => {
  const { snapshot } = input;
  const ingest = snapshot?.ingest ?? null;
  const goal = snapshot?.goal ?? null;
  const goalReady = Boolean(goal && goal.done.length > 0);
  const unknown = unknownDimensions(snapshot);
  const handoffApplied = snapshot?.handoff?.status === "applied";
  const todos = input.todos ?? { done: 0, total: 0 };

  const done: Record<WorkflowStepId, boolean> = {
    start: snapshot !== null,
    understand: ingest?.status === "applied",
    // G3: every dimension at least partly covered and nothing waiting, or the goal already
    // written (an imported detailed plan can get there with fewer rounds).
    interview: goalReady || (unknown.length === 0 && !input.pendingRound && input.hasSession),
    goal: goalReady,
    stages: input.stageCount > 0,
    handoff: handoffApplied,
    build: handoffApplied && todos.total > 0 && todos.done === todos.total,
  };
  const skipped: Partial<Record<WorkflowStepId, boolean>> = {
    // Nothing was imported: a new project (or one planned before v3) never had this step.
    understand: ingest === null,
  };
  const reasons: Record<WorkflowStepId, string> = {
    start: snapshot ? "Project open." : "Pick or create a project.",
    understand:
      ingest === null
        ? "Nothing was imported."
        : ingest.status === "running"
          ? "Claude is reading the import."
          : ingest.status === "draft"
            ? "Review what Claude understood, then apply."
            : "Import applied.",
    interview: goalReady
      ? "The goal is written."
      : input.pendingRound
        ? "A question is waiting for your answer."
        : !input.hasSession
          ? "No interview yet."
          : unknown.length > 0
            ? `${plural(unknown.length, "dimension")} still unknown.`
            : "Every dimension is covered.",
    goal: goalReady
      ? `GOAL.md has ${plural(goal?.done.length ?? 0, "done-when item")}.`
      : goal
        ? "GOAL.md has no definition of done yet."
        : "No GOAL.md yet.",
    stages:
      input.stageCount > 0 ? `${plural(input.stageCount, "stage")} written.` : "No stages yet.",
    handoff: handoffApplied
      ? "Handed off to Octogent."
      : snapshot?.handoff
        ? "A handoff draft is waiting to be applied."
        : "Not handed off yet.",
    build:
      todos.total > 0
        ? `${todos.done}/${todos.total} todos done.`
        : input.octogent === "running"
          ? "Octogent is running."
          : "Nothing handed off yet.",
  };

  const current =
    WORKFLOW_STEPS.find((id) => !done[id] && !skipped[id]) ?? ("build" as WorkflowStepId);
  const steps = WORKFLOW_STEPS.map(
    (id): WorkflowStep => ({
      id,
      state: skipped[id] ? "skipped" : id === current ? "current" : done[id] ? "done" : "upcoming",
      reason: reasons[id],
    }),
  );

  return { steps, current, next: nextAction(current, input, reasons[current]) };
};

const nextAction = (step: WorkflowStepId, input: WorkflowInput, reason: string): NextAction => {
  const ingest = input.snapshot?.ingest ?? null;
  switch (step) {
    case "start":
      return { kind: "start-interview", label: "Start planning", reason };
    case "understand":
      return ingest?.status === "running"
        ? { kind: "wait", label: "Reading the import…", reason }
        : { kind: "open-review", label: "Review what I understood", reason };
    case "interview":
      if (input.pendingRound) return { kind: "answer-round", label: "Answer the question", reason };
      if (!input.hasSession)
        return { kind: "start-interview", label: "Start the interview", reason };
      return { kind: "keep-interviewing", label: "Continue the interview", reason };
    case "goal":
      return { kind: "write-goal", label: "Ask Claude to write GOAL.md", reason };
    case "stages":
      return { kind: "generate-stages", label: "Generate stages", reason };
    case "handoff":
      return { kind: "hand-off", label: "Hand off to Octogent", reason };
    case "build": {
      const todos = input.todos ?? { done: 0, total: 0 };
      if (todos.total > 0 && todos.done === todos.total) {
        return { kind: "finished", label: "All handed-off todos are done", reason };
      }
      return input.octogent === "running"
        ? { kind: "open-octogent", label: "Open Octogent", reason }
        : { kind: "run-octogent", label: "Run Octogent", reason };
    }
  }
};
