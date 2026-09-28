import type { DecisionDrift, PlanSnapshot, Session } from "@octogent/octoplan-protocol";
import { type ReactNode, useState } from "react";
import { type BranchRow, conversationBranches, driftByDecision } from "../app/boardView";
import { ALL_DIMENSIONS, MODE_LABELS } from "../app/sessionView";
import { useFlash } from "../app/useFlash";
import { useOctoplan } from "../app/useOctoplan";
import { ConventionsSection } from "./ConventionsSection";
import { HistoryTab } from "./HistoryTab";
import { IdeaSearch } from "./IdeaSearch";
import { NeedsAttention } from "./NeedsAttention";
import { StagesList } from "./StagesList";
import { BrainstormSlot, CoverageSlot } from "./slots";

type BoardRecord = {
  id: string;
  title: string;
  /** Status badge text; omitted for goals. */
  status?: string;
  /** Hover text for the whole row. */
  hint?: string;
  extra?: ReactNode;
  onOpen?: () => void;
};

const PLAN_SECTIONS = ["Goals", "Decisions", "Gaps", "Parked", "Risks"] as const;
/** v2 (D9, D13): shown once a repo is active. */
const REPO_SECTIONS = ["Ideas", "Branches", "Sessions"] as const;
type SectionName = (typeof PLAN_SECTIONS)[number] | (typeof REPO_SECTIONS)[number];

const StatusBadge = ({ status }: { status: string }) => (
  <span className={`op-badge op-badge--${status}`}>{status}</span>
);

/** D24: where a decision stands in the code; the evidence is the tooltip. */
const DriftBadge = ({ drift }: { drift: DecisionDrift }) => (
  <span
    className={`op-drift op-drift--${drift.status}`}
    data-testid={`drift-${drift.decisionId}`}
    title={drift.evidence.length > 0 ? drift.evidence.join("\n") : "No evidence yet"}
  >
    {drift.status}
  </span>
);

const planRecords = (
  plan: PlanSnapshot | undefined,
  drift: Map<string, DecisionDrift>,
): Record<(typeof PLAN_SECTIONS)[number], BoardRecord[]> => ({
  // GoalDoc goals are plain strings without ids; number them for display.
  Goals: (plan?.goal?.goals ?? []).map((title, i) => ({ id: `#${i + 1}`, title })),
  Decisions: (plan?.decisions ?? []).map((d) => {
    const badge = drift.get(d.id);
    return {
      id: d.id,
      title: d.title,
      status: d.status,
      ...(badge ? { extra: <DriftBadge drift={badge} /> } : {}),
    };
  }),
  Gaps: plan?.gaps ?? [],
  Parked: plan?.parked ?? [],
  Risks: plan?.risks ?? [],
});

const branchRecord = (row: BranchRow, open: (id: string) => void): BoardRecord => ({
  id: row.gitBranch ?? "",
  title: row.title,
  status: row.status,
  hint: `Forked from ${row.parentTitle}`,
  onOpen: () => open(row.sessionId),
});

/** D13: every session log in docs/plan/sessions, plus live sessions not logged yet. */
const sessionRecords = (
  plan: PlanSnapshot | undefined,
  live: readonly Session[],
  open: (id: string) => void,
): BoardRecord[] => {
  const logs = plan?.sessionLogs ?? [];
  const logged = new Set(logs.map((log) => log.claudeSessionId).filter(Boolean));
  const liveByClaude = new Map(live.map((s) => [s.claudeSessionId, s] as const));
  const fromLogs = logs.map((log): BoardRecord => {
    const session = log.claudeSessionId ? liveByClaude.get(log.claudeSessionId) : undefined;
    return {
      id: log.startedAt.slice(0, 10),
      title: log.title,
      status: log.mode,
      hint: `${log.summary}\n${log.answers} answers · ${log.parked} parked · ${log.tentative} tentative · ${log.revisions} revisions`,
      ...(session ? { onOpen: () => open(session.id) } : {}),
    };
  });
  const unlogged = live
    .filter((s) => !s.claudeSessionId || !logged.has(s.claudeSessionId))
    .map(
      (s): BoardRecord => ({
        id: s.startedAt.slice(0, 10),
        title: s.title || "Untitled",
        status: "live",
        hint: MODE_LABELS[s.mode],
        onOpen: () => open(s.id),
      }),
    );
  return [...fromLogs, ...unlogged];
};

