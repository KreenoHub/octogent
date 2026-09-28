// v3 import (D53–D57): the prompt for the headless ingest pass, the transform from Claude's
// report into a reviewable INGEST.md draft, and the kickoff brief that points the first
// interview at what's missing. Pure functions: planOps and ingest/ do the I/O.
import {
  COVERAGE_DIMENSION_LABELS,
  type CoverageDimensionId,
  type IngestCoverage,
  type IngestDraft,
  type IngestItem,
  type IngestItemKind,
  type IngestSource,
  MATURITY_LABELS,
  type Maturity,
  type PlanSnapshot,
  ingestItemKindSchema,
  maturitySchema,
} from "@octogent/octoplan-protocol";

/** What Claude passes to `plan_ingest` (loose: normalizeIngest cleans it up). */
export type IngestReport = {
  title?: string;
  why?: string;
  maturity?: string;
  maturityReasons?: string;
  sources?: Array<{ id?: string; maturity?: string; note?: string }>;
  items?: Array<{
    kind?: string;
    title?: string;
    body?: string;
    evidence?: string;
    source?: string;
    quote?: string;
    reason?: string;
    inPlan?: string;
    disagreement?: boolean;
  }>;
  coverage?: Array<{ dimension?: string; status?: string }>;
};

/** One source as the prompt shows it: an inventory listing, or the pasted text itself. */
export type PromptSource = {
  id: string;
  kind: IngestSource["kind"];
  /** Absolute path; for pasted text, where it was saved (docs/plan-relative). */
  path: string;
  main: boolean;
  /** renderInventory() output for folders and files. */
  listing?: string;
  /** Pasted text, inlined (capped). */
  text?: string;
};

