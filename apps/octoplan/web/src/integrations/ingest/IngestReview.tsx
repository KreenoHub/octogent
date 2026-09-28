// D56 "What I understood": the import draft (docs/plan/INGEST.md) for the user to keep, edit or
// drop item by item before anything reaches the plan. Edits autosave; Apply sends the draft as
// shown, and the server writes the plan and starts the gap-focused interview (D57).
import { type IngestDraft, type IngestItem, MATURITY_LABELS } from "@octogent/octoplan-protocol";
import { useCallback, useEffect, useState } from "react";
import { useOctoplan } from "../../app/useOctoplan";
import { KIND_LABELS, itemsByKind, reviewProblem, updateItem, writeCount } from "./ingestDraft";
import "./ingest.css";

/** Review edits are saved this long after the last keystroke. */
export const INGEST_SAVE_DEBOUNCE_MS = 600;

export const IngestReview = ({ repoPath, onClose }: { repoPath: string; onClose: () => void }) => {
  const { state, sendClientEvent } = useOctoplan();
  const server = state.planByRepo[repoPath]?.ingest ?? null;
  const jobs = state.jobsByRepo[repoPath];
  const ingestJob = jobs?.ingest;
  const applyJob = jobs?.["ingest-apply"];
  const [draft, setDraft] = useState<IngestDraft | null>(() =>
    server?.status === "draft" ? server : null,
  );
  const [dirty, setDirty] = useState(false);
  const [applying, setApplying] = useState(false);

  // Adopt the server's draft when a (re-)import lands; keep local edits otherwise.
  useEffect(() => {
    if (server?.status !== "draft") return;
    setDraft((current) =>
      !current || current.items.length !== server.items.length || !dirty ? server : current,
    );
  }, [server, dirty]);

  useEffect(() => {
    if (applying && applyJob?.state === "failed") setApplying(false);
  }, [applying, applyJob]);

  const save = useCallback(() => {
    if (!draft) return;
    sendClientEvent({ type: "save-ingest", repoPath, draft });
    setDirty(false);
  }, [draft, repoPath, sendClientEvent]);

  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(save, INGEST_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [dirty, save]);

  const edit = (next: IngestDraft) => {
    setDraft(next);
    setDirty(true);
  };

  if (server?.status === "running" || (!draft && ingestJob?.state === "running")) {
    return (
      <div className="op-ig op-ig--running" data-testid="ingest-review">
        <output className="op-hw-spinner">
          <span className="op-hw-spinner-glyph" aria-hidden="true" />
          {ingestJob?.state === "running" ? ingestJob.message : "Claude is reading the import…"}
        </output>
        <p className="op-dialog-hint">
          This is a read-only pass; it can take a minute or two for a big folder. You can close this
          and come back: the draft is saved in docs/plan/INGEST.md.
        </p>
        <div className="op-form-actions">
          <button type="button" className="op-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="op-ig" data-testid="ingest-review">
        {ingestJob?.state === "failed" ? (
          <p className="op-hw-failure" role="alert">
            {ingestJob.message}
          </p>
        ) : (
          <p className="op-hw-lead">
            {server?.status === "applied"
              ? `This import was applied${server.appliedAt ? ` on ${server.appliedAt.slice(0, 10)}` : ""}.`
              : "There's no import for this project yet."}
          </p>
        )}
        <div className="op-form-actions">
          <button type="button" className="op-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    );
  }

  const problem = reviewProblem(draft);
  const count = writeCount(draft);
  const apply = () => {
    if (problem) return;
    if (sendClientEvent({ type: "apply-ingest", repoPath, draft })) {
      setDirty(false);
      setApplying(true);
    }
  };

  return (
    <div className="op-ig" data-testid="ingest-review">
      <header className="op-ig-head">
        <span className={`op-ig-maturity op-ig-maturity--${draft.maturity}`}>
          {MATURITY_LABELS[draft.maturity]}
        </span>
        <p className="op-ig-reasons">{draft.maturityReasons}</p>
      </header>

      <div className="op-ig-body">
        <label className="op-field">
          <span>Plan title</span>
          <input value={draft.title} onChange={(e) => edit({ ...draft, title: e.target.value })} />
        </label>
        <label className="op-field">
          <span>Why</span>
          <textarea
            className="op-ig-text"
            rows={2}
            value={draft.why}
            onChange={(e) => edit({ ...draft, why: e.target.value })}
          />
        </label>

        <section aria-label="Sources">
          <h3 className="op-hw-label">Sources</h3>
          <ul className="op-ig-sources">
            {draft.sources.map((source) => (
              <li key={source.id}>
                <code>{source.path}</code>
                <span className="op-badge">
                  {source.kind}
                  {source.main ? " · main" : ""}
                </span>
                {source.maturity ? (
                  <span className="op-badge">{MATURITY_LABELS[source.maturity]}</span>
                ) : null}
                {source.note ? <span className="op-ig-note">{source.note}</span> : null}
                {source.skipped.length > 0 ? (
                  <span className="op-ig-skipped">
                    Not read: {source.skipped.join(", ")}. Paste their text in another import if
                    they matter.
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        {draft.items.length === 0 ? (
          <p className="op-hw-lead">
            Claude found nothing settled yet; the interview starts fresh.
          </p>
        ) : null}
        {itemsByKind(draft).map(({ kind, items }) => (
          <section key={kind} aria-label={KIND_LABELS[kind]} className="op-ig-group">
            <h3 className="op-hw-label">
              {KIND_LABELS[kind]} ({items.filter((i) => i.keep).length}/{items.length} kept)
            </h3>
            {items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onChange={(patch) => edit(updateItem(draft, item.id, patch))}
              />
            ))}
          </section>
        ))}
      </div>

      <footer className="op-ig-foot">
        <output className={problem ? "op-ig-problem" : "op-ig-status"}>
          {problem ?? (dirty ? "Unsaved changes…" : "Saved in docs/plan/INGEST.md")}
        </output>
        {applying ? (
          <output className="op-hw-spinner">
            <span className="op-hw-spinner-glyph" aria-hidden="true" />
            {applyJob?.state === "running" ? applyJob.message : "Applying…"}
          </output>
        ) : null}
        <div className="op-form-actions">
          <button type="button" className="op-button" onClick={onClose}>
            Later
          </button>
          <button
            type="button"
            className="op-button op-button--primary"
            disabled={problem !== null || applying}
            onClick={apply}
          >
            Apply {count} item{count === 1 ? "" : "s"} and start the interview
          </button>
        </div>
      </footer>
    </div>
  );
};

const ItemRow = ({
  item,
  onChange,
}: {
  item: IngestItem;
  onChange: (patch: Partial<Omit<IngestItem, "id">>) => void;
}) => (
  <article
    className={`op-ig-item${item.keep ? "" : " op-ig-item--dropped"}`}
    aria-label={`${item.id} ${item.title}`}
  >
    <div className="op-ig-item-head">
      <label className="op-ig-keep">
        <input
          type="checkbox"
          checked={item.keep}
          disabled={Boolean(item.inPlan)}
          onChange={(e) => onChange({ keep: e.target.checked })}
        />
        Keep
      </label>
      <input
        className="op-ig-title"
        aria-label={`${item.id} title`}
        value={item.title}
        onChange={(e) => onChange({ title: e.target.value })}
      />
      {item.inPlan ? <span className="op-badge">already in plan ({item.inPlan})</span> : null}
      {item.tentative ? <span className="op-badge op-ig-tentative">assumption</span> : null}
    </div>
    <textarea
      className="op-ig-text"
      aria-label={`${item.id} details`}
      rows={2}
      value={item.body}
      onChange={(e) => onChange({ body: e.target.value })}
    />
    <p className="op-ig-evidence">
      {item.evidence === "found" ? (
        <>
          Found in <code>{item.source}</code>
          {item.quote ? <q>{item.quote}</q> : null}
        </>
      ) : (
        <>Inferred: {item.reason}</>
      )}
    </p>
    {item.disagreement && item.keep ? (
      <label className="op-field op-ig-resolution">
        <span>The sources disagree. Settle it before applying:</span>
        <select
          value={item.resolution ?? "open"}
          onChange={(e) =>
            onChange({ resolution: e.target.value as NonNullable<IngestItem["resolution"]> })
          }
        >
          <option value="open">Open: decide now</option>
          <option value="resolved">
            Resolved: edit the details to the answer (becomes a decision)
          </option>
          <option value="parked">Parked: ask me in the interview</option>
        </select>
      </label>
    ) : null}
  </article>
);
