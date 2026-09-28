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

/** How many items apply will write (kept and not already in the plan). */
export const writeCount = (draft: IngestDraft) =>
  draft.items.filter((item) => item.keep && !item.inPlan).length;
