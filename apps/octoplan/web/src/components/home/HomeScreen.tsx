// D50: the home screen. Two ways in (a new project from an idea, or an import of what already
// exists) plus the recent projects. The server does the work and moves this client to the new
// repo or session with focus-repo / focus-session (useOctoplan.tsx).
import { MATURITY_LABELS, type Session, projectFolderName } from "@octogent/octoplan-protocol";
import { type FormEvent, useId, useState } from "react";
import { normalizeRepoPath, repoName } from "../../app/sessionView";
import { useOctoplan } from "../../app/useOctoplan";
import "./home.css";

type Path = "choose" | "new" | "import";

export const HomeScreen = () => {
  const [path, setPath] = useState<Path>("choose");
  return (
    <section className="op-home" aria-label="Home" data-testid="home-screen">
      {path === "choose" ? (
        <>
          <div className="op-home-paths">
            <button type="button" className="op-home-path" onClick={() => setPath("new")}>
              <span className="op-home-path-title">New project from an idea</span>
              <span className="op-home-path-text">
                Describe the idea. Octoplan creates the folder and starts a deep interview.
              </span>
            </button>
            <button type="button" className="op-home-path" onClick={() => setPath("import")}>
              <span className="op-home-path-title">Import something that exists</span>
              <span className="op-home-path-text">
                A repo, a folder of notes, half a plan, pasted text. Claude reads it, you check what
                it understood, then planning continues from what's missing.
              </span>
            </button>
          </div>
          <RecentProjects />
        </>
      ) : null}
      {path === "new" ? <NewProjectForm onBack={() => setPath("choose")} /> : null}
      {path === "import" ? <ImportForm onBack={() => setPath("choose")} /> : null}
    </section>
  );
};

export type RecentProject = { repoPath: string; latest: Session | null; count: number };

/**
 * Sessions grouped by repo, the most recently started first, then repos that only have a plan
 * (an import still waiting for review has no session yet, and must stay reachable).
 */
export const recentProjects = (
  sessions: readonly Session[],
  planRepos: readonly string[] = [],
): RecentProject[] => {
  const byRepo = new Map<string, Session[]>();
  for (const session of sessions) {
    const list = byRepo.get(session.repoPath) ?? [];
    list.push(session);
    byRepo.set(session.repoPath, list);
  }
  const withSessions = [...byRepo.entries()]
    .map(([repoPath, list]) => {
      const sorted = [...list].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      return { repoPath, latest: sorted[0] as Session, count: list.length };
    })
    .sort((a, b) => b.latest.startedAt.localeCompare(a.latest.startedAt));
  const known = new Set(withSessions.map((p) => p.repoPath.toLowerCase()));
  const planOnly = planRepos
    .filter((repoPath) => !known.has(repoPath.toLowerCase()))
    .map((repoPath) => ({ repoPath, latest: null, count: 0 }));
  return [...withSessions, ...planOnly];
};

