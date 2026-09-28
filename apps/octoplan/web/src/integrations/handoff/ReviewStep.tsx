// Step 2 of the handoff wizard (D44): the draft's tentacles as editable cards.
import type { Decision } from "@octogent/octoplan-protocol";
import { useState } from "react";
import {
  type Draft,
  type DraftTentacle,
  addOwn,
  addTentacle,
  addTodo,
  deleteTodo,
  groupByWave,
  idError,
  moveTodo,
  removeOwn,
  removeTentacle,
  slugify,
  updateTentacle,
  updateTodo,
} from "./handoffDraft";

type ReviewStepProps = {
  draft: Draft;
  decisions: readonly Decision[];
  onChange: (draft: Draft) => void;
};

export const ReviewStep = ({ draft, decisions, onChange }: ReviewStepProps) => (
  <div className="op-hw-review">
    <div className="op-hw-meta">
      <label className="op-field">
        <span>Todo heading</span>
        <input
          value={draft.heading}
          aria-invalid={draft.heading.trim() ? undefined : "true"}
          onChange={(event) => onChange({ ...draft, heading: event.target.value })}
        />
      </label>
      <p className="op-hw-workspace">
        Octogent workspace <code>{draft.workspace}</code>
        {draft.source === "fallback" ? (
          <span className="op-badge op-hw-badge--warn">fallback split</span>
        ) : null}
      </p>
    </div>
    <ul className="op-hw-tentacles" aria-label="Tentacles">
      {draft.tentacles.map((tentacle) => (
        <TentacleCard
          key={tentacle.key}
          tentacle={tentacle}
          draft={draft}
          decisions={decisions}
          onChange={onChange}
        />
      ))}
    </ul>
    <button type="button" className="op-button" onClick={() => onChange(addTentacle(draft))}>
      + Add tentacle
    </button>
  </div>
);

const TentacleCard = ({
  tentacle,
  draft,
  decisions,
  onChange,
}: {
  tentacle: DraftTentacle;
  draft: Draft;
  decisions: readonly Decision[];
  onChange: (draft: Draft) => void;
}) => {
  const [folder, setFolder] = useState("");
  const [shownDecision, setShownDecision] = useState<{ todo: string; id: string } | null>(null);
  const error = idError(tentacle.id, draft, tentacle.key);
  const others = draft.tentacles.filter((t) => t.key !== tentacle.key);
  const label = tentacle.name || tentacle.id;

  const commitFolder = () => {
    onChange(addOwn(draft, tentacle.key, folder));
    setFolder("");
  };

  return (
    <li className="op-hw-card" data-testid={`hw-tentacle-${tentacle.key}`} aria-label={label}>
      <div className="op-hw-card-head">
        <span className={`op-badge ${tentacle.existing ? "op-badge--active" : "op-hw-badge--new"}`}>
          {tentacle.existing ? "existing" : "new"}
        </span>
        <label className="op-field op-hw-grow">
          <span>Name</span>
          <input
            value={tentacle.name}
            aria-invalid={tentacle.name.trim() ? undefined : "true"}
            onChange={(event) =>
              onChange(updateTentacle(draft, tentacle.key, { name: event.target.value }))
            }
          />
        </label>
        <label className="op-field">
          <span>Id</span>
          <input
            value={tentacle.id}
            spellCheck={false}
            aria-invalid={error ? "true" : undefined}
            onChange={(event) =>
              onChange(updateTentacle(draft, tentacle.key, { id: event.target.value }))
            }
            onBlur={() => {
              if (!tentacle.id.trim())
                onChange(updateTentacle(draft, tentacle.key, { id: slugify(tentacle.name) }));
            }}
          />
        </label>
        <button
          type="button"
          className="op-button op-hw-remove"
          aria-label={`Remove tentacle ${label}`}
          onClick={() => onChange(removeTentacle(draft, tentacle.key))}
        >
          Remove
        </button>
      </div>
      {error ? (
        <p className="op-field-error" role="alert">
          {error}
        </p>
      ) : null}
      <label className="op-field">
        <span>Description</span>
        <textarea
          className="op-field-textarea"
          rows={2}
          value={tentacle.description}
          onChange={(event) =>
            onChange(updateTentacle(draft, tentacle.key, { description: event.target.value }))
          }
        />
      </label>
      <div className="op-hw-owns">
        <span className="op-hw-label">Owns</span>
        {tentacle.owns.map((own) => (
          <span key={own} className="op-hw-chip">
            <code>{own}</code>
            <button
              type="button"
              className="op-hw-chip-x"
              aria-label={`Remove folder ${own}`}
              onClick={() => onChange(removeOwn(draft, tentacle.key, own))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="op-hw-own-input"
          value={folder}
          placeholder="add folder…"
          aria-label={`Add folder to ${label}`}
          onChange={(event) => setFolder(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitFolder();
            }
          }}
        />
        <button
          type="button"
          className="op-button op-hw-small"
          disabled={!folder.trim()}
          onClick={commitFolder}
        >
          Add
        </button>
      </div>
      {groupByWave(tentacle.todos).map((group) => (
        <section key={group.wave || "-"} className="op-hw-wave">
          <h4 className="op-hw-wave-title">{group.wave || "Todos"}</h4>
          <ol className="op-hw-todos">
            {group.todos.map((todo) => (
              <li key={todo.key} className="op-hw-todo">
                <textarea
                  className="op-field-textarea op-hw-todo-text"
                  rows={2}
                  value={todo.text}
                  aria-label="Todo text"
                  aria-invalid={todo.text.trim() ? undefined : "true"}
                  placeholder="One agent-sized task… Done when …"
                  onChange={(event) =>
                    onChange(updateTodo(draft, tentacle.key, todo.key, event.target.value))
                  }
                />
                <div className="op-hw-todo-bar">
                  {todo.decisionIds.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className="op-hw-did"
                      aria-pressed={shownDecision?.todo === todo.key && shownDecision.id === id}
                      onClick={() =>
                        setShownDecision((shown) =>
                          shown?.todo === todo.key && shown.id === id
                            ? null
                            : { todo: todo.key, id },
                        )
                      }
                    >
                      {id}
                    </button>
                  ))}
                  <select
                    className="op-hw-move"
                    aria-label="Move todo to tentacle"
                    value=""
                    disabled={others.length === 0}
                    onChange={(event) => {
                      if (event.target.value)
                        onChange(moveTodo(draft, tentacle.key, todo.key, event.target.value));
                    }}
                  >
                    <option value="">Move to…</option>
                    {others.map((other) => (
                      <option key={other.key} value={other.key}>
                        {other.name || other.id}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="op-button op-hw-small"
                    aria-label="Delete todo"
                    onClick={() => onChange(deleteTodo(draft, tentacle.key, todo.key))}
                  >
                    Delete
                  </button>
                </div>
                {shownDecision?.todo === todo.key ? (
                  <output className="op-hw-decision">
                    {shownDecision.id}:{" "}
                    {decisions.find((d) => d.id === shownDecision.id)?.title ??
                      "not in DECISIONS.md"}
                  </output>
                ) : null}
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="op-button op-hw-small"
            onClick={() => onChange(addTodo(draft, tentacle.key, group.wave))}
          >
            + Add todo{group.wave ? ` to ${group.wave}` : ""}
          </button>
        </section>
      ))}
      {tentacle.todos.length === 0 ? (
        <button
          type="button"
          className="op-button op-hw-small"
          onClick={() => onChange(addTodo(draft, tentacle.key, ""))}
        >
          + Add todo
        </button>
      ) : null}
    </li>
  );
};
