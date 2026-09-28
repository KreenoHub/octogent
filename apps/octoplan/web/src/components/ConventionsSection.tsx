import { type FormEvent, useState } from "react";
import { useOctoplan } from "../app/useOctoplan";

/** D28: cross-repo personal conventions (~/.octoplan/CONVENTIONS.md), listed with add/remove. */
export const ConventionsSection = () => {
  const { conventions, sendClientEvent } = useOctoplan();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const add = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    if (sendClientEvent({ type: "add-convention", title: trimmed, body: body.trim() })) {
      setTitle("");
      setBody("");
    }
  };

  return (
    <section className="op-conventions" aria-label="Conventions">
      <button
        type="button"
        className="op-board-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>Conventions</span>
        {conventions.length > 0 ? <span className="op-count">{conventions.length}</span> : null}
      </button>
      {open ? (
        <div className="op-conventions-body">
          {conventions.length === 0 ? (
            <p className="op-empty op-board-empty">No conventions yet.</p>
          ) : (
            <ul className="op-board-records">
              {conventions.map((convention) => (
                <li key={convention.id} className="op-record" title={convention.body}>
                  <span className="op-record-id">{convention.id}</span>
                  <span className="op-record-title">{convention.title}</span>
                  <button
                    type="button"
                    className="op-pinned-unpin"
                    aria-label={`Remove ${convention.id}`}
                    onClick={() =>
                      sendClientEvent({ type: "remove-convention", conventionId: convention.id })
                    }
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form className="op-conventions-form" onSubmit={add}>
            <input
              className="op-idea-search-input"
              aria-label="Convention title"
              placeholder="New convention"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <textarea
              className="op-idea-search-input op-conventions-body-input"
              aria-label="Convention body"
              placeholder="Why / how (optional)"
              rows={2}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
            <button type="submit" className="op-card-action" disabled={!title.trim()}>
              Add convention
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
};
