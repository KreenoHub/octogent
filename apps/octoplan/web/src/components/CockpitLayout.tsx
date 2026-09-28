import { useState } from "react";
import { ExpandAllContext } from "../app/expandAll";
import { useGlobalHotkeys } from "../app/hotkeys";
import { type Overlay, initialOverlay } from "../app/overlays";
import { useOctoplan } from "../app/useOctoplan";
import { useOverview } from "../app/useOverview";
import { BranchDialog } from "./BranchDialog";
import { ConversationPane } from "./ConversationPane";
import { ExportDialog } from "./ExportDialog";
import { FocusMode } from "./FocusMode";
import { GraphOverlay } from "./GraphOverlay";
import { HandoffDialog } from "./HandoffDialog";
import { IngestDialog } from "./IngestDialog";
import { HomeScreen } from "./home/HomeScreen";
import { JobsLine, TentaclesButton } from "./HeaderStatus";
import { IdeaCaptureDialog } from "./IdeaCaptureDialog";
import { NewSessionDialog } from "./NewSessionDialog";
import { PlanBoard } from "./PlanBoard";
import { SessionSidebar } from "./SessionSidebar";
import { Toasts } from "./Toasts";
import { TerminalSlot } from "./slots";

/** The red hotkey bar; keep it in sync with the useGlobalHotkeys map below. */
export const HOTKEYS = [
  ["F", "FOCUS"],
  ["I", "IDEA"],
  ["B", "BRANCH"],
  ["G", "GRAPH"],
  ["E", "EXPAND ALL"],
  ["ESC", "CLOSE"],
] as const;

export const CockpitLayout = () => {
  const { connection, activeRepo, sendClientEvent, home, setHome, planByRepo } = useOctoplan();
  // D56: the review opens by itself while an import runs or waits; "Later" hides it until the
  // next import (keyed by its createdAt and item count) or the header button.
  const ingest = activeRepo ? (planByRepo[activeRepo]?.ingest ?? null) : null;
  const ingestKey = ingest ? `${activeRepo}|${ingest.createdAt}|${ingest.items.length}` : null;
  const [ingestHidden, setIngestHidden] = useState<string | null>(null);
  const ingestOpen =
    !home &&
    ingest !== null &&
    (ingest.status === "running" || ingest.status === "draft") &&
    ingestHidden !== ingestKey;
  const [overlay, setOverlay] = useState<Overlay>(() =>
    initialOverlay(typeof window === "undefined" ? "" : window.location.search),
  );
  const [terminalSessionId, setTerminalSessionId] = useState<string | null>(null);
  // R3: E expands every digest, tool group and answered round in the stream, and folds them back.
  const [expandAll, setExpandAll] = useState(false);
  const overview = useOverview(activeRepo);
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
          {!home && ingest && ingest.status === "draft" && !ingestOpen ? (
            <button type="button" className="op-button" onClick={() => setIngestHidden(null)}>
              Review import
            </button>
          ) : null}
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
      <nav className="op-nav" aria-label="Octoplan hotkeys">
        {HOTKEYS.map(([key, label]) => (
          <span key={key} data-active={key === "E" && expandAll ? "true" : undefined}>
            [{key}] {label}
          </span>
        ))}
      </nav>
      <main className={home ? "op-panes op-panes--home" : "op-panes"}>
        {home ? (
          <HomeScreen />
        ) : (
          <>
            <SessionSidebar
              onNewSession={() => setOverlay("new-session")}
              onOpenTerminal={setTerminalSessionId}
            />
            <ExpandAllContext.Provider value={expandAll}>
              <ConversationPane onFocus={() => setOverlay("focus")} />
            </ExpandAllContext.Provider>
            <PlanBoard
              onExport={() => setOverlay("export")}
              onHandoff={() => setOverlay("handoff")}
            />
          </>
        )}
      </main>
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
      {overlay === "handoff" && activeRepo ? (
        <HandoffDialog repoPath={activeRepo} onClose={close} />
      ) : null}
      {ingestOpen && activeRepo ? (
        <IngestDialog repoPath={activeRepo} onClose={() => setIngestHidden(ingestKey)} />
      ) : null}
      <Toasts />
    </div>
  );
};
