// Pure helpers for the import review (D56).
import {
  type IngestDraft,
  type IngestItem,
  type IngestItemKind,
  ingestItemProblem,
} from "@octogent/octoplan-protocol";

export const KIND_ORDER: IngestItemKind[] = ["goal", "non-goal", "decision", "gap", "risk"];

export const KIND_LABELS: Record<IngestItemKind, string> = {
  goal: "Goals",
  "non-goal": "Non-goals",
  decision: "Decisions",
  gap: "Gaps",
  risk: "Risks",
};

export const updateItem = (
  draft: IngestDraft,
  id: string,
  patch: Partial<Omit<IngestItem, "id">>,
): IngestDraft => ({
  ...draft,
  items: draft.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
});

export const itemsByKind = (draft: IngestDraft) =>
  KIND_ORDER.map((kind) => ({
    kind,
    items: draft.items.filter((item) => item.kind === kind),
  })).filter((group) => group.items.length > 0);

/** The first thing blocking apply (an open disagreement, an empty title), or null. */
export const reviewProblem = (draft: IngestDraft): string | null => {
  for (const item of draft.items) {
    if (item.keep && !item.title.trim()) return `${item.id} needs a title.`;
    const problem = ingestItemProblem(item);
    if (problem) return problem;
  }
  return null;
};

/** Kept disagreements nobody has resolved or parked yet; each one blocks apply. */
export const openDisagreements = (draft: IngestDraft): IngestItem[] =>
  draft.items.filter((item) => ingestItemProblem(item) !== null);

/** The item behind reviewProblem, so the footer can jump to it; null when nothing blocks. */
export const blockingItemId = (draft: IngestDraft): string | null =>
  draft.items.find((item) => (item.keep && !item.title.trim()) || ingestItemProblem(item))?.id ??
  null;

/** Parks every open disagreement: each becomes a question in the interview. */
export const parkOpenDisagreements = (draft: IngestDraft): IngestDraft => ({
  ...draft,
  items: draft.items.map((item) =>
    ingestItemProblem(item) ? { ...item, resolution: "parked" as const } : item,
  ),
});

/** How many items apply will write (kept and not already in the plan). */
export const writeCount = (draft: IngestDraft) =>
  draft.items.filter((item) => item.keep && !item.inPlan).length;
