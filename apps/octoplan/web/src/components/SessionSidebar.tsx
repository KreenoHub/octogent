import { MODE_LABELS, groupSessionsByRepo, sameRepo, statusDot } from "../app/sessionView";
import { useOctoplan } from "../app/useOctoplan";

export const SessionSidebar = ({
  onNewSession,
  onOpenTerminal,
}: {
  onNewSession: () => void;
  onOpenTerminal: (sessionId: string) => void;
}) => {
  const {
    sessions,
    activeSessionId,
    activeRepo,
    planByRepo,
    setActiveSession,
    setActiveRepo,
    setHome,
  } = useOctoplan();
  const groups = groupSessionsByRepo(sessions, Object.keys(planByRepo));

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
              {group.sessions.length === 0 ? (
                <li className="op-session-row">
                  <button
                    type="button"
                    className="op-session"
                    aria-current={sameRepo(group.repoPath, activeRepo) ? "true" : undefined}
                    onClick={() => {
                      setActiveRepo(group.repoPath);
                      setHome(false);
                    }}
                  >
                    <span className="op-session-title">No sessions yet</span>
                    <span className="op-session-mode">
                      {planByRepo[group.repoPath]?.ingest?.status === "draft"
                        ? "Import waiting for review"
                        : "Plan only"}
                    </span>
                  </button>
                </li>
              ) : null}
              {group.sessions.map((session) => (
                <li key={session.id} className="op-session-row">
                  <button
                    type="button"
                    className="op-session"
                    // Only while its project is the one on screen: a repo opened without a
                    // session (an import under review) must not leave another project's
                    // session looking active.
                    aria-current={
                      session.id === activeSessionId && sameRepo(session.repoPath, activeRepo)
                        ? "true"
                        : undefined
                    }
                    onClick={() => setActiveSession(session.id)}
                  >
                    <span
                      className={`op-dot op-dot--${statusDot(session.status)}`}
                      title={session.status}
                    />
                    <span className="op-session-title">{session.title || "Untitled"}</span>
                    <span className="op-session-mode">
                      {MODE_LABELS[session.mode]}
                      {session.restored ? (
                        <span
                          className="op-session-restored"
                          title="Rebuilt from its transcript after a server restart"
                        >
                          restored
                        </span>
                      ) : null}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="op-session-terminal"
                    aria-label={`Terminal for ${session.title || "Untitled"}`}
                    title="Open this session's terminal"
                    onClick={() => onOpenTerminal(session.id)}
                  >
                    Terminal
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
