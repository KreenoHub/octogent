import type { NextAction, WorkflowStepId } from "@octogent/octoplan-protocol";
import { useState } from "react";
import { ExpandAllContext } from "../app/expandAll";
import { useGlobalHotkeys } from "../app/hotkeys";
import { type Overlay, initialOverlay } from "../app/overlays";
import { useOctoplan } from "../app/useOctoplan";
import { useOverview } from "../app/useOverview";
import { useWorkflow } from "../app/useWorkflow";
import { IngestReview } from "../integrations/ingest/IngestReview";
import { BranchDialog } from "./BranchDialog";
import { ConversationPane } from "./ConversationPane";
import { ExportDialog } from "./ExportDialog";
import { FocusMode } from "./FocusMode";
import { GraphOverlay } from "./GraphOverlay";
import { JobsLine, TentaclesButton } from "./HeaderStatus";
import { IdeaCaptureDialog } from "./IdeaCaptureDialog";
import { NewSessionDialog } from "./NewSessionDialog";
import { PlanBoard } from "./PlanBoard";
import { SessionSidebar } from "./SessionSidebar";
import { Toasts } from "./Toasts";
import { HomeScreen } from "./home/HomeScreen";
import { TerminalSlot } from "./slots";
import { NextActionBar } from "./workflow/NextActionBar";
import { BuildStep, GoalStep, HandoffStep, StagesStep } from "./workflow/StepPanes";
import { WorkflowBar } from "./workflow/WorkflowBar";

/** Sent to Claude by the Goal step's next action (D64). */
export const WRITE_GOAL_REQUEST =
  "Please write GOAL.md now with plan_write_goal: the title, why, goals, non-goals and a definition of done where every item is checkable by running something. Ask me first about anything you'd otherwise have to guess.";

