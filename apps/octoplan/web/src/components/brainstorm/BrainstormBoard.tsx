import type { Idea, IdeaAction } from "@octogent/octoplan-protocol";
import { useId, useState } from "react";
import "./brainstorm.css";

export type BrainstormBoardProps = {
  ideas: readonly Idea[];
  onAction: (ideaId: string, action: IdeaAction, intoId?: string) => void;
  onConverge: () => void;
};

type Status = Idea["status"];

// Mirrors the legal transitions in server/modes/brainstorm.ts (the server has the final say).
const ACTIONS_BY_STATUS: Record<Status, readonly Exclude<IdeaAction, "merge">[]> = {
  inbox: ["star", "park", "kill", "adopt"],
  starred: ["park", "kill", "adopt"],
  parked: ["reopen"],
  killed: ["reopen"],
  merged: [],
  adopted: [],
};
const CAN_MERGE: readonly Status[] = ["inbox", "starred"];
const MERGE_TARGET_BLOCKED: readonly Status[] = ["killed", "merged"];

const LABEL: Record<IdeaAction, string> = {
  star: "Star",
  park: "Park",
  kill: "Kill",
  adopt: "Adopt",
  merge: "Merge",
  reopen: "Reopen",
};

const OPEN_COLUMNS: readonly { status: Status; title: string }[] = [
  { status: "inbox", title: "Inbox" },
  { status: "starred", title: "Starred" },
  { status: "parked", title: "Parked" },
];
const DONE_STATUSES: readonly Status[] = ["merged", "killed", "adopted"];

type CardProps = {
  idea: Idea;
  ideas: readonly Idea[];
  onAction: BrainstormBoardProps["onAction"];
};

const IdeaCard = ({ idea, ideas, onAction }: CardProps) => {
  const titleId = useId();
  const targets = CAN_MERGE.includes(idea.status)
    ? ideas.filter((t) => t.id !== idea.id && !MERGE_TARGET_BLOCKED.includes(t.status))
    : [];
  const [picked, setPicked] = useState("");
  const intoId = targets.some((t) => t.id === picked) ? picked : (targets[0]?.id ?? "");
  const actions = ACTIONS_BY_STATUS[idea.status];

  return (
    <article className="op-idea" data-status={idea.status} aria-labelledby={titleId}>
      <header className="op-idea-head">
        <span className="op-idea-id">{idea.id}</span>
        <h4 className="op-idea-title" id={titleId}>
          {idea.title}
        </h4>
      </header>
      {idea.body.trim() && <p className="op-idea-body">{idea.body}</p>}
      {idea.tags.length > 0 && (
        <ul className="op-idea-tags" aria-label="Tags">
          {idea.tags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      )}
      {(actions.length > 0 || targets.length > 0) && (
        <div className="op-idea-actions">
          {actions.map((action) => (
            <button
              key={action}
              type="button"
              className="op-button op-idea-action"
              data-action={action}
              onClick={() => onAction(idea.id, action)}
            >
              {LABEL[action]}
            </button>
          ))}
          {targets.length > 0 && (
            <span className="op-idea-merge">
              <select
                className="op-idea-merge-select"
                aria-label={`Merge ${idea.id} into`}
                value={intoId}
                onChange={(event) => setPicked(event.target.value)}
              >
                {targets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.id} · {target.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="op-button op-idea-action"
                data-action="merge"
                onClick={() => onAction(idea.id, "merge", intoId)}
              >
                {LABEL.merge}
              </button>
            </span>
          )}
        </div>
      )}
    </article>
  );
};

type CardListProps = Omit<CardProps, "idea"> & { items: readonly Idea[] };

const CardList = ({ items, ideas, onAction }: CardListProps) =>
  items.length === 0 ? (
    <p className="op-empty op-brainstorm-empty">No ideas here.</p>
  ) : (
    <div className="op-brainstorm-cards">
      {items.map((idea) => (
        <IdeaCard key={idea.id} idea={idea} ideas={ideas} onAction={onAction} />
      ))}
    </div>
  );

export const BrainstormBoard = ({ ideas, onAction, onConverge }: BrainstormBoardProps) => {
  const baseId = useId();
  const starredCount = ideas.filter((idea) => idea.status === "starred").length;
  const done = ideas.filter((idea) => DONE_STATUSES.includes(idea.status));

  return (
    <div className="op-brainstorm" data-testid="brainstorm-board">
      <div className="op-brainstorm-toolbar">
        <button
          type="button"
          className="op-button op-button--primary op-brainstorm-converge"
          disabled={starredCount === 0}
          onClick={onConverge}
        >
          Converge ({starredCount} starred)
        </button>
      </div>
      <div className="op-brainstorm-columns">
        {OPEN_COLUMNS.map(({ status, title }) => {
          const items = ideas.filter((idea) => idea.status === status);
          const headingId = `${baseId}-${status}`;
          return (
            <section
              key={status}
              className="op-brainstorm-col"
              data-column={status}
              aria-labelledby={headingId}
            >
              <h3 className="op-brainstorm-col-title" id={headingId}>
                {title} <span className="op-brainstorm-count">({items.length})</span>
              </h3>
              <CardList items={items} ideas={ideas} onAction={onAction} />
            </section>
          );
        })}
        <section
          className="op-brainstorm-col op-brainstorm-col--done"
          data-column="done"
          aria-labelledby={`${baseId}-done`}
        >
          <details className="op-brainstorm-done">
            <summary className="op-brainstorm-col-title" id={`${baseId}-done`}>
              Done ({done.length})
            </summary>
            <CardList items={done} ideas={ideas} onAction={onAction} />
          </details>
        </section>
      </div>
    </div>
  );
};
