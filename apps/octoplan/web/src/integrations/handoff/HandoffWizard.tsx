// "Hand off to Octogent" (D44): Generate -> Review -> Apply -> Done. Everything goes through
// useOctoplan(); the server writes HANDOFF.md, so drafts come back through `plan` events.
import type { HandoffPlan, HandoffResult } from "@octogent/octoplan-protocol";
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import type { PlanJob } from "../../app/planClientReducer";
import { useOctoplan } from "../../app/useOctoplan";
import type { HandoffSlotProps } from "../../components/slots";
import { ReviewStep } from "./ReviewStep";
import { type Draft, draftProblem, fromPlan, toPlan } from "./handoffDraft";
import "./handoff.css";

/** Review edits are saved this long after the last keystroke. */
export const SAVE_DEBOUNCE_MS = 600;
/** Apply waits this long for the saved plan to come back before applying anyway. */
export const APPLY_AFTER_SAVE_MS = 3000;

type Step = 1 | 2 | 3 | 4;
const STEPS: { step: Step; label: string }[] = [
  { step: 1, label: "Generate" },
  { step: 2, label: "Review" },
  { step: 3, label: "Apply" },
  { step: 4, label: "Done" },
];

type SaveState = "idle" | "pending" | "saved" | "invalid";
/** What the wizard is waiting for; `job`/`result` are the values seen when it started. */
type Waiting =
  | { kind: "generate"; generatedAt: string | undefined; job: PlanJob | undefined }
  | {
      kind: "apply";
      plan: HandoffPlan | null | undefined;
      job: PlanJob | undefined;
      result: HandoffResult | undefined;
      sent: boolean;
    };