export const CockpitLayout = () => {
  const { connection, activeRepo, activeSession, sessions, state, sendClientEvent, home, setHome } =
    useOctoplan();
  const [overlay, setOverlay] = useState<Overlay>(() =>
    initialOverlay(typeof window === "undefined" ? "" : window.location.search),
  );
  const [terminalSessionId, setTerminalSessionId] = useState<string | null>(null);
  // R3: E expands every digest, tool group and answered round in the stream, and folds them back.
  const [expandAll, setExpandAll] = useState(false);
  const overview = useOverview(activeRepo);
  const workflow = useWorkflow(overview.overview);
  // D63: the centre follows the current step until the user picks another one; a pick lasts
  // until the workflow moves on (or the repo changes).
  const [picked, setPicked] = useState<{
    repo: string;
    current: WorkflowStepId;
    step: WorkflowStepId;
  } | null>(null);
  const selected: WorkflowStepId | null = workflow
    ? picked && picked.repo === activeRepo && picked.current === workflow.current
      ? picked.step
      : workflow.current
    : null;
  const pick = (step: WorkflowStepId) => {
    if (step === "start") {
      setHome(true);
      return;
    }
    if (activeRepo && workflow) setPicked({ repo: activeRepo, current: workflow.current, step });
  };

  const close = () => setOverlay("none");
  const toggle = (target: Overlay) => setOverlay(overlay === target ? "none" : target);
  const requestGraph = () => {
    if (activeRepo) sendClientEvent({ type: "request-graph", repoPath: activeRepo });
  };
  const openGraph = () => {
    requestGraph();
    setOverlay("graph");
  };
  const toggleGraph = () => (overlay === "graph" ? close() : openGraph());

  // The map is rebuilt every render and read through a ref, so handlers see fresh state.
  useGlobalHotkeys({
    f: () => toggle("focus"),
    i: () => toggle("idea"),
    b: () => toggle("branch"),
    g: toggleGraph,
    e: () => setExpandAll((value) => !value),
    Escape: close,
  });

  // D65: every hotkey also has a button.
  const tools = [
    { key: "F", label: "Focus", onClick: () => toggle("focus"), active: overlay === "focus" },
    { key: "I", label: "Idea", onClick: () => toggle("idea"), active: overlay === "idea" },
    { key: "B", label: "Branch", onClick: () => toggle("branch"), active: overlay === "branch" },
    { key: "G", label: "Tentacles", onClick: toggleGraph, active: overlay === "graph" },
    {
      key: "E",
      label: "Expand all",
      onClick: () => setExpandAll((value) => !value),
      active: expandAll,
    },
  ];

  /** The repo's session to talk to: the active one when it's in this repo, else the newest. */
  const repoSession = () =>
    activeSession?.repoPath === activeRepo
      ? activeSession
      : ([...sessions]
          .filter((s) => s.repoPath === activeRepo)
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null);

  const startInterview = (topic: string) => {
    if (!activeRepo) return;
    sendClientEvent({ type: "start-session", repoPath: activeRepo, mode: "deep-interview", topic });
  };

  const onAction = (action: NextAction) => {
    if (!activeRepo) return;
    const plan = state.planByRepo[activeRepo];
    switch (action.kind) {
      case "open-review":
        return pick("understand");
      case "start-interview":
        startInterview(plan?.goal?.title ?? plan?.ingest?.title ?? "");
        return pick("interview");
      case "answer-round":
      case "keep-interviewing":
        return pick("interview");
      case "write-goal": {
        const session = repoSession();
        if (session && session.status !== "ended" && session.status !== "error") {
          sendClientEvent({
            type: "send-message",
            sessionId: session.id,
            text: WRITE_GOAL_REQUEST,
          });
        } else {
          startInterview("Write GOAL.md from the plan so far");
        }
        return pick("interview");
      }
      case "generate-stages":
        sendClientEvent({ type: "generate-stages", repoPath: activeRepo });
        return pick("stages");
      case "hand-off":
        return pick("handoff");
      case "run-octogent":
        sendClientEvent({ type: "launch-octogent", repoPath: activeRepo });
        return pick("build");
      default:
        return undefined;
    }
  };

  const centre = () => {
    if (!activeRepo || !selected) {
      return (
        <ExpandAllContext.Provider value={expandAll}>
          <ConversationPane onFocus={() => setOverlay("focus")} />
        </ExpandAllContext.Provider>
      );
    }
    switch (selected) {
      case "understand":
        return (
          <section className="op-pane op-step-pane" aria-label="Understand step">
            <IngestReview repoPath={activeRepo} onClose={() => pick("interview")} />
          </section>
        );
      case "goal":
        return <GoalStep repoPath={activeRepo} />;
      case "stages":
        return <StagesStep repoPath={activeRepo} />;
      case "handoff":
        return (
          <HandoffStep
            repoPath={activeRepo}
            onExportOne={() => setOverlay("export")}
            onDone={() => pick("build")}
          />
        );
      case "build":
        return (
          <BuildStep
            repoPath={activeRepo}
            overview={overview.overview}
            loading={overview.loading}
            onRefresh={overview.refresh}
          />
        );
      default:
        return (
          <ExpandAllContext.Provider value={expandAll}>
            <ConversationPane onFocus={() => setOverlay("focus")} />
          </ExpandAllContext.Provider>
        );
    }
  };

  return (
    <div className="op-shell" data-terminal={terminalSessionId ? "open" : undefined}>
      <header className="op-header">
        <span className="op-logo">OCTOPLAN</span>
        <button
          type="button"
          className="op-button op-header-home"
          aria-pressed={home}
          onClick={() => setHome(!home)}
        >
          {home ? "Back to planning" : "Home"}
        </button>
        <div className="op-header-right">
          {activeRepo ? <JobsLine repoPath={activeRepo} /> : null}
          {activeRepo ? (
            <TentaclesButton
              repoPath={activeRepo}
              overview={overview.overview}
              onOpen={openGraph}
            />
          ) : null}
          <span
            className={`op-status op-status--${connection.status}`}
            data-testid="connection-status"
          >
            {connection.status === "online"
              ? `ONLINE · v${connection.serverVersion ?? "?"}`
              : connection.status.toUpperCase()}
          </span>
        </div>
      </header>
      {home ? null : (
        <WorkflowBar workflow={workflow} selected={selected} onSelect={pick} tools={tools} />
      )}
      <main className={home ? "op-panes op-panes--home" : "op-panes"}>
        {home ? (
          <HomeScreen />
        ) : (
          <>
            <SessionSidebar
              onNewSession={() => setOverlay("new-session")}
              onOpenTerminal={setTerminalSessionId}
            />
            {centre()}
            <PlanBoard />
          </>
        )}
      </main>
      {home ? null : (
        <NextActionBar
          workflow={
            // Already on the review: point at its Apply button instead of reopening it.
            workflow && selected === "understand" && workflow.next.kind === "open-review"
              ? {
                  ...workflow,
                  next: {
                    ...workflow.next,
                    kind: "wait",
                    label: "Keep, edit or drop items, then Apply",
                  },
                }
              : workflow
          }
          onAction={onAction}
          href={activeRepo ? state.octogentStatusByRepo[activeRepo]?.url : undefined}
        />
      )}
      {terminalSessionId ? (
        <section className="op-terminal-panel" aria-label="Terminal">
          <TerminalSlot
            key={terminalSessionId}
            sessionId={terminalSessionId}
            onClose={() => setTerminalSessionId(null)}
          />
        </section>
      ) : null}
      {overlay === "focus" ? <FocusMode onExit={close} /> : null}
      {overlay === "new-session" ? <NewSessionDialog onClose={close} /> : null}
      {overlay === "idea" ? <IdeaCaptureDialog onClose={close} /> : null}
      {overlay === "branch" ? <BranchDialog onClose={close} /> : null}
      {overlay === "graph" ? (
        <GraphOverlay
          repoPath={activeRepo}
          overview={overview.overview}
          overviewLoading={overview.loading}
          onRefreshOverview={overview.refresh}
          onRefresh={requestGraph}
          onClose={close}
        />
      ) : null}
      {overlay === "export" && activeRepo ? (
        <ExportDialog repoPath={activeRepo} onClose={close} />
      ) : null}
      <Toasts />
    </div>
  );
};
