// G: the branch graph. An SVG lane graph of `git log --all`, tentacle swimlanes for
// `octogent/*` worker branches, PR/CI badges, and conversation branches beside their git branch.
import type {
  ConversationBranch,
  GitBranchNode,
  GitGraph,
  PrStatus,
} from "@octogent/octoplan-protocol";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BranchGraphSlotProps } from "../components/slots";
import { LANE_COLORS, isBranchRef, layoutGraph, localName, prForBranch } from "./graphLayout";
import "./branchGraph.css";

/** While the view is open it asks again every minute; the server's gh cache adds the backoff. */
export const AUTO_REFRESH_MS = 60_000;

const laneClass = (lane: number) => `op-bg-lane-${lane % LANE_COLORS}`;

const AheadBehind = ({ branch }: { branch: GitBranchNode }) => (
  <span
    className="op-bg-chip op-bg-chip--ab"
    data-testid="bg-ahead-behind"
    title={`${branch.ahead} ahead of, ${branch.behind} behind the base branch`}
  >
    ↑{branch.ahead} ↓{branch.behind}
  </span>
);

const CHECK_LABEL: Record<PrStatus["checks"], string> = {
  passing: "CI ✓",
  failing: "CI ✗",
  pending: "CI …",
  none: "",
};

const PrBadge = ({ pr }: { pr: PrStatus }) => (
  <a
    className={`op-bg-pr op-bg-pr--${pr.isDraft ? "draft" : pr.state} op-bg-ci--${pr.checks}`}
    data-testid="bg-pr-badge"
    data-checks={pr.checks}
    href={pr.url}
    target="_blank"
    rel="noreferrer"
    title={`${pr.title} (${pr.isDraft ? "draft" : pr.state}, checks ${pr.checks})`}
    onClick={(event) => event.stopPropagation()}
  >
    #{pr.number}
    {pr.isDraft ? " draft" : pr.state === "open" ? "" : ` ${pr.state}`}
    {CHECK_LABEL[pr.checks] ? <span className="op-bg-ci">{CHECK_LABEL[pr.checks]}</span> : null}
  </a>
);

const ConvoMarker = ({ branch }: { branch: ConversationBranch }) => (
  <span
    className={`op-bg-chip op-bg-convo op-bg-convo--${branch.status}`}
    data-testid="bg-convo-marker"
    title={`Conversation branch ${branch.id}: ${branch.title} (${branch.status})`}
  >
    ⑂ {branch.id}
  </span>
);

type BranchRowProps = {
  graph: GitGraph;
  branch: GitBranchNode;
  convos: readonly ConversationBranch[];
  selected: boolean;
  onSelect: (name: string) => void;
};

const BranchRow = ({ graph, branch, convos, selected, onSelect }: BranchRowProps) => {
  const pr = prForBranch(graph, branch.name, branch.isRemote);
  return (
    <li className="op-bg-branch" data-testid="bg-branch" data-branch={branch.name}>
      <button
        type="button"
        className={`op-bg-branch-name${selected ? " is-selected" : ""}`}
        onClick={() => onSelect(branch.name)}
        aria-pressed={selected}
      >
        {branch.name}
      </button>
      <AheadBehind branch={branch} />
      {pr ? <PrBadge pr={pr} /> : null}
      {convos.map((c) => (
        <ConvoMarker key={c.id} branch={c} />
      ))}
    </li>
  );
};