const RecentProjects = () => {
  const { sessions, planByRepo, setActiveSession, setActiveRepo, setHome } = useOctoplan();
  const projects = recentProjects(sessions, Object.keys(planByRepo));
  if (projects.length === 0) return null;
  return (
    <section className="op-home-recent" aria-label="Recent projects">
      <h2 className="op-home-heading">Recent projects</h2>
      <ul>
        {projects.map(({ repoPath, latest, count }) => {
          const ingest = planByRepo[repoPath]?.ingest;
          return (
            <li key={repoPath}>
              <button
                type="button"
                className="op-home-project"
                onClick={() => {
                  if (latest) setActiveSession(latest.id);
                  else setActiveRepo(repoPath);
                  setHome(false);
                }}
              >
                <span className="op-home-project-name">{repoName(repoPath)}</span>
                <span className="op-home-project-path">{repoPath}</span>
                <span className="op-home-project-meta">
                  {latest
                    ? `${count} session${count === 1 ? "" : "s"} · last: ${latest.title}`
                    : "no sessions yet"}
                  {ingest?.status === "draft" ? " · import waiting for review" : ""}
                  {ingest?.status === "applied"
                    ? ` · imported (${MATURITY_LABELS[ingest.maturity]})`
                    : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

/** First few words of the idea as a project name ("A tiny habit tracker for…" -> "tiny habit tracker"). */
export const suggestName = (idea: string): string =>
  idea
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0 && !/^(a|an|the)$/i.test(word))
    .slice(0, 3)
    .join(" ")
    .toLowerCase();

const joinPath = (parent: string, child: string) => {
  const sep = parent.includes("\\") ? "\\" : "/";
  return `${parent.replace(/[\\/]+$/, "")}${sep}${child}`;
};

const NewProjectForm = ({ onBack }: { onBack: () => void }) => {
  const { state, sendClientEvent } = useOctoplan();
  const [idea, setIdea] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [parent, setParent] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ideaId = useId();
  const parentDir = parent ?? state.defaultProjectsDir ?? "";
  const shownName = nameTouched ? name : suggestName(idea);
  const slug = projectFolderName(shownName);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!idea.trim()) return setError("Describe the idea first.");
    if (!shownName.trim()) return setError("Give the project a name.");
    if (!parentDir.trim()) return setError("Pick the folder to create it in.");
    setError(null);
    if (
      sendClientEvent({
        type: "create-project",
        parentDir: normalizeRepoPath(parentDir),
        name: shownName.trim(),
        idea: idea.trim(),
      })
    ) {
      setSent(true);
    }
  };

  return (
    <form className="op-form op-home-form" onSubmit={submit} noValidate>
      <h2 className="op-home-heading">New project from an idea</h2>
      <label className="op-field" htmlFor={ideaId}>
        <span>The idea — a sentence or a paragraph is enough</span>
        <textarea
          id={ideaId}
          className="op-home-textarea"
          rows={4}
          value={idea}
          onChange={(event) => setIdea(event.target.value)}
        />
      </label>
      <label className="op-field">
        <span>Project name</span>
        <input
          value={shownName}
          onChange={(event) => {
            setNameTouched(true);
            setName(event.target.value);
          }}
        />
      </label>
      <label className="op-field">
        <span>Create it in</span>
        <input value={parentDir} onChange={(event) => setParent(event.target.value)} />
      </label>
      <p className="op-dialog-hint">
        {slug && parentDir ? (
          <>
            Creates <code>{joinPath(parentDir, slug)}</code> with git, a README holding the idea and
            an empty docs/plan/.
          </>
        ) : (
          "Octoplan creates the folder with git, a README holding the idea and an empty docs/plan/."
        )}
      </p>
      {error ? (
        <p className="op-home-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="op-form-actions">
        <button type="button" className="op-button" onClick={onBack}>
          Back
        </button>
        <button type="submit" className="op-button op-button--primary" disabled={sent}>
          {sent ? "Creating…" : "Create and start planning"}
        </button>
      </div>
    </form>
  );
};

const ImportForm = ({ onBack }: { onBack: () => void }) => {
  const { sendClientEvent } = useOctoplan();
  const [mainPath, setMainPath] = useState("");
  const [extras, setExtras] = useState<string[]>([]);
  const [pastes, setPastes] = useState<string[]>([]);
  const [gitInit, setGitInit] = useState(true);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (list: string[], index: number, value: string) =>
    list.map((item, i) => (i === index ? value : item));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const main = normalizeRepoPath(mainPath);
    if (!main) return setError("The main folder is required: it becomes the project.");
    setError(null);
    if (
      sendClientEvent({
        type: "start-import",
        mainPath: main,
        extraPaths: extras.map(normalizeRepoPath).filter((p) => p.length > 0),
        pastes: pastes.map((p) => p.trim()).filter((p) => p.length > 0),
        gitInit,
      })
    ) {
      setSent(true);
    }
  };

  return (
    <form className="op-form op-home-form" onSubmit={submit} noValidate>
      <h2 className="op-home-heading">Import something that exists</h2>
      <label className="op-field">
        <span>Main folder — a repo or any folder; it becomes the project</span>
        <input value={mainPath} onChange={(event) => setMainPath(event.target.value)} />
      </label>

      <fieldset className="op-home-group">
        <legend>More files or folders (optional, from anywhere)</legend>
        {extras.map((value, index) => (
          <div className="op-home-row" key={`extra-${index.toString()}`}>
            <input
              aria-label={`Extra path ${index + 1}`}
              value={value}
              onChange={(event) => setExtras(update(extras, index, event.target.value))}
            />
            <button
              type="button"
              className="op-button"
              aria-label={`Remove extra path ${index + 1}`}
              onClick={() => setExtras(extras.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="op-button" onClick={() => setExtras([...extras, ""])}>
          Add a file or folder
        </button>
      </fieldset>

      <fieldset className="op-home-group">
        <legend>Pasted text (optional): notes, a chat, a half-written spec</legend>
        {pastes.map((value, index) => (
          <div className="op-home-row op-home-row--paste" key={`paste-${index.toString()}`}>
            <textarea
              aria-label={`Pasted text ${index + 1}`}
              className="op-home-textarea"
              rows={4}
              value={value}
              onChange={(event) => setPastes(update(pastes, index, event.target.value))}
            />
            <button
              type="button"
              className="op-button"
              aria-label={`Remove pasted text ${index + 1}`}
              onClick={() => setPastes(pastes.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="op-button" onClick={() => setPastes([...pastes, ""])}>
          Paste text
        </button>
      </fieldset>

      <label className="op-home-check">
        <input
          type="checkbox"
          checked={gitInit}
          onChange={(event) => setGitInit(event.target.checked)}
        />
        If the main folder has no git, set it up (one empty commit; your files stay uncommitted)
      </label>
      <p className="op-dialog-hint">
        Claude reads everything (read-only) and shows what it understood. Nothing is written to the
        plan until you review and apply it. Pasted text is saved in docs/plan/sources/.
      </p>
      {error ? (
        <p className="op-home-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="op-form-actions">
        <button type="button" className="op-button" onClick={onBack}>
          Back
        </button>
        <button type="submit" className="op-button op-button--primary" disabled={sent}>
          {sent ? "Starting…" : "Import and read"}
        </button>
      </div>
    </form>
  );
};
