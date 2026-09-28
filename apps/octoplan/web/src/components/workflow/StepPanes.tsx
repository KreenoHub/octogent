// D63: what the centre pane shows for the Goal, Stages, Hand off and Build steps. Understand and
// Interview reuse IngestReview and ConversationPane; Start is the home screen.
import type { Overview } from "@octogent/octoplan-protocol";
import { useState } from "react";
import { useOctoplan } from "../../app/useOctoplan";
import { OctogentLaunch } from "../../integrations/octogent/OctogentLaunch";
import { StagesList } from "../StagesList";
import { HandoffSlot, TentacleCardsSlot } from "../slots";

export const GoalStep = ({ repoPath }: { repoPath: string }) => {
  const { planByRepo } = useOctoplan();
  const goal = planByRepo[repoPath]?.goal ?? null;
  if (!goal) {
    return (
      <section className="op-pane op-step-pane" aria-label="Goal">
        <h2 className="op-pane-title">GOAL</h2>
        <p className="op-empty">
          No GOAL.md yet. Keep interviewing; when the plan is clear, ask Claude to write it (the bar
          below does that).
        </p>
      </section>
    );
  }
  return (
    <section className="op-pane op-step-pane" aria-label="Goal">
      <h2 className="op-pane-title">GOAL — {goal.title}</h2>
      {goal.why ? <p>{goal.why}</p> : null}
      {goal.goals.length > 0 ? (
        <>
          <h3 className="op-hw-label">Goals</h3>
          <ul className="op-goal-list">
            {goal.goals.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </>
      ) : null}
      {goal.nonGoals.length > 0 ? (
        <>
          <h3 className="op-hw-label">Non-goals</h3>
          <ul className="op-goal-list">
            {goal.nonGoals.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </>
      ) : null}
      <h3 className="op-hw-label">Definition of done</h3>
      {goal.done.length > 0 ? (
        <ol className="op-goal-dod" aria-label="Definition of done">
          {goal.done.map((item) => (
            <li key={item.id}>
              <span className="op-record-id">{item.id}</span> {item.text}
            </li>
          ))}
        </ol>
      ) : (
        <p className="op-empty">
          No definition of done yet. Ask Claude to write GOAL.md with checkable done-when items.
        </p>
      )}
    </section>
  );
};

export const StagesStep = ({ repoPath }: { repoPath: string }) => {
  const { sendClientEvent } = useOctoplan();
  const [requested, setRequested] = useState(false);
  return (
    <section className="op-pane op-step-pane" aria-label="Stages step">
      <StagesList repoPath={repoPath} requested={requested} />
      <div className="op-form-actions">
        <button
          type="button"
          className="op-button"
          onClick={() => {
            if (sendClientEvent({ type: "generate-stages", repoPath })) setRequested(true);
          }}
        >
          {requested ? "Regenerate stages" : "Generate stages"}
        </button>
      </div>
    </section>
  );
};

export const HandoffStep = ({
  repoPath,
  onExportOne,
  onDone,
}: {
  repoPath: string;
  onExportOne: () => void;
  onDone: () => void;
}) => (
  <section className="op-pane op-step-pane" aria-label="Hand off step">
    <HandoffSlot repoPath={repoPath} onClose={onDone} />
    <details className="op-step-advanced">
      <summary>Advanced: export to one tentacle</summary>
      <p className="op-dialog-hint">
        Writes chosen tasks into a single tentacle instead of the full split above.
      </p>
      <button type="button" className="op-button" onClick={onExportOne}>
        Export to one tentacle…
      </button>
    </details>
  </section>
);

export const BuildStep = ({
  repoPath,
  overview,
  loading,
  onRefresh,
}: {
  repoPath: string;
  overview: Overview | undefined;
  loading: boolean;
  onRefresh: () => void;
}) => (
  <section className="op-pane op-step-pane" aria-label="Build step">
    <OctogentLaunch repoPath={repoPath} />
    <TentacleCardsSlot
      tentacles={overview?.tentacles ?? []}
      workspace={overview?.workspace ?? null}
      loading={loading}
      onRefresh={onRefresh}
    />
  </section>
);