export const HandoffWizard = ({ repoPath, onClose }: HandoffSlotProps) => {
  const { state, sendClientEvent } = useOctoplan();
  const snapshot = state.planByRepo[repoPath];
  const serverPlan = snapshot?.handoff ?? null;
  const goal = snapshot?.goal ?? null;
  const decisions = snapshot?.decisions ?? [];
  const jobs = state.jobsByRepo[repoPath];
  const generateJob = jobs?.["handoff-generate"];
  const applyJob = jobs?.["handoff-apply"];
  const result = state.handoffResultByRepo[repoPath];

  const [step, setStep] = useState<Step>(() => (serverPlan?.status === "applied" ? 4 : 1));
  const [draft, setDraft] = useState<Draft | null>(() =>
    serverPlan ? fromPlan(serverPlan) : null,
  );
  const [heading, setHeading] = useState(() => serverPlan?.heading ?? goal?.title ?? "");
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);

  // Adopt the server's plan when it is a new generation or changed status; keep local edits
  // otherwise, so a save's echo never clobbers what is being typed.
  useEffect(() => {
    if (!serverPlan) return;
    setDraft((current) =>
      !current ||
      current.generatedAt !== serverPlan.generatedAt ||
      current.status !== serverPlan.status
        ? fromPlan(serverPlan)
        : current,
    );
  }, [serverPlan]);

  // Generate finished: a new draft arrived -> Review. Failed job -> show why.
  useEffect(() => {
    if (waiting?.kind !== "generate") return;
    if (serverPlan && serverPlan.generatedAt !== waiting.generatedAt) {
      setWaiting(null);
      setDirty(false);
      setSaveState("idle");
      setStep(2);
    } else if (generateJob !== waiting.job && generateJob?.state === "failed") {
      setWaiting(null);
      setFailure(generateJob.message);
    }
  }, [waiting, serverPlan, generateJob]);

  const save = useCallback((): boolean => {
    if (!draft) return false;
    const issue = draftProblem(draft);
    setProblem(issue);
    if (issue) {
      setSaveState("invalid");
      return false;
    }
    if (!sendClientEvent({ type: "save-handoff", repoPath, plan: toPlan(draft) })) {
      setSaveState("invalid");
      setProblem("The plan could not be sent; check the fields.");
      return false;
    }
    setDirty(false);
    setSaveState("saved");
    return true;
  }, [draft, repoPath, sendClientEvent]);

  // Debounced autosave of review edits.
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(save, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [dirty, save]);

  // Apply: wait for the saved plan to come back (or a timeout), then apply; then wait for the result.
  useEffect(() => {
    if (waiting?.kind !== "apply") return;
    if (!waiting.sent) {
      const sendApply = () => {
        sendClientEvent({ type: "apply-handoff", repoPath });
        setWaiting({ ...waiting, sent: true });
      };
      if (serverPlan !== waiting.plan) {
        sendApply();
        return;
      }
      const timer = setTimeout(sendApply, APPLY_AFTER_SAVE_MS);
      return () => clearTimeout(timer);
    }
    if (result && result !== waiting.result) {
      setWaiting(null);
      setStep(4);
    } else if (applyJob !== waiting.job && applyJob?.state === "failed") {
      setWaiting(null);
      setFailure(applyJob.message);
    }
  }, [waiting, serverPlan, result, applyJob, repoPath, sendClientEvent]);

  const goTo = (next: Step) => {
    if (dirty) save();
    setFailure(null);
    setStep(next);
  };

  const close = () => {
    if (dirty) save();
    onClose();
  };

  const generate = () => {
    const text = heading.trim();
    setFailure(null);
    if (
      sendClientEvent({ type: "generate-handoff", repoPath, ...(text ? { heading: text } : {}) })
    ) {
      setWaiting({ kind: "generate", generatedAt: serverPlan?.generatedAt, job: generateJob });
    }
  };

  const apply = () => {
    setFailure(null);
    if (!save()) return;
    setWaiting({ kind: "apply", plan: serverPlan, job: applyJob, result, sent: false });
  };

  const editDraft = (next: Draft) => {
    setDraft(next);
    setDirty(true);
    setSaveState("pending");
  };

  const reachable = (target: Step) => {
    if (target === 1) return true;
    if (target === 4) return Boolean(result) || serverPlan?.status === "applied";
    return draft !== null;
  };

  const busy = waiting !== null;

  return (
    <section className="op-hw" data-testid="handoff-wizard" aria-label="Hand off to Octogent">
      <header className="op-hw-header">
        <Stepper step={step} reachable={reachable} disabled={busy} onPick={goTo} />
        <button type="button" className="op-button op-hw-close" onClick={close}>
          Close
        </button>
      </header>

      <div className="op-hw-body">
        {step === 1 ? (
          <GenerateStep
            hasGoal={goal !== null}
            heading={heading}
            onHeading={setHeading}
            hasDraft={draft !== null}
            running={waiting?.kind === "generate"}
            jobMessage={generateJob?.state === "running" ? generateJob.message : null}
            onGenerate={generate}
            onReview={() => goTo(2)}
          />
        ) : null}

        {step === 2 && draft ? (
          <ReviewStep draft={draft} decisions={decisions} onChange={editDraft} />
        ) : null}

        {step === 3 && draft ? (
          <ApplyStep
            draft={draft}
            running={waiting?.kind === "apply"}
            jobMessage={applyJob?.state === "running" ? applyJob.message : null}
            onApply={apply}
          />
        ) : null}

        {step === 4 ? (
          <DoneStep
            plan={serverPlan}
            result={result}
            copyNote={copyNote}
            onCopy={async () => {
              const text = serverPlan?.octopusPrompt ?? "";
              try {
                if (!navigator.clipboard) throw new Error("no clipboard");
                await navigator.clipboard.writeText(text);
                setCopyNote("Copied the octopus prompt.");
              } catch {
                setCopyNote("Couldn't copy — select the prompt text and press Ctrl+C.");
              }
            }}
            onBack={() => goTo(2)}
            onRestart={() => {
              setHeading(serverPlan?.heading ?? goal?.title ?? "");
              goTo(1);
            }}
          />
        ) : null}

        {failure ? (
          <div className="op-hw-failure" role="alert">
            <p>{failure}</p>
            {step === 3 ? (
              <button type="button" className="op-button" onClick={() => goTo(2)}>
                Back to review
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {step === 2 || step === 3 ? (
        <footer className="op-hw-footer">
          <output className={`op-hw-save op-hw-save--${saveState}`}>
            {saveState === "pending"
              ? "Unsaved changes…"
              : saveState === "saved"
                ? "Saved"
                : saveState === "invalid"
                  ? (problem ?? "Can't save yet")
                  : "Saved in docs/plan/HANDOFF.md"}
          </output>
          <div className="op-hw-nav">
            <button
              type="button"
              className="op-button"
              disabled={busy}
              onClick={() => goTo((step - 1) as Step)}
            >
              Back
            </button>
            {step === 2 ? (
              <>
                <button type="button" className="op-button" onClick={save}>
                  Save
                </button>
                <button
                  type="button"
                  className="op-button op-button--primary"
                  onClick={() => goTo(3)}
                >
                  Next: Apply
                </button>
              </>
            ) : null}
          </div>
        </footer>
      ) : null}
    </section>
  );
};

const Stepper = ({
  step,
  reachable,
  disabled,
  onPick,
}: {
  step: Step;
  reachable: (step: Step) => boolean;
  disabled: boolean;
  onPick: (step: Step) => void;
}) => {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  // Left/Right move focus between the step buttons (roving, like a tab list).
  const onKeyDown = (event: KeyboardEvent<HTMLOListElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const buttons = refs.current.filter((b): b is HTMLButtonElement => b !== null && !b.disabled);
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at === -1) return;
    event.preventDefault();
    const next = (at + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };
  return (
    <ol className="op-hw-steps" aria-label="Handoff steps" onKeyDown={onKeyDown}>
      {STEPS.map(({ step: n, label }, index) => (
        <li key={n}>
          <button
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            className={`op-hw-step${n === step ? " op-hw-step--current" : ""}${n < step ? " op-hw-step--past" : ""}`}
            aria-current={n === step ? "step" : undefined}
            disabled={disabled || (n !== step && !reachable(n))}
            onClick={() => onPick(n)}
          >
            <span className="op-hw-step-n">{n}</span> {label}
          </button>
        </li>
      ))}
    </ol>
  );
};

const Spinner = ({ text }: { text: string }) => (
  <output className="op-hw-spinner">
    <span className="op-hw-spinner-glyph" aria-hidden="true" />
    {text}
  </output>
);

const GenerateStep = ({
  hasGoal,
  heading,
  onHeading,
  hasDraft,
  running,
  jobMessage,
  onGenerate,
  onReview,
}: {
  hasGoal: boolean;
  heading: string;
  onHeading: (heading: string) => void;
  hasDraft: boolean;
  running: boolean;
  jobMessage: string | null;
  onGenerate: () => void;
  onReview: () => void;
}) => (
  <div className="op-hw-generate">
    <p className="op-hw-lead">
      Claude reads the plan and the repo and proposes how to split the work into Octogent tentacles,
      each with its own folders and todos. You review everything before anything is written to
      Octogent.
    </p>
    {hasGoal ? null : (
      <p className="op-hw-failure" role="alert">
        There's no GOAL.md yet. Finish a deep interview to write it, then hand off.
      </p>
    )}
    <label className="op-field">
      <span>Todo heading (each todo.md gets a “## heading” section)</span>
      <input
        value={heading}
        disabled={!hasGoal || running}
        onChange={(event) => onHeading(event.target.value)}
      />
    </label>
    {running ? <Spinner text={jobMessage ?? "Starting…"} /> : null}
    <div className="op-form-actions">
      {hasDraft ? (
        <>
          <button type="button" className="op-button" disabled={running} onClick={onReview}>
            Review existing draft
          </button>
          <button
            type="button"
            className="op-button op-button--primary"
            disabled={!hasGoal || running}
            onClick={onGenerate}
          >
            Regenerate
          </button>
        </>
      ) : (
        <button
          type="button"
          className="op-button op-button--primary"
          disabled={!hasGoal || running}
          onClick={onGenerate}
        >
          Generate plan
        </button>
      )}
    </div>
  </div>
);

const ApplyStep = ({
  draft,
  running,
  jobMessage,
  onApply,
}: {
  draft: Draft;
  running: boolean;
  jobMessage: string | null;
  onApply: () => void;
}) => {
  const reused = draft.tentacles.filter((t) => t.existing).length;
  const todos = draft.tentacles.reduce((sum, t) => sum + t.todos.length, 0);
  return (
    <div className="op-hw-apply">
      <dl className="op-hw-summary">
        <dt>Tentacles</dt>
        <dd>
          {draft.tentacles.length} ({draft.tentacles.length - reused} new / {reused} reused)
        </dd>
        <dt>Todos</dt>
        <dd>{todos}</dd>
        <dt>Workspace</dt>
        <dd>
          <code>{draft.workspace}</code>
        </dd>
        <dt>Heading</dt>
        <dd>## {draft.heading}</dd>
      </dl>
      <p className="op-hw-lead">
        Apply creates the missing tentacles, updates their CONTEXT.md and adds the todos. Todos
        already there are skipped, and your own notes are left alone.
      </p>
      {running ? <Spinner text={jobMessage ?? "Saving the plan…"} /> : null}
      <div className="op-form-actions">
        <button
          type="button"
          className="op-button op-button--primary"
          disabled={running}
          onClick={onApply}
        >
          Apply to Octogent
        </button>
      </div>
    </div>
  );
};

const DoneStep = ({
  plan,
  result,
  copyNote,
  onCopy,
  onBack,
  onRestart,
}: {
  plan: HandoffPlan | null;
  result: HandoffResult | undefined;
  copyNote: string | null;
  onCopy: () => void;
  onBack: () => void;
  onRestart: () => void;
}) => (
  <div className="op-hw-done">
    {result ? (
      <>
        <p className={`op-export-result op-export-result--${result.ok ? "ok" : "fail"}`}>
          {result.message}
        </p>
        <ul className="op-hw-results" aria-label="Tentacle results">
          {result.tentacles.map((t) => (
            <li key={t.tentacleId} className={`op-hw-result op-hw-result--${t.ok ? "ok" : "fail"}`}>
              <code>{t.tentacleId}</code>
              <span className="op-badge">{t.created ? "created" : "reused"}</span>
              <span>
                {t.added} added, {t.skipped} skipped
              </span>
              <span className="op-hw-result-msg">
                {t.ok ? "ok" : "error"}
                {t.message ? `: ${t.message}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </>
    ) : plan?.status === "applied" ? (
      <p className="op-hw-lead">
        This plan was applied to <code>{plan.workspace}</code>
        {plan.appliedAt ? ` on ${plan.appliedAt.slice(0, 10)}` : ""}.
      </p>
    ) : null}

    {result && !result.ok ? (
      <button type="button" className="op-button" onClick={onBack}>
        Back to review
      </button>
    ) : null}

    {result?.deckUrl ? (
      <a
        className="op-button op-button--primary op-hw-deck"
        href={result.deckUrl}
        target="_blank"
        rel="noreferrer"
      >
        Open Octogent
      </a>
    ) : null}

    {plan?.octopusPrompt ? (
      <div className="op-hw-octopus">
        <div className="op-hw-octopus-head">
          <h3 className="op-hw-label">Octopus prompt</h3>
          <button type="button" className="op-button" onClick={onCopy}>
            Copy octopus prompt
          </button>
        </div>
        <pre className="op-hw-prompt" aria-label="Octopus prompt">
          {plan.octopusPrompt}
        </pre>
        {copyNote ? <output className="op-hw-copy-note">{copyNote}</output> : null}
        <p className="op-dialog-hint">
          Also saved as docs/plan/OCTOPUS.md. Paste it into the coordinating Claude session.
        </p>
      </div>
    ) : null}

    <div className="op-form-actions">
      <button type="button" className="op-button" onClick={onRestart}>
        Start a new handoff
      </button>
    </div>
  </div>
);
