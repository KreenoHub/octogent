// D56: write the reviewed import into docs/plan. Only kept items that aren't already in the plan
// are written; inferred ones also become risks (like tentative answers); a disagreement is
// written as a decision when resolved and as a parked item when parked. GOAL.md gets the title,
// why, goals and non-goals, merged into an existing goal rather than replacing it.
import {
  type CoverageDimensionId,
  type GoalDoc,
  type IngestDraft,
  type IngestItem,
  coverageDimensionIdSchema,
  ingestItemProblem,
} from "@octogent/octoplan-protocol";
import type { PlanStore } from "../store/types";

export type ApplyIngestSummary = {
  decisions: number;
  goals: number;
  gaps: number;
  risks: number;
  parked: number;
};

const dateOf = (iso: string) => iso.slice(0, 10);

const sourceOf = (item: IngestItem, draft: IngestDraft) => {
  const main = draft.sources.find((s) => s.main)?.path;
  return `import (${item.source ?? main ?? "INGEST.md"})`;
};

const evidenceLine = (item: IngestItem) =>
  item.evidence === "found"
    ? `Imported from ${item.source ?? "the sources"}${item.quote ? `: “${item.quote}”` : "."}`
    : `Inferred on import: ${item.reason ?? "no reason given"}.`;

const bodyOf = (item: IngestItem) =>
  [item.body.trim(), evidenceLine(item)].filter((part) => part.length > 0).join("\n\n");

const mergeList = (existing: readonly string[], added: readonly string[]) => {
  const seen = new Set(existing.map((s) => s.trim().toLowerCase()));
  return [...existing, ...added.filter((s) => !seen.has(s.trim().toLowerCase()))];
};

/** The first thing that blocks apply, or null. */
export const ingestProblem = (draft: IngestDraft): string | null => {
  if (draft.status === "running") return "The import is still running.";
  if (draft.status === "applied") return "This import was already applied.";
  for (const item of draft.items) {
    const problem = ingestItemProblem(item);
    if (problem) return problem;
  }
  return null;
};

export const applyIngestToPlan = async (
  store: PlanStore,
  draft: IngestDraft,
  now: string,
): Promise<ApplyIngestSummary> => {
  const summary: ApplyIngestSummary = { decisions: 0, goals: 0, gaps: 0, risks: 0, parked: 0 };
  const kept = draft.items.filter((item) => item.keep && !item.inPlan);
  const date = dateOf(now);

  const goals = kept.filter((i) => i.kind === "goal").map((i) => i.title);
  const nonGoals = kept.filter((i) => i.kind === "non-goal").map((i) => i.title);
  const { goal: current } = await store.snapshot();
  if (current || goals.length + nonGoals.length > 0 || draft.title) {
    const next: GoalDoc = current
      ? {
          ...current,
          why: current.why.trim() ? current.why : draft.why,
          goals: mergeList(current.goals, goals),
          nonGoals: mergeList(current.nonGoals, nonGoals),
        }
      : {
          title: draft.title || "Imported plan",
          why: draft.why,
          goals,
          nonGoals,
          done: [],
        };
    await store.writeGoal(next);
    summary.goals = goals.length + nonGoals.length;
  }

  for (const item of kept) {
    const body = bodyOf(item);
    if (item.kind === "decision" || (item.disagreement && item.resolution === "resolved")) {
      await store.upsertDecision({
        title: item.title,
        body,
        source: sourceOf(item, draft),
        questionIds: [],
        dependsOn: [],
        date,
      });
      summary.decisions += 1;
    } else if (item.disagreement && item.resolution === "parked") {
      await store.park({ title: item.title, assumption: "", date, status: "parked", body });
      summary.parked += 1;
    } else if (item.kind === "gap") {
      await store.addGap({ title: item.title, status: "open", body });
      summary.gaps += 1;
    } else if (item.kind === "risk") {
      await store.addRisk({
        title: item.title,
        likelihood: "medium",
        impact: "medium",
        origin: `import ${item.id}`,
        status: "open",
        body,
      });
      summary.risks += 1;
    }
    // D56: an inferred item is an assumption until the interview confirms it.
    if (
      item.tentative &&
      ["goal", "non-goal", "decision"].includes(item.kind) &&
      !item.disagreement
    ) {
      await store.addRisk({
        title: `Assumed on import: ${item.title}`,
        likelihood: "medium",
        impact: "medium",
        origin: `import ${item.id}`,
        status: "open",
        body: evidenceLine(item),
      });
      summary.risks += 1;
    }
  }

  // Coverage only ever goes up: an import never marks a dimension less covered than it was.
  const rank = { unknown: 0, partial: 1, covered: 2 } as const;
  const { coverage } = await store.snapshot();
  for (const guess of draft.coverage) {
    const id = coverageDimensionIdSchema.safeParse(guess.dimension);
    if (!id.success) continue;
    const existing = coverage.dimensions.find((d) => d.id === (id.data as CoverageDimensionId));
    if (existing && rank[existing.status] >= rank[guess.status]) continue;
    await store.updateCoverage({
      id: id.data,
      status: guess.status,
      confidence: "low",
      questionIds: existing?.questionIds ?? [],
      note: existing?.note.trim() ? existing.note : "From the import; confirm in the interview.",
    });
  }

  await store.writeIngest({ ...draft, status: "applied", appliedAt: now });
  return summary;
};
