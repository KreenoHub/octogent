import { useState } from "react";
import { useOctoplan } from "../app/useOctoplan";

const copy = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

/** Staged build prompts from `generate-stages`: title + goal, prompt one click from the clipboard. */
export const StagesList = ({ repoPath, requested }: { repoPath: string; requested: boolean }) => {
  const { stagesByRepo } = useOctoplan();
  const stages = stagesByRepo[repoPath];
  const [copied, setCopied] = useState<number | null>(null);
  if (!stages && !requested) return null;

  return (
    <section className="op-stages" aria-label="Stages">
      <h2 className="op-pane-title">STAGES</h2>
      {!stages ? (
        <p className="op-empty">Generating stages…</p>
      ) : stages.length === 0 ? (
        <p className="op-empty">No stages yet.</p>
      ) : (
        <ol className="op-stage-list">
          {stages.map((stage) => (
            <li key={stage.index} className="op-stage">
              <div className="op-stage-head">
                <span className="op-record-id">{stage.index}</span>
                <span className="op-stage-title">{stage.title}</span>
                <button
                  type="button"
                  className="op-card-action"
                  aria-label={`Copy prompt for stage ${stage.index}`}
                  onClick={async () => {
                    if (await copy(stage.prompt)) setCopied(stage.index);
                  }}
                >
                  {copied === stage.index ? "Copied" : "Copy prompt"}
                </button>
              </div>
              {stage.goal ? <p className="op-stage-goal">{stage.goal}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};