const LinkControl = ({
  convo,
  branchNames,
  onLink,
}: {
  convo: ConversationBranch;
  branchNames: readonly string[];
  onLink: (branchId: string, gitBranch: string) => void;
}) => {
  const [choice, setChoice] = useState("");
  return (
    <span className="op-bg-link">
      <select
        aria-label={`Git branch for ${convo.id}`}
        value={choice}
        onChange={(event) => setChoice(event.target.value)}
      >
        <option value="">link to git branch…</option>
        {branchNames.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="op-button op-bg-small"
        disabled={!choice}
        onClick={() => onLink(convo.id, choice)}
      >
        Link
      </button>
    </span>
  );
};

const BranchDetails = ({
  graph,
  branch,
  convos,
}: {
  graph: GitGraph;
  branch: GitBranchNode;
  convos: readonly ConversationBranch[];
}) => {
  const pr = prForBranch(graph, branch.name, branch.isRemote);
  return (
    <section
      className="op-bg-panel op-bg-details"
      data-testid="bg-details"
      aria-label="Branch details"
    >
      <h3 className="op-bg-panel-title">{branch.name}</h3>
      <dl>
        <dt>head</dt>
        <dd>
          <code>{branch.head.slice(0, 10)}</code>
        </dd>
        <dt>vs base</dt>
        <dd>
          {branch.ahead} ahead · {branch.behind} behind
        </dd>
        <dt>where</dt>
        <dd>{branch.isRemote ? "remote" : "local"}</dd>
        {branch.tentacleId ? (
          <>
            <dt>tentacle</dt>
            <dd>{branch.tentacleId}</dd>
          </>
        ) : null}
        <dt>PR</dt>
        <dd>
          {pr ? (
            <>
              <PrBadge pr={pr} /> {pr.title}
            </>
          ) : (
            "none"
          )}
        </dd>
        <dt>conversation</dt>
        <dd>{convos.length > 0 ? convos.map((c) => `${c.id} ${c.title}`).join(", ") : "none"}</dd>
      </dl>
    </section>
  );
};

const CommitGraph = ({
  graph,
  convosByBranch,
  onSelect,
}: {
  graph: GitGraph;
  convosByBranch: Map<string, ConversationBranch[]>;
  onSelect: (name: string) => void;
}) => {
  const layout = useMemo(() => layoutGraph(graph.commits), [graph.commits]);
  const remote = useMemo(
    () => new Map(graph.branches.map((b) => [b.name, b.isRemote])),
    [graph.branches],
  );
  return (
    // rows are ROW_H (24px) tall in branchGraph.css so they line up with the SVG
    <div className="op-bg-commits">
      <svg
        className="op-bg-svg"
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label={`Commit graph, ${graph.commits.length} commits`}
      >
        {layout.edges.map((edge) => (
          <path key={edge.key} d={edge.d} className={`op-bg-edge ${laneClass(edge.lane)}`} />
        ))}
        {layout.dots.map((dot) => (
          <circle
            key={dot.hash}
            data-testid="bg-commit"
            data-lane={dot.lane}
            cx={dot.x}
            cy={dot.y}
            r={dot.merge ? 4.5 : 3.5}
            className={`op-bg-dot ${laneClass(dot.lane)}${dot.merge ? " is-merge" : ""}`}
          />
        ))}
      </svg>
      <ol className="op-bg-rows">
        {graph.commits.map((commit) => (
          <li key={commit.hash} className="op-bg-row" data-testid="bg-row">
            {commit.refs.map((ref) => {
              if (!isBranchRef(ref)) {
                return (
                  <span key={ref} className="op-bg-ref op-bg-ref--tag">
                    {ref.replace(/^tag: /, "")}
                  </span>
                );
              }
              const isRemote = remote.get(ref) ?? false;
              const pr = prForBranch(graph, ref, isRemote);
              const convos = isRemote ? [] : (convosByBranch.get(ref) ?? []);
              return (
                <span key={ref} className="op-bg-ref-group">
                  <button
                    type="button"
                    data-testid="bg-ref"
                    className={`op-bg-ref${isRemote ? " op-bg-ref--remote" : ""} ${laneClass(commit.lane)}`}
                    onClick={() => onSelect(ref)}
                  >
                    {ref}
                  </button>
                  {pr && !isRemote ? <PrBadge pr={pr} /> : null}
                  {convos.map((c) => (
                    <ConvoMarker key={c.id} branch={c} />
                  ))}
                </span>
              );
            })}
            <span className="op-bg-subject">{commit.subject}</span>
            <code className="op-bg-hash">{commit.hash.slice(0, 7)}</code>
          </li>
        ))}
      </ol>
    </div>
  );
};

export const BranchGraph = ({
  graph,
  loading,
  onRefresh,
  onLinkBranch,
  onClose,
}: BranchGraphSlotProps) => {
  const [selected, setSelected] = useState<string | null>(null);
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;

  useEffect(() => {
    const timer = setInterval(() => refresh.current(), AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const convosByBranch = useMemo(() => {
    const map = new Map<string, ConversationBranch[]>();
    for (const convo of graph?.conversationBranches ?? []) {
      if (!convo.gitBranch) continue;
      map.set(convo.gitBranch, [...(map.get(convo.gitBranch) ?? []), convo]);
    }
    return map;
  }, [graph?.conversationBranches]);

  const header = (
    <header className="op-bg-header">
      <h2 className="op-bg-title">Branch graph</h2>
      {graph ? (
        <span className="op-bg-counts" data-testid="bg-counts">
          {graph.commits.length} commits · {graph.branches.length} branches · {graph.prs.length} PRs
        </span>
      ) : null}
      {loading ? <output className="op-bg-loading">loading…</output> : null}
      <span className="op-bg-actions">
        <button
          type="button"
          className="op-button op-bg-small"
          onClick={onRefresh}
          disabled={loading}
        >
          Refresh
        </button>
        <button type="button" className="op-button op-bg-small" onClick={onClose}>
          Close
        </button>
      </span>
    </header>
  );

  if (!graph) {
    return (
      <div className="op-bg" data-testid="branch-graph">
        {header}
        <p className="op-bg-empty">{loading ? "Reading git history…" : "No graph loaded yet."}</p>
      </div>
    );
  }

  const localNames = graph.branches.filter((b) => !b.isRemote).map((b) => b.name);
  const inLane = new Set(graph.lanes.flatMap((lane) => lane.branches));
  const byName = new Map(graph.branches.map((b) => [b.name, b]));
  const others = graph.branches
    .filter((b) => !inLane.has(b.name))
    .sort((a, b) => Number(a.isRemote) - Number(b.isRemote) || a.name.localeCompare(b.name));
  const selectedBranch = selected ? byName.get(selected) : undefined;
  const convosFor = (branch: GitBranchNode) =>
    branch.isRemote ? [] : (convosByBranch.get(localName(branch.name, false)) ?? []);
  const row = (branch: GitBranchNode) => (
    <BranchRow
      key={branch.name}
      graph={graph}
      branch={branch}
      convos={convosFor(branch)}
      selected={branch.name === selected}
      onSelect={setSelected}
    />
  );

  return (
    <div className="op-bg" data-testid="branch-graph" data-repo={graph.repoPath}>
      {header}
      {graph.hint ? (
        <p className="op-bg-hint" data-testid="bg-hint">
          {graph.hint}
        </p>
      ) : null}
      {graph.commits.length === 0 ? (
        <p className="op-bg-empty">No git history here yet.</p>
      ) : (
        <div className="op-bg-body">
          <section className="op-bg-panel op-bg-main" aria-label="Commits">
            <CommitGraph graph={graph} convosByBranch={convosByBranch} onSelect={setSelected} />
          </section>
          <aside className="op-bg-side">
            {selectedBranch ? (
              <BranchDetails
                graph={graph}
                branch={selectedBranch}
                convos={convosFor(selectedBranch)}
              />
            ) : null}
            {graph.lanes.length > 0 ? (
              <section className="op-bg-panel" aria-label="Tentacle swimlanes">
                <h3 className="op-bg-panel-title">Tentacles</h3>
                {graph.lanes.map((lane) => (
                  <div
                    key={lane.tentacleId}
                    className="op-bg-swimlane"
                    data-testid="bg-swimlane"
                    data-tentacle={lane.tentacleId}
                  >
                    <h4 className="op-bg-swimlane-title">
                      {lane.tentacleId}
                      <span className="op-bg-swimlane-count">{lane.branches.length}</span>
                    </h4>
                    <ul className="op-bg-list">
                      {lane.branches.flatMap((name) => {
                        const branch = byName.get(name);
                        return branch ? [row(branch)] : [];
                      })}
                    </ul>
                  </div>
                ))}
              </section>
            ) : null}
            <section className="op-bg-panel" aria-label="Branches">
              <h3 className="op-bg-panel-title">Branches</h3>
              <ul className="op-bg-list">{others.map(row)}</ul>
            </section>
            <section className="op-bg-panel" aria-label="Conversation branches">
              <h3 className="op-bg-panel-title">Conversation branches</h3>
              {graph.conversationBranches.length === 0 ? (
                <p className="op-bg-empty">None yet: press B on a card to branch a conversation.</p>
              ) : (
                <ul className="op-bg-list">
                  {graph.conversationBranches.map((convo) => (
                    <li key={convo.id} className="op-bg-convo-row" data-testid="bg-convo">
                      <ConvoMarker branch={convo} />
                      <span className="op-bg-convo-title">{convo.title}</span>
                      {convo.gitBranch ? (
                        <span
                          className={`op-bg-chip${byName.has(convo.gitBranch) ? "" : " is-missing"}`}
                          data-testid="bg-convo-link"
                        >
                          → {convo.gitBranch}
                          {byName.has(convo.gitBranch) ? "" : " (not found)"}
                        </span>
                      ) : (
                        <LinkControl convo={convo} branchNames={localNames} onLink={onLinkBranch} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      )}
    </div>
  );
};
