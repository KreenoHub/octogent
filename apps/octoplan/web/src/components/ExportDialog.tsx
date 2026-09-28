import { type FormEvent, useEffect, useRef, useState } from "react";
import { defaultTentacleId, parseTasks, tasksFromGoal, tentacleIdError } from "../app/planActions";
import { useOctoplan } from "../app/useOctoplan";
import { ModalFrame } from "./ModalFrame";

/** "Export to Octogent": a tentacle id plus one task per line, prefilled from GOAL.md's DoD. */
export const ExportDialog = ({ repoPath, onClose }: { repoPath: string; onClose: () => void }) => {
  const { planByRepo, exportResults, sendClientEvent } = useOctoplan();
  const [tentacleId, setTentacleId] = useState(() => defaultTentacleId(repoPath));
  const [tasks, setTasks] = useState(() => tasksFromGoal(planByRepo[repoPath]?.goal));
  const [error, setError] = useState<string | null>(null);
  // Only results that arrive after this submit count; older ones belong to earlier exports.
  const [submitted, setSubmitted] = useState<{ afterSeq: number; tentacleId: string } | null>(null);
  const idRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    idRef.current?.focus();
  }, []);

  const result = submitted
    ? exportResults.find(
        (r) =>
          r.seq > submitted.afterSeq &&
          r.repoPath === repoPath &&
          r.tentacleId === submitted.tentacleId,
      )
    : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const id = tentacleId.trim();
    const idError = tentacleIdError(id);
    if (idError) {
      setError(idError);
      idRef.current?.focus();
      return;
    }
    const taskList = parseTasks(tasks);
    if (taskList.length === 0) {
      setError("Add at least one task, one per line");
      return;
    }
    const afterSeq = exportResults.at(-1)?.seq ?? 0;
    if (sendClientEvent({ type: "export-tentacle", repoPath, tentacleId: id, tasks: taskList })) {
      setSubmitted({ afterSeq, tentacleId: id });
    }
  };

  return (
    <ModalFrame title="Export to Octogent" className="op-dialog--wide">
      <form className="op-form" onSubmit={submit} noValidate>
        <label className="op-field">
          <span>Tentacle id</span>
          <input
            ref={idRef}
            value={tentacleId}
            spellCheck={false}
            aria-invalid={error && tentacleIdError(tentacleId.trim()) ? "true" : undefined}
            onChange={(event) => {
              setTentacleId(event.target.value);
              setError(null);
            }}
          />
        </label>
        <label className="op-field">
          <span>Tasks (one per line)</span>
          <textarea
            className="op-field-textarea"
            rows={8}
            value={tasks}
            placeholder="Each task runnable by one agent, ending in “Done when …”"
            onChange={(event) => {
              setTasks(event.target.value);
              setError(null);
            }}
          />
        </label>
        {error ? (
          <p className="op-field-error" role="alert">
            {error}
          </p>
        ) : null}
        {submitted ? (
          <output
            className={`op-export-result op-export-result--${result ? (result.ok ? "ok" : "fail") : "wait"}`}
          >
            {result
              ? `${result.ok ? "Exported" : "Export failed"}: ${result.message}`
              : `Exporting to ${submitted.tentacleId}…`}
          </output>
        ) : null}
        <div className="op-form-actions">
          <button type="button" className="op-button" onClick={onClose}>
            {result ? "Close" : "Cancel"}
          </button>
          <button
            type="submit"
            className="op-button op-button--primary"
            disabled={submitted !== null && !result}
          >
            Export
          </button>
        </div>
      </form>
    </ModalFrame>
  );
};
