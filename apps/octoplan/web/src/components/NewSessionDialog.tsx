import { type ModeId, modeIdSchema } from "@octogent/octoplan-protocol";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { MODE_LABELS, normalizeRepoPath } from "../app/sessionView";
import { useOctoplan } from "../app/useOctoplan";

export const NewSessionDialog = ({ onClose }: { onClose: () => void }) => {
  const { sendClientEvent } = useOctoplan();
  const [repoPath, setRepoPath] = useState("");
  const [mode, setMode] = useState<ModeId>("deep-interview");
  const [topic, setTopic] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pathRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const errorId = useId();

  useEffect(() => {
    pathRef.current?.focus();
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const path = normalizeRepoPath(repoPath);
    if (!path) {
      setError("Repo folder path is required");
      pathRef.current?.focus();
      return;
    }
    if (sendClientEvent({ type: "start-session", repoPath: path, mode, topic: topic.trim() })) {
      onClose();
    }
  };

  return (
    <div className="op-backdrop">
      <dialog open className="op-dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId} className="op-dialog-title">
          New session
        </h2>
        <form className="op-form" onSubmit={submit} noValidate>
          <label className="op-field">
            <span>Repo folder</span>
            <input
              ref={pathRef}
              value={repoPath}
              placeholder="C:\Users\you\Projects\my-app"
              spellCheck={false}
              aria-invalid={error ? "true" : undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => {
                setRepoPath(event.target.value);
                setError(null);
              }}
            />
          </label>
          {error ? (
            <p id={errorId} className="op-field-error" role="alert">
              {error}
            </p>
          ) : null}
          <label className="op-field">
            <span>Mode</span>
            <select value={mode} onChange={(event) => setMode(event.target.value as ModeId)}>
              {modeIdSchema.options.map((id) => (
                <option key={id} value={id}>
                  {MODE_LABELS[id]}
                </option>
              ))}
            </select>
          </label>
          <label className="op-field">
            <span>Topic</span>
            <input
              value={topic}
              placeholder="What are we planning?"
              onChange={(event) => setTopic(event.target.value)}
            />
          </label>
          <div className="op-form-actions">
            <button type="button" className="op-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="op-button op-button--primary">
              Start
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
};