type Tab = "board" | "history";

export const PlanBoard = ({
  onExport,
  onHandoff,
}: {
  onExport: () => void;
  onHandoff: () => void;
}) => {
  const {
    planByRepo,
    overviewByRepo,
    graphByRepo,
    sessions,
    activeRepo,
    activeSession,
    setActiveSession,
    sendClientEvent,
  } = useOctoplan();
  const plan = activeRepo ? planByRepo[activeRepo] : undefined;
  const overview = activeRepo ? overviewByRepo[activeRepo] : undefined;
  const records: Partial<Record<SectionName, BoardRecord[]>> = planRecords(
    plan,
    driftByDecision(overview),
  );
  if (activeRepo) {
    const repoSessions = sessions.filter((s) => s.repoPath === activeRepo);
    records.Ideas = (plan?.ideas ?? []).map((i) => ({
      id: i.id,
      title: i.title,
      status: i.status,
    }));
    records.Branches = conversationBranches(sessions, activeRepo, graphByRepo[activeRepo]).map(
      (row) => branchRecord(row, setActiveSession),
    );
    records.Sessions = sessionRecords(plan, repoSessions, setActiveSession);
  }
  const sections: SectionName[] = activeRepo
    ? [...PLAN_SECTIONS, ...REPO_SECTIONS]
    : [...PLAN_SECTIONS];
  const counts = Object.fromEntries(sections.map((s) => [s, records[s]?.length ?? 0]));
  const flashing = useFlash(counts, activeRepo);

  const [open, setOpen] = useState<Partial<Record<SectionName, boolean>>>({});
  const [tab, setTab] = useState<Tab>("board");
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
      {activeRepo ? (
        <div className="op-tabs" role="tablist" aria-label="Plan board view">
          {(["board", "history"] as const).map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              className="op-tab"
              aria-selected={tab === name}
              onClick={() => setTab(name)}
            >
              {name === "board" ? "Board" : "History"}
            </button>
          ))}
        </div>
      ) : null}
      {activeRepo && tab === "history" ? (
        <HistoryTab overview={overview} />
      ) : (
        <>
          <div className="op-board-actions">
            <button
              type="button"
              className="op-button"
              disabled={!activeRepo}
              onClick={generateStages}
            >
              Stages
            </button>
            <button type="button" className="op-button" disabled={!activeRepo} onClick={onExport}>
              Export to Octogent
            </button>
            {activeRepo && plan?.goal ? (
              <button type="button" className="op-button op-button--primary" onClick={onHandoff}>
                Hand off to Octogent
              </button>
            ) : null}
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
          {activeRepo ? <NeedsAttention repoPath={activeRepo} /> : null}
          <ul className="op-board">
            {sections.map((section) => {
              const items = records[section] ?? [];
              const expanded = open[section] === true;
              return (
                <li
                  key={section}
                  className={
                    flashing.has(section)
                      ? "op-board-section op-board-section--flash"
                      : "op-board-section"
                  }
                  data-section={section}
                >
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
                      <ul className="op-board-records" aria-label={`${section} records`}>
                        {items.map((item, index) => (
                          <li key={`${item.id}-${index}`} className="op-record" title={item.hint}>
                            {item.id ? <span className="op-record-id">{item.id}</span> : null}
                            {item.onOpen ? (
                              <button
                                type="button"
                                className="op-record-title op-record-open"
                                onClick={item.onOpen}
                              >
                                {item.title}
                              </button>
                            ) : (
                              <span className="op-record-title">{item.title}</span>
                            )}
                            {item.extra}
                            {item.status ? <StatusBadge status={item.status} /> : null}
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
          <ConventionsSection />
          <h2 className="op-pane-title">COVERAGE</h2>
          <CoverageSlot coverage={plan?.coverage} dimensions={ALL_DIMENSIONS} />
        </>
      )}
    </aside>
  );
};
