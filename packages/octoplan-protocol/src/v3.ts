import { z } from "zod";

// ---------- Wave 6: Run Octogent (D58–D61) ----------

/**
 * Where Octogent stands for a repo's workspace (D48):
 * - not-initialized: no `.octogent/project.json` yet (launch runs `octogent init` first, D60)
 * - not-running: initialized, but no live runtime.json (never started, or it exited)
 * - starting: Octoplan opened a terminal and is waiting for runtime.json to appear
 * - running: runtime.json names a live process and its API answers
 * - not-responding: runtime.json names a live process, but its API doesn't answer
 */
export const octogentRunStateSchema = z.enum([
  "not-initialized",
  "not-running",
  "starting",
  "running",
  "not-responding",
]);
export type OctogentRunState = z.infer<typeof octogentRunStateSchema>;

export const octogentStatusSchema = z.object({
  /** The repo the client asked about (echoed back, so the UI can key by it). */
  repoPath: z.string(),
  /** The checkout Octogent runs in (D48). */
  workspace: z.string(),
  state: octogentRunStateSchema,
  /** Octogent's dashboard, from runtime.json's apiBaseUrl (D61). */
  url: z.string().optional(),
  port: z.number().int().optional(),
  /** False when `octogent` isn't on PATH; the UI shows how to install it instead of launching. */
  cliAvailable: z.boolean(),
  /** One line for the user: what's going on, or what went wrong. */
  message: z.string(),
  /** Shown with a copy button when Octoplan couldn't open a terminal itself (D59). */
  manualCommand: z.string().optional(),
});
export type OctogentStatus = z.infer<typeof octogentStatusSchema>;

// ---------- Wave 7: entry paths and import (D50–D57) ----------

/** How far along imported material is (D54); decides where the user lands (D57). */
export const maturitySchema = z.enum(["raw-idea", "notes", "partial-plan", "detailed-plan", "built"]);
export type Maturity = z.infer<typeof maturitySchema>;

export const MATURITY_LABELS: Record<Maturity, string> = {
  "raw-idea": "Raw idea",
  notes: "Notes",
  "partial-plan": "Partial plan",
  "detailed-plan": "Detailed plan",
  built: "Built",
};

/** One thing the user pointed the import at (D52). Pasted text lives in docs/plan/sources/. */
export const ingestSourceSchema = z.object({
  /** S1, S2, … */
  id: z.string(),
  /** Absolute path; for pasted text, the docs/plan-relative file it was saved to. */
  path: z.string(),
  kind: z.enum(["folder", "file", "paste"]),
  /** The main folder becomes the project. */
  main: z.boolean(),
  maturity: maturitySchema.optional(),
  /** Claude's one line on what this source is. */
  note: z.string(),
  /** Files listed but not read (.docx, images; G4), so the user can paste their text. */
  skipped: z.array(z.string()),
});
export type IngestSource = z.infer<typeof ingestSourceSchema>;

export const ingestItemKindSchema = z.enum(["goal", "non-goal", "decision", "gap", "risk"]);
export type IngestItemKind = z.infer<typeof ingestItemKindSchema>;

/** One extracted plan item (D55) and what the user decided about it in the review (D56). */
export const ingestItemSchema = z.object({
  /** I1, I2, … */
  id: z.string(),
  kind: ingestItemKindSchema,
  title: z.string().min(1),
  body: z.string(),
  evidence: z.enum(["found", "inferred"]),
  /** found: the source path, as Claude saw it. */
  source: z.string().optional(),
  /** found: a short quote from that source. */
  quote: z.string().optional(),
  /** inferred: one line of reasoning. */
  reason: z.string().optional(),
  /** Keep (write on apply) or drop. */
  keep: z.boolean(),
  /** Inferred items start tentative: on apply they also become risks (D56). */
  tentative: z.boolean(),
  /** An existing D-id or goal it matches; such items are shown but never written twice. */
  inPlan: z.string().optional(),
  /** A "Sources disagree on …" gap; it must be resolved or parked before apply. */
  disagreement: z.boolean(),
  resolution: z.enum(["open", "resolved", "parked"]).optional(),
});
export type IngestItem = z.infer<typeof ingestItemSchema>;

export const ingestCoverageSchema = z.object({
  dimension: z.string(),
  status: z.enum(["unknown", "partial", "covered"]),
});
export type IngestCoverage = z.infer<typeof ingestCoverageSchema>;

/** docs/plan/INGEST.md (D56): the import draft the Understand step reviews. */
export const ingestDraftSchema = z.object({
  status: z.enum(["running", "draft", "applied"]),
  createdAt: z.string(),
  appliedAt: z.string().optional(),
  /** Proposed plan title and why (become GOAL.md's title and why on apply). */
  title: z.string(),
  why: z.string(),
  maturity: maturitySchema,
  maturityReasons: z.string(),
  coverage: z.array(ingestCoverageSchema),
  sources: z.array(ingestSourceSchema),
  items: z.array(ingestItemSchema),
});
export type IngestDraft = z.infer<typeof ingestDraftSchema>;

/** What an item still needs before apply, or null when it's ready. */
export const ingestItemProblem = (item: IngestItem): string | null =>
  item.keep && item.disagreement && (item.resolution ?? "open") === "open"
    ? `${item.id}: resolve or park "${item.title}" first`
    : null;

/**
 * D51: the folder name for a new project. Unlike slugify it keeps letters in any script (a
 * Hebrew name stays Hebrew) and has no fallback: "" means the name has no letters or digits.
 */
export const projectFolderName = (name: string): string =>
  name
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