const PASTE_MAX = 20_000;
const TITLE_MAX = 100;
const ITEMS_MAX = 60;

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();
const clip = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
const key = (text: string) =>
  oneLine(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const DIMENSIONS = Object.keys(COVERAGE_DIMENSION_LABELS) as CoverageDimensionId[];

const MATURITY_GUIDE = `- raw-idea: a sentence or a few lines, nothing settled
- notes: scattered thoughts with no structure
- partial-plan: some goals or decisions, with big holes
- detailed-plan: goals, decisions and scope mostly settled
- built: working code exists (with or without a plan)`;

const sourceBlock = (source: PromptSource): string => {
  const label =
    source.kind === "paste"
      ? `pasted text (saved as docs/plan/${source.path})`
      : `${source.main ? "main folder — this becomes the project" : `extra ${source.kind}`}: ${source.path}`;
  const content =
    source.kind === "paste"
      ? `<<<\n${clip(source.text ?? "", PASTE_MAX)}\n>>>`
      : `Files (kind, size, path relative to it):\n${source.listing ?? "(empty)"}`;
  return `### ${source.id} — ${label}\n${content}`;
};

export const buildIngestPrompt = (input: {
  sources: readonly PromptSource[];
  /** The plan digest (D32) when docs/plan already has content, else "". */
  digest: string;
  /** Titles from an earlier import of this repo; don't report them again. */
  previousTitles: readonly string[];
}): string => {
  const previous =
    input.previousTitles.length > 0
      ? `\n\n## Already imported earlier (don't report these again)\n${input.previousTitles.map((t) => `- ${oneLine(t)}`).join("\n")}`
      : "";
  const plan = input.digest.trim()
    ? `\n\n## Already in the plan\nIf an item you find matches one of these, still report it but set inPlan to its id (e.g. D3) or to "goal".\n\n${input.digest.trim()}`
    : "";
  return `# Octoplan import (read-only)

The user is importing existing material to plan from. Read it and report what it already settles, what it leaves open, and how far along it is. This pass is read-only: never edit files.

Read plans and docs first (README, specs, notes, anything under docs/), then manifests, and code only as far as you need to judge what's built. Folders other than the main one are readable too; use their absolute paths.

## Sources
${input.sources.map(sourceBlock).join("\n\n")}${plan}${previous}

## What to report
Call plan_ingest once with everything (a later call replaces an earlier one):
- title: a short name for the project; why: 1–2 sentences on the problem it solves.
- maturity for the whole import, and for each source (by id), from:
${MATURITY_GUIDE}
  maturityReasons: one or two sentences on why. A source's note: one line on what it is.
- items: the goals, non-goals, decisions, gaps and risks the material contains. For each:
  - evidence "found" with source (the file path) and quote (a short exact quote), when the material says it;
  - evidence "inferred" with reason (one line), when you're concluding it yourself. Never mark an inference as found.
  - Titles under 80 characters, bodies 1–3 sentences. At most ${ITEMS_MAX} items; the most important first.
- Where two sources contradict each other, report a gap titled "Sources disagree on <topic>" with disagreement true; name both sources and what each says in the body.
- Gaps are questions the material leaves open that a plan must answer (users, scope, success criteria, …).
- coverage: for each of ${DIMENSIONS.join(", ")}: unknown, partial or covered, judged only from the material.`;
};

const asMaturity = (value: string | undefined, fallback: Maturity): Maturity => {
  const parsed = maturitySchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
};

/** "D3" when that decision exists, "goal: …" for a matching goal, else undefined. */
const matchInPlan = (
  title: string,
  claimed: string | undefined,
  snapshot: PlanSnapshot | null,
): string | undefined => {
  const decisions = snapshot?.decisions ?? [];
  const claimedId = claimed?.trim().toUpperCase();
  if (claimedId && decisions.some((d) => d.id.toUpperCase() === claimedId)) return claimedId;
  const k = key(title);
  const decision = decisions.find((d) => key(d.title) === k);
  if (decision) return decision.id;
  const goal = [...(snapshot?.goal?.goals ?? []), ...(snapshot?.goal?.nonGoals ?? [])].find(
    (g) => key(g) === k,
  );
  return goal ? "goal" : undefined;
};

/**
 * Claude's report as a draft (D55/D56): ids assigned, found items start kept, inferred ones kept
 * and tentative, disagreements open, plan matches marked and not kept, earlier titles dropped.
 */
export const normalizeIngest = (input: {
  report: IngestReport;
  sources: readonly IngestSource[];
  snapshot: PlanSnapshot | null;
  previous: IngestDraft | null;
  now: string;
}): IngestDraft => {
  const { report, snapshot, previous } = input;
  const bySource = new Map((report.sources ?? []).map((s) => [s.id ?? "", s]));
  const sources = input.sources.map((source) => {
    const reported = bySource.get(source.id);
    const maturity = maturitySchema.safeParse(reported?.maturity);
    return {
      ...source,
      ...(maturity.success ? { maturity: maturity.data } : {}),
      note: oneLine(reported?.note ?? source.note),
    };
  });

  const seen = new Set((previous?.items ?? []).map((item) => key(item.title)));
  const items: IngestItem[] = [];
  for (const raw of report.items ?? []) {
    const kind = ingestItemKindSchema.safeParse(raw.kind);
    const title = clip(oneLine(raw.title ?? ""), TITLE_MAX);
    if (!kind.success || !title || seen.has(key(title))) continue;
    seen.add(key(title));
    const found = raw.evidence === "found" && Boolean(raw.source?.trim());
    const inPlan = matchInPlan(title, raw.inPlan, snapshot);
    const disagreement = raw.disagreement === true || /^sources disagree\b/i.test(title);
    const item: IngestItem = {
      id: "",
      kind: disagreement ? "gap" : (kind.data as IngestItemKind),
      title,
      body: (raw.body ?? "").trim(),
      evidence: found ? "found" : "inferred",
      ...(found && raw.source ? { source: oneLine(raw.source) } : {}),
      ...(found && raw.quote?.trim() ? { quote: clip(oneLine(raw.quote), 300) } : {}),
      ...(!found ? { reason: oneLine(raw.reason ?? raw.quote ?? "Inferred by Claude.") } : {}),
      keep: inPlan === undefined,
      tentative: !found,
      ...(inPlan ? { inPlan } : {}),
      disagreement,
      ...(disagreement ? { resolution: "open" as const } : {}),
    };
    items.push(item);
    if (items.length >= ITEMS_MAX) break;
  }
  const offset = previous?.items.length ?? 0;
  const numbered = items.map((item, i) => ({ ...item, id: `I${offset + i + 1}` }));

  const coverage: IngestCoverage[] = [];
  for (const raw of report.coverage ?? []) {
    const dimension = DIMENSIONS.find((d) => d === raw.dimension);
    const status = raw.status;
    if (!dimension || coverage.some((c) => c.dimension === dimension)) continue;
    if (status === "unknown" || status === "partial" || status === "covered") {
      coverage.push({ dimension, status });
    }
  }

  return {
    status: "draft",
    createdAt: previous?.createdAt ?? input.now,
    title: oneLine(report.title ?? previous?.title ?? ""),
    why: oneLine(report.why ?? previous?.why ?? ""),
    maturity: asMaturity(report.maturity, previous?.maturity ?? "raw-idea"),
    maturityReasons: oneLine(report.maturityReasons ?? ""),
    coverage,
    sources,
    // Re-import (D56): earlier items stay as they were; only the new ones need review.
    items: [...(previous?.items ?? []), ...numbered],
  };
};

/** What the first interview should focus on, by maturity (D57). */
export const MATURITY_FOCUS: Record<Maturity, string> = {
  "raw-idea":
    "The material is a raw idea. Run a full deep interview from the problem onward; nothing below is settled beyond what's listed.",
  notes:
    "The material is loose notes. Run a full deep interview, using the imported items as starting points to confirm.",
  "partial-plan":
    "The material is a partial plan. Ask only about the open gaps and weak dimensions below, starting with the most important.",
  "detailed-plan":
    "The material is a detailed plan. Ask only about the open gaps below; once they're answered, offer to write GOAL.md with plan_write_goal.",
  built:
    "Working code already exists. Ask what should happen next (the next goal, what's missing or broken), then about the open gaps below.",
};

/**
 * The import section of the first interview's kickoff (D57): what was imported and what's still
 * open. The plan digest (D16) above it already lists every kept decision.
 */
export const buildImportBrief = (draft: IngestDraft, snapshot: PlanSnapshot): string => {
  const sources = draft.sources
    .map(
      (s) =>
        `- ${s.id} ${s.kind}${s.main ? " (main)" : ""}: ${s.path}${s.maturity ? ` — ${MATURITY_LABELS[s.maturity]}` : ""}`,
    )
    .join("\n");
  const openGaps = snapshot.gaps.filter((g) => g.status === "open");
  const parked = snapshot.parked.filter((p) => p.status === "parked");
  const weak = snapshot.coverage.dimensions
    .filter((d) => d.status !== "covered")
    .map((d) => `${COVERAGE_DIMENSION_LABELS[d.id]} (${d.status})`);
  const gapLines =
    openGaps.length + parked.length > 0
      ? [
          ...openGaps.map((g) => `- ${g.id} — ${oneLine(g.title)}`),
          ...parked.map((p) => `- ${p.id} (parked) — ${oneLine(p.title)}`),
        ].join("\n")
      : "- (none recorded)";
  return `## Imported material
This plan was imported. Maturity: ${MATURITY_LABELS[draft.maturity]}${draft.maturityReasons ? ` — ${draft.maturityReasons}` : ""}
${sources}

${MATURITY_FOCUS[draft.maturity]}
Never re-ask a decision or goal the plan digest already lists; build on it.

### Open gaps
${gapLines}

### Weak coverage
${weak.length > 0 ? weak.map((w) => `- ${w}`).join("\n") : "- (every dimension covered)"}`;
};
