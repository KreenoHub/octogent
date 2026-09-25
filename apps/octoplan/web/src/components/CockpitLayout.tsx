import { useState } from "react";
import { useGlobalHotkeys } from "../app/hotkeys";
import { useOctoplan } from "../app/useOctoplan";
import { ConversationPane } from "./ConversationPane";
import { FocusMode } from "./FocusMode";
import { NewSessionDialog } from "./NewSessionDialog";
import { PlanBoard } from "./PlanBoard";
import { SessionSidebar } from "./SessionSidebar";

type Overlay = "none" | "focus" | "new-session";

export const CockpitLayout = () => {
  const { connection } = useOctoplan();
  const [overlay, setOverlay] = useState<Overlay>("none");

  useGlobalHotkeys({
    f: () => setOverlay((current) => (current === "focus" ? "none" : "focus")),
    Escape: () => setOverlay("none"),
  });

  return (
    <div className="op-shell">
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
        <span>[F] FOCUS</span>
        <span>[I] IDEA</span>
        <span>[B] BRANCH</span>
        <span>[G] GRAPH</span>
      </nav>
      <main className="op-panes">
        <SessionSidebar onNewSession={() => setOverlay("new-session")} />
        <ConversationPane onFocus={() => setOverlay("focus")} />
        <PlanBoard />
      </main>
      {overlay === "focus" ? <FocusMode onExit={() => setOverlay("none")} /> : null}
      {overlay === "new-session" ? <NewSessionDialog onClose={() => setOverlay("none")} /> : null}
    </div>
  );
};
