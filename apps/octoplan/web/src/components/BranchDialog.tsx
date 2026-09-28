import { type FormEvent, useEffect, useRef, useState } from "react";
import { useOctoplan } from "../app/useOctoplan";
import { ModalFrame } from "./ModalFrame";

/** B: fork the active session to explore an alternative under a new title. */
export const BranchDialog = ({ onClose }: { onClose: () => void }) => {
  const { activeSession, sendClientEvent } = useOctoplan();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!activeSession) {
      setError("Pick a session to branch from");
      return;
    }
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Name the branch");
      titleRef.current?.focus();
      return;
    }
    if (sendClientEvent({ type: "branch-session", sessionId: activeSession.id, title: trimmed })) {
      onClose();
    }
  };

  return (
    <ModalFrame title="Branch conversation">
      <form className="op-form" onSubmit={submit} noValidate>
        <p className="op-dialog-hint">
          {activeSession ? `From “${activeSession.title || "Untitled"}”` : "No active session"}
        </p>
        <label className="op-field">
          <span>Branch title</span>
          <input
            ref={titleRef}
            value={title}
            placeholder="What if we used SQLite instead?"
            aria-invalid={error ? "true" : undefined}
            onChange={(event) => {
              setTitle(event.target.value);
              setError(null);
            }}
          />
        </label>
        {error ? (
          <p className="op-field-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="op-form-actions">
          <button type="button" className="op-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="op-button op-button--primary">
            Branch
          </button>
        </div>
      </form>
    </ModalFrame>
  );
};
