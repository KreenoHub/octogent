import { type FormEvent, useState } from "react";
import { repoName } from "../app/sessionView";
import { useOctoplan } from "../app/useOctoplan";

/** Ideas area of the plan board: search IDEAS.md across every known repo. */
export const IdeaSearch = () => {
  const { ideaSearch, sendClientEvent } = useOctoplan();
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    if (sendClientEvent({ type: "search-ideas", query: trimmed })) setSearched(trimmed);
  };

  const results = searched !== null && ideaSearch?.query === searched ? ideaSearch.results : null;

  return (
    <section className="op-ideas" aria-label="Ideas">
      <h2 className="op-pane-title">IDEAS</h2>
      <form className="op-idea-search" aria-label="Idea search" onSubmit={submit}>
        <input
          className="op-idea-search-input"
          aria-label="Search ideas"
          placeholder="Search ideas · [I] to capture"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit" className="op-button" disabled={!query.trim()}>
          Search
        </button>
      </form>
      {searched === null ? null : results === null ? (
        <p className="op-empty">Searching…</p>
      ) : results.length === 0 ? (
        <p className="op-empty">No ideas match “{searched}”.</p>
      ) : (
        <ul className="op-board-records" aria-label="Idea results">
          {results.map(({ repoPath, idea }) => (
            <li key={`${repoPath}:${idea.id}`} className="op-record" title={idea.body}>
              <span className="op-record-id">{idea.id}</span>
              <span className="op-record-title">{idea.title}</span>
              <span className="op-idea-repo" title={repoPath}>
                {repoName(repoPath)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
