// ---------- INGEST.md (D56) ----------
//
// # Import — what I understood
//
// - status: draft
// - created: 2026-09-28T10:00:00.000Z
// - title: Habit tracker
// - why: Log a habit a day and keep a streak.
// - maturity: partial-plan
// - maturity-reasons: A spec with goals and two decisions; no scope or success criteria.
// - coverage: problem=covered, users=partial, scope=unknown
//
// <!-- op:id=S1 -->
// ## S1 — C:\repos\habit
// - kind: folder
// - main: yes
// - maturity: built
// - skipped: design.docx
//
// A small CLI with tests.
//
// <!-- op:id=I1 -->
// ## I1 — Store habits in one JSON file
// - kind: decision
// - evidence: found
// - source: docs/SPEC.md
// - quote: All data lives in ~/.habit.json
// - keep: yes
// - tentative: no
// - disagreement: no
//
// Body text, as Claude wrote it or the user edited it.
//
// Nothing here reaches DECISIONS.md or GOAL.md until the review is applied.
import {
  type IngestCoverage,
  type IngestDraft,
  type IngestItem,
  type IngestSource,
  ingestDraftSchema,
  ingestItemSchema,
  ingestSourceSchema,
} from "../v3";
import { getPreambleMeta } from "./documents";
import { PLAN_FILES } from "./planFiles";
import {
  type MdRecord,
  getMeta,
  getMetaList,
  mergeMeta,
  parseRecordDoc,
  serializeRecordDoc,
} from "./records";

const INGEST_KEYS = [
  "status",
  "created",
  "applied",
  "title",
  "why",
  "maturity",
  "maturity-reasons",
  "coverage",
];
const INGEST_NOTE =
  "What Octoplan understood from the imported material. Edit freely; nothing reaches the plan until the review is applied.";

const oneLine = (value: string) => value.replace(/\s*\n\s*/g, " ").trim();
const yesNo = (value: boolean) => (value ? "yes" : "no");
const isYes = (value: string | undefined) => /^(yes|true)$/i.test(value ?? "");

export const serializeCoverage = (coverage: readonly IngestCoverage[]): string =>
  coverage.map((c) => `${c.dimension}=${c.status}`).join(", ");

export const parseCoverage = (text: string | undefined): IngestCoverage[] =>
  (text ?? "")
    .split(",")
    .map((part) => part.trim().split("="))
    .flatMap(([dimension, status]) =>
      dimension && (status === "unknown" || status === "partial" || status === "covered")
        ? [{ dimension: dimension.trim(), status }]
        : [],
    );

const sourceRecord = (source: IngestSource, existing?: MdRecord): MdRecord => ({
  id: source.id,
  title: oneLine(source.path),
  meta: mergeMeta(existing?.meta ?? [], [
    ["kind", source.kind],
    ["main", yesNo(source.main)],
    ["maturity", source.maturity],
    ["skipped", source.skipped.length > 0 ? source.skipped.map(oneLine).join(", ") : undefined],
  ]),
  body: source.note.trim(),
});

const itemRecord = (item: IngestItem, existing?: MdRecord): MdRecord => ({
  id: item.id,
  title: oneLine(item.title),
  meta: mergeMeta(existing?.meta ?? [], [
    ["kind", item.kind],
    ["evidence", item.evidence],
    ["source", item.source !== undefined ? oneLine(item.source) : undefined],
    ["quote", item.quote !== undefined ? oneLine(item.quote) : undefined],
    ["reason", item.reason !== undefined ? oneLine(item.reason) : undefined],
    ["keep", yesNo(item.keep)],
    ["tentative", yesNo(item.tentative)],
    ["in-plan", item.inPlan],
    ["disagreement", yesNo(item.disagreement)],
    ["resolution", item.resolution],
  ]),
  body: item.body.trim(),
});

/**
 * INGEST.md for a draft. Given the file's current text, its title line, unknown preamble lines
 * and unknown record meta keys (matched by id) are kept, so hand edits survive a save.
 */
