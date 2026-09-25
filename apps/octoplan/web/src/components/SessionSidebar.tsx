import { MODE_LABELS, groupSessionsByRepo, statusDot } from "../app/sessionView";
import { useOctoplan } from "../app/useOctoplan";

export const SessionSidebar = ({ onNewSession }: { onNewSession: () => void }) => {
  const { sessions, activeSessionId, setActiveSession } = useOctoplan();
  const groups = groupSessionsByRepo(sessions);

  return (
    <aside className="op-pane" aria-label="Projects and sessions">
      <button type="button" className="op-button op-button--primary" onClick={onNewSession}>
        + NEW SESSION
      </button>
      <h2 className="op-pane-title">PROJECTS</h2>
      {groups.length === 0 ? (
        <p className="op-empty">No projects yet. Start a session to begin.</p>
      ) : (
        groups.map((group) => (
          <section
            key={group.repoPath}
            className="op-repo"
            aria-label={group.name}
            title={group.repoPath}
          >
            <h3 className="op-repo-name">{group.name}</h3>
            <ul className="op-session-list">
              {group.sessions.map((session) => (
                <li key={session.id}>
                  <button
                    type="button"
                    className="op-session"
                    aria-current={session.id === activeSessionId ? "true" : undefined}
                    onClick={() => setActiveSession(session.id)}
                  >
                    <span
                      className={`op-dot op-dot--${statusDot(session.status)}`}
                      title={session.status}
                    />
                    <span className="op-session-title">{session.title || "Untitled"}</span>
                    <span className="op-session-mode">{MODE_LABELS[session.mode]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </aside>
  );
};
