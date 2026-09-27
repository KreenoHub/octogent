import { useState } from "react";
import { useGlobalHotkeys } from "../app/hotkeys";
import { useOctoplan } from "../app/useOctoplan";
import { BranchDialog } from "./BranchDialog";
import { ConversationPane } from "./ConversationPane";
import { ExportDialog } from "./ExportDialog";
import { FocusMode } from "./FocusMode";
import { GraphOverlay } from "./GraphOverlay";
import { IdeaCaptureDialog } from "./IdeaCaptureDialog";
import { NewSessionDialog } from "./NewSessionDialog";
import { PlanBoard } from "./PlanBoard";
import { SessionSidebar } from "./SessionSidebar";
import { Toasts } from "./Toasts";
import { TerminalSlot } from "./slots";

type Overlay = "none" | "focus" | "new-session" | "idea" | "branch" | "graph" | "export";

/** `?focus=1` opens focus mode on load: a bookmarkable "just answer questions" view. */
export const initialOverlay = (search: string): Overlay =>
  new URLSearchParams(search).get("focus") === "1" ? "focus" : "none";

/** The red hotkey bar; keep it in sync with the useGlobalHotkeys map below. */
export const HOTKEYS = [
  ["F", "FOCUS"],
  ["I", "IDEA"],
  ["B", "BRANCH"],
  ["G", "GRAPH"],
  ["ESC", "CLOSE"],
] as const;

export const CockpitLayout = () => {
  const { connection, activeRepo, sendClientEvent } = useOctoplan();
  const [overlay, setOverlay] = useState<Overlay>(() =>
    initialOverlay(typeof window === "undefined" ? "" : window.location.search),
  );
  const [terminalSessionId, setTerminalSessionId] = useState<string | null>(null);
  const close = () => setOverlay("none");
  const toggle = (target: Overlay) => setOverlay(overlay === target ? "none" : target);

  const requestGraph = () => {
    if (activeRepo) sendClientEvent({ type: "request-graph", repoPath: activeRepo });
  };
  const toggleGraph = () => {
    if (overlay === "graph") return close();
    requestGraph();
    setOverlay("graph");
  };

  // The map is rebuilt every render and read through a ref, so handlers see fresh state.
  useGlobalHotkeys({
    f: () => toggle("focus"),
    i: () => toggle("idea"),
    b: () => toggle("branch"),
    g: toggleGraph,
    Escape: close,
  });

  return (
    <div className="op-shell" data-terminal={terminalSessionId ? "open" : undefined}>
      <header className="op-header">
        <span className="op-logo">OCTOPLAN</span>
        <span
          className={`op-status op-status--${connection.status}`}
          data-testid="connection-status"
        >
          {connection.status === "online"
            ? `ONLINE · v${connection.serverVersion ?? "?"}`
            : connection.status.toUpperCase()}
        </span>
      </header>
      <nav className="op-nav" aria-label="Octoplan hotkeys">
        {HOTKEYS.map(([key, label]) => (
          <span key={key}>
            [{key}] {label}
          </span>
        ))}
      </nav>
      <main className="op-panes">
        <SessionSidebar
          onNewSession={() => setOverlay("new-session")}
          onOpenTerminal={setTerminalSessionId}
        />
        <ConversationPane onFocus={() => setOverlay("focus")} />
        <PlanBoard onExport={() => setOverlay("export")} />
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
        <GraphOverlay repoPath={activeRepo} onRefresh={requestGraph} onClose={close} />
      ) : null}
      {overlay === "export" && activeRepo ? (
        <ExportDialog repoPath={activeRepo} onClose={close} />
      ) : null}
      <Toasts />
    </div>
  );
};
