import type { PlanSnapshot } from "@octogent/octoplan-protocol";
import { useState } from "react";
import { ALL_DIMENSIONS } from "../app/sessionView";
import { useOctoplan } from "../app/useOctoplan";
import { CoverageSlot } from "./slots";

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

export const PlanBoard = () => {
  const { planByRepo, activeRepo } = useOctoplan();
  const plan = activeRepo ? planByRepo[activeRepo] : undefined;
  const records = toRecords(plan);
  const [open, setOpen] = useState<Partial<Record<SectionName, boolean>>>({});

  return (
    <aside className="op-pane" aria-label="Plan board">
      <h2 className="op-pane-title">PLAN BOARD</h2>
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
      <h2 className="op-pane-title">COVERAGE</h2>
      <CoverageSlot coverage={plan?.coverage} dimensions={ALL_DIMENSIONS} />
    </aside>
  );
};