export const serializeIngestDoc = (draft: IngestDraft, existing?: string | null): string => {
  const old = existing ? parseRecordDoc(existing) : null;
  const oldLines = old ? old.preamble.split("\n") : [];
  const hasTitle = oldLines[0]?.startsWith("# ") ?? false;
  const heading = hasTitle ? (oldLines[0] ?? "") : PLAN_FILES.ingest.preamble;
  const known = new RegExp(`^- (?:${INGEST_KEYS.join("|")}):`);
  const extras = old
    ? oldLines
        .slice(hasTitle ? 1 : 0)
        .filter((line) => !known.test(line))
        .join("\n")
        .trim()
    : INGEST_NOTE;
  const meta: Array<[string, string | undefined]> = [
    ["status", draft.status],
    ["created", draft.createdAt],
    ["applied", draft.appliedAt],
    ["title", draft.title],
    ["why", draft.why],
    ["maturity", draft.maturity],
    ["maturity-reasons", draft.maturityReasons],
    ["coverage", serializeCoverage(draft.coverage)],
  ];
  const metaLines = meta
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `- ${key}: ${oneLine(value)}`);
  const preamble = [heading, "", ...metaLines, ...(extras ? ["", extras] : [])].join("\n");
  const byId = new Map(old?.records.map((record) => [record.id, record]) ?? []);
  const records = [
    ...draft.sources.map((source) => sourceRecord(source, byId.get(source.id))),
    ...draft.items.map((item) => itemRecord(item, byId.get(item.id))),
  ];
  return serializeRecordDoc({ preamble, records });
};

const parseSource = (record: MdRecord): IngestSource | null => {
  const parsed = ingestSourceSchema.safeParse({
    id: record.id,
    path: record.title,
    kind: getMeta(record, "kind"),
    main: isYes(getMeta(record, "main")),
    maturity: getMeta(record, "maturity"),
    note: record.body.trim(),
    skipped: getMetaList(record, "skipped"),
  });
  return parsed.success ? parsed.data : null;
};

const parseItem = (record: MdRecord): IngestItem | null => {
  const optional = (key: string) => {
    const value = getMeta(record, key);
    return value === undefined ? {} : { [key === "in-plan" ? "inPlan" : key]: value };
  };
  const parsed = ingestItemSchema.safeParse({
    id: record.id,
    kind: getMeta(record, "kind"),
    title: record.title,
    body: record.body.trim(),
    evidence: getMeta(record, "evidence") ?? "inferred",
    ...optional("source"),
    ...optional("quote"),
    ...optional("reason"),
    keep: isYes(getMeta(record, "keep") ?? "yes"),
    tentative: isYes(getMeta(record, "tentative")),
    ...optional("in-plan"),
    disagreement: isYes(getMeta(record, "disagreement")),
    ...optional("resolution"),
  });
  return parsed.success ? parsed.data : null;
};

/** INGEST.md back into a draft; broken records are skipped, a broken header reads as null. */
export const parseIngestDoc = (text: string): IngestDraft | null => {
  if (text.trim() === "") return null;
  const doc = parseRecordDoc(text);
  const meta = (key: string) => getPreambleMeta(doc.preamble, key);
  const appliedAt = meta("applied");
  const parsed = ingestDraftSchema.safeParse({
    status: meta("status") ?? "draft",
    createdAt: meta("created") ?? "",
    ...(appliedAt ? { appliedAt } : {}),
    title: meta("title") ?? "",
    why: meta("why") ?? "",
    maturity: meta("maturity") ?? "raw-idea",
    maturityReasons: meta("maturity-reasons") ?? "",
    coverage: parseCoverage(meta("coverage")),
    sources: doc.records
      .filter((record) => /^S\d+$/.test(record.id))
      .map(parseSource)
      .filter((source): source is IngestSource => source !== null),
    items: doc.records
      .filter((record) => /^I\d+$/.test(record.id))
      .map(parseItem)
      .filter((item): item is IngestItem => item !== null),
  });
  return parsed.success ? parsed.data : null;
};
