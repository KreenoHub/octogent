import { type FormEvent, useEffect, useRef, useState } from "react";
import { parseTags } from "../app/planActions";
import { repoName } from "../app/sessionView";
import { useOctoplan } from "../app/useOctoplan";
import { ModalFrame } from "./ModalFrame";

/** I: capture an idea into the active repo's IDEAS.md. Enter saves, Esc closes. */
export const IdeaCaptureDialog = ({ onClose }: { onClose: () => void }) => {
  const { activeRepo, sendClientEvent } = useOctoplan();
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!activeRepo) {
      setError("Start or pick a session first: ideas go into its repo");
      return;
    }
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Give the idea a title");
      titleRef.current?.focus();
      return;
    }
    const tagList = parseTags(tags);
    const sent = sendClientEvent({
      type: "capture-idea",
      repoPath: activeRepo,
      title: trimmed,
      ...(tagList.length > 0 ? { tags: tagList } : {}),
    });
    if (sent) onClose();
  };

  return (
    <ModalFrame title="Capture idea">
      <form className="op-form" onSubmit={submit} noValidate>
        <p className="op-dialog-hint">
          {activeRepo ? `Into ${repoName(activeRepo)} · IDEAS.md` : "No active repo"}
        </p>
        <label className="op-field">
          <span>Idea</span>
          <input
            ref={titleRef}
            value={title}
            placeholder="What if…"
            aria-invalid={error ? "true" : undefined}
            onChange={(event) => {
              setTitle(event.target.value);
              setError(null);
            }}
          />
        </label>
        <label className="op-field">
          <span>Tags (comma-separated)</span>
          <input
            value={tags}
            placeholder="ux, later"
            onChange={(event) => setTags(event.target.value)}
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
            Save idea
          </button>
        </div>
      </form>
    </ModalFrame>
  );
};
