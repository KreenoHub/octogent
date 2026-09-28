// D63/D65: the seven steps across the top, plus buttons for every hotkey. Steps never block:
// any step can be opened, and a step that isn't reached yet says what it's waiting for.
import { WORKFLOW_LABELS, type Workflow, type WorkflowStepId } from "@octogent/octoplan-protocol";
import "./workflow.css";

export type ToolbarAction = { key: string; label: string; onClick: () => void; active?: boolean };

const STATE_MARK = { done: "✓", current: "●", upcoming: "○", skipped: "–" } as const;

export const WorkflowBar = ({
  workflow,
  selected,
  onSelect,
  tools,
}: {
  workflow: Workflow | null;
  selected: WorkflowStepId | null;
  onSelect: (step: WorkflowStepId) => void;
  tools: readonly ToolbarAction[];
}) => (
  <div className="op-wf">
    {workflow ? (
      <ol className="op-wf-steps" aria-label="Workflow steps">
        {workflow.steps.map((step, index) => (
          <li key={step.id}>
            <button
              type="button"
              className={`op-wf-step op-wf-step--${step.state}${selected === step.id ? " op-wf-step--selected" : ""}`}
              aria-current={selected === step.id ? "step" : undefined}
              title={step.reason}
              onClick={() => onSelect(step.id)}
            >
              <span className="op-wf-mark" aria-hidden="true">
                {STATE_MARK[step.state]}
              </span>
              <span className="op-wf-n">{index + 1}</span> {WORKFLOW_LABELS[step.id]}
              <span className="op-sr-only">
                {" "}
                ({step.state}: {step.reason})
              </span>
            </button>
          </li>
        ))}
      </ol>
    ) : (
      <span className="op-wf-empty">Pick a project or start one from Home.</span>
    )}
    <div className="op-wf-tools" role="toolbar" aria-label="Octoplan tools">
      {tools.map((tool) => (
        <button
          key={tool.key}
          type="button"
          className="op-wf-tool"
          aria-pressed={tool.active}
          aria-keyshortcuts={tool.key}
          onClick={tool.onClick}
        >
          <kbd>{tool.key}</kbd> {tool.label}
        </button>
      ))}
    </div>
  </div>
);
