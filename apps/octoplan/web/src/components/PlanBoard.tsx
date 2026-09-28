import type { PlanSnapshot } from "@octogent/octoplan-protocol";
import { useState } from "react";
import { ALL_DIMENSIONS } from "../app/sessionView";
import { useOctoplan } from "../app/useOctoplan";
import { IdeaSearch } from "./IdeaSearch";
import { StagesList } from "./StagesList";
import { BrainstormSlot, CoverageSlot } from "./slots";

type BoardRecord = { id: string; title: string; status: string };

const SECTIONS = ["Goals", "Decisions", "Gaps", "Parked", "Risks"] as const;
type SectionName = (typeof SECTIONS)[number];

const toRecords = (plan: PlanSnapshot | undefined): Record<SectionName, BoardRecord[]> => ({
  // GoalDoc goals are plain strings without ids; number them for display.
  Goals: (plan?.goal?.goals ?? []).map((title, i) => ({
    id: `#${i + 1}`,
    title,
    status: "goal",
  })),
  Decisions: plan?.decisions ?? [],
  Gaps: plan?.gaps ?? [],
  Parked: plan?.parked ?? [],
  Risks: plan?.risks ?? [],
});

const StatusBadge = ({ status }: { status: string }) => (
  <span className={`op-badge op-badge--${status}`}>{status}</span>
);

export const PlanBoard = ({ onExport }: { onExport: () => void }) => {
  const { planByRepo, activeRepo, activeSession, sendClientEvent } = useOctoplan();
  const plan = activeRepo ? planByRepo[activeRepo] : undefined;
  const records = toRecords(plan);
  const [open, setOpen] = useState<Partial<Record<SectionName, boolean>>>({});
  const [stagesRequestedFor, setStagesRequestedFor] = useState<string | null>(null);
  const brainstorm = activeSession?.mode === "brainstorm" ? activeSession : null;

  const generateStages = () => {
    if (!activeRepo) return;
    if (sendClientEvent({ type: "generate-stages", repoPath: activeRepo })) {
      setStagesRequestedFor(activeRepo);
    }
  };

  return (
    <aside className="op-pane" aria-label="Plan board">
      <h2 className="op-pane-title">PLAN BOARD</h2>
      <div className="op-board-actions">
        <button type="button" className="op-button" disabled={!activeRepo} onClick={generateStages}>
          Stages
        </button>
        <button type="button" className="op-button" disabled={!activeRepo} onClick={onExport}>
          Export to Octogent
        </button>
      </div>
      {brainstorm && activeRepo ? (
        <BrainstormSlot
          ideas={plan?.ideas ?? []}
          onAction={(ideaId, action, intoId) =>
            sendClientEvent({
              type: "update-idea",
              repoPath: activeRepo,
              ideaId,
              action,
              ...(intoId === undefined ? {} : { intoId }),
            })
          }
          onConverge={() => sendClientEvent({ type: "converge", sessionId: brainstorm.id })}
        />
      ) : null}
      <ul className="op-board">
        {SECTIONS.map((section) => {
          const items = records[section];
          const expanded = open[section] === true;
          return (
            <li key={section} className="op-board-section">
              <button
                type="button"
                className="op-board-toggle"
                aria-expanded={expanded}
                onClick={() => setOpen((prev) => ({ ...prev, [section]: !expanded }))}
              >
                <span>{section}</span>
                <span className="op-count">{items.length}</span>
              </button>
              {expanded ? (
                items.length === 0 ? (
                  <p className="op-empty op-board-empty">Nothing yet.</p>
                ) : (
                  <ul className="op-board-records">
                    {items.map((item) => (
                      <li key={item.id} className="op-record">
                        <span className="op-record-id">{item.id}</span>
                        <span className="op-record-title">{item.title}</span>
                        {item.status === "goal" ? null : <StatusBadge status={item.status} />}
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </li>
          );
        })}
      </ul>
      {activeRepo ? (
        <StagesList repoPath={activeRepo} requested={stagesRequestedFor === activeRepo} />
      ) : null}
      <IdeaSearch />
      <h2 className="op-pane-title">COVERAGE</h2>
      <CoverageSlot coverage={plan?.coverage} dimensions={ALL_DIMENSIONS} />
    </aside>
  );
};
