import { COVERAGE_DIMENSION_LABELS, type CoverageDimensionId } from "@octogent/octoplan-protocol";
import type { ConnectionState } from "../app/useServerConnection";

const PLAN_SECTIONS = ["Goals", "Decisions", "Gaps", "Parked", "Risks"] as const;

export const CockpitLayout = ({ connection }: { connection: ConnectionState }) => (
  <div className="op-shell">
    <header className="op-header">
      <span className="op-logo">OCTOPLAN</span>
      <span className={`op-status op-status--${connection.status}`} data-testid="connection-status">
        {connection.status === "online"
          ? `ONLINE · v${connection.serverVersion}`
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
      <aside className="op-pane" aria-label="Projects and sessions">
        <h2 className="op-pane-title">PROJECTS</h2>
        <p className="op-empty">No projects yet.</p>
        <h2 className="op-pane-title">SESSIONS</h2>
        <p className="op-empty">Start a deep interview to begin.</p>
      </aside>
      <section className="op-pane op-pane--center" aria-label="Conversation">
        <h2 className="op-pane-title">CONVERSATION</h2>
        <p className="op-empty">Questions from Claude will appear here as cards.</p>
      </section>
      <aside className="op-pane" aria-label="Plan board">
        <h2 className="op-pane-title">PLAN BOARD</h2>
        <ul className="op-board">
          {PLAN_SECTIONS.map((section) => (
            <li key={section}>
              <span>{section}</span>
              <span className="op-count">0</span>
            </li>
          ))}
        </ul>
        <h2 className="op-pane-title">COVERAGE</h2>
        <ul className="op-coverage">
          {(Object.keys(COVERAGE_DIMENSION_LABELS) as CoverageDimensionId[]).map((id) => (
            <li key={id} data-status="unknown">
              {COVERAGE_DIMENSION_LABELS[id]}
            </li>
          ))}
        </ul>
      </aside>
    </main>
  </div>
);
