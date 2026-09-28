// D64: one bar under the panes with the reason and exactly one primary button.
import type { NextAction, NextActionKind, Workflow } from "@octogent/octoplan-protocol";

/** Kinds with nothing to click: the bar only explains. */
const PASSIVE: ReadonlySet<NextActionKind> = new Set(["wait", "finished"]);

export const NextActionBar = ({
  workflow,
  onAction,
  href,
}: {
  workflow: Workflow | null;
  onAction: (action: NextAction) => void;
  /** Link target for "open-octogent". */
  href?: string | undefined;
}) => {
  if (!workflow) return null;
  const { next } = workflow;
  return (
    <footer className="op-next" aria-label="Next step">
      <span className="op-next-label">Next</span>
      <span className="op-next-reason">{next.reason}</span>
      {PASSIVE.has(next.kind) ? (
        <span className="op-next-passive">{next.label}</span>
      ) : next.kind === "open-octogent" && href ? (
        <a className="op-button op-button--primary" href={href} target="_blank" rel="noreferrer">
          {next.label}
        </a>
      ) : (
        <button
          type="button"
          className="op-button op-button--primary"
          onClick={() => onAction(next)}
        >
          {next.label}
        </button>
      )}
    </footer>
  );
};
