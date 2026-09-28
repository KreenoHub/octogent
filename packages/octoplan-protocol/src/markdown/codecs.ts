import {
  type ConversationBranch,
  type CoverageDimension,
  type Decision,
  type Gap,
  type Idea,
  type ParkedItem,
  type Risk,
  confidenceSchema,
  conversationBranchSchema,
  coverageDimensionSchema,
  decisionSchema,
  gapSchema,
  ideaSchema,
  parkedItemSchema,
  riskSchema,
} from "../domain";
import { type MdRecord, type RecordCodec, getMeta, getMetaList, mergeMeta } from "./records";

type Schema<T> = { safeParse: (value: unknown) => { success: true; data: T } | { success: false } };

// Every codec maps meta keys <-> fields, validates with the domain schema, and
// returns null for records a human broke instead of throwing mid-read.
const defineCodec = <T extends { id: string; title: string; body: string }>(
  schema: Schema<T>,
  read: (record: MdRecord) => Record<string, unknown>,
  write: (item: T) => Array<[string, string | undefined]>,
): RecordCodec<T> => ({
  fromRecord: (record) => {
    const parsed = schema.safeParse({
      id: record.id,
      title: record.title,
      body: record.body,
      ...stripUndefined(read(record)),
    });
    return parsed.success ? parsed.data : null;
  },
  toRecord: (item, existing) => ({
    id: item.id,
    title: item.title,
    meta: mergeMeta(existing?.meta ?? [], write(item)),
    body: item.body,
  }),
});

const stripUndefined = (value: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));

const joinList = (values: readonly string[]) => (values.length > 0 ? values.join(", ") : undefined);

export const decisionCodec = defineCodec<Decision>(
  decisionSchema,
  (r) => ({
    date: getMeta(r, "date"),
    status: getMeta(r, "status") ?? "active",
    source: getMeta(r, "source") ?? "",
    questionIds: getMetaList(r, "questions"),
    dependsOn: getMetaList(r, "depends-on"),
  }),
  (d) => [
    ["date", d.date],
    ["status", d.status],
    ["source", d.source || undefined],
    ["questions", joinList(d.questionIds)],
    ["depends-on", joinList(d.dependsOn)],
  ],
);

export const gapCodec = defineCodec<Gap>(
  gapSchema,
  (r) => ({ dimension: getMeta(r, "dimension"), status: getMeta(r, "status") ?? "open" }),
  (g) => [
    ["dimension", g.dimension],
    ["status", g.status],
  ],
);

export const riskCodec = defineCodec<Risk>(
  riskSchema,
  (r) => ({
    likelihood: getMeta(r, "likelihood") ?? "medium",
    impact: getMeta(r, "impact") ?? "medium",
    origin: getMeta(r, "origin") ?? "",
    status: getMeta(r, "status") ?? "open",
  }),
  (r) => [
    ["likelihood", r.likelihood],
    ["impact", r.impact],
    ["origin", r.origin || undefined],
    ["status", r.status],
  ],
);

export const parkedCodec = defineCodec<ParkedItem>(
  parkedItemSchema,
  (r) => ({
    questionId: getMeta(r, "question"),
    assumption: getMeta(r, "assumption") ?? "",
    date: getMeta(r, "date"),
    status: getMeta(r, "status") ?? "parked",
  }),
  (p) => [
    ["question", p.questionId],
    ["assumption", p.assumption],
    ["date", p.date],
    ["status", p.status],
  ],
);

export const ideaCodec = defineCodec<Idea>(
  ideaSchema,
  (r) => ({
    date: getMeta(r, "date"),
    tags: getMetaList(r, "tags"),
    status: getMeta(r, "status") ?? "inbox",
  }),
  (i) => [
    ["date", i.date],
    ["tags", joinList(i.tags)],
    ["status", i.status],
  ],
);

export const branchCodec = defineCodec<ConversationBranch>(
  conversationBranchSchema,
  (r) => ({
    sessionId: getMeta(r, "session"),
    parentSessionId: getMeta(r, "parent-session"),
    forkedFromBlockId: getMeta(r, "forked-from"),
    gitBranch: getMeta(r, "git-branch"),
    status: getMeta(r, "status") ?? "exploring",
  }),
  (b) => [
    ["session", b.sessionId],
    ["parent-session", b.parentSessionId],
    ["forked-from", b.forkedFromBlockId],
    ["git-branch", b.gitBranch],
    ["status", b.status],
  ],
);

// Coverage records use the dimension id as record id and the label as title,
// so they don't fit defineCodec's title/body-on-the-item shape.
export const coverageCodec: RecordCodec<CoverageDimension & { title?: string }> = {
  fromRecord: (record) => {
    const confidence = confidenceSchema.safeParse(getMeta(record, "confidence") ?? "low");
    const parsed = coverageDimensionSchema.safeParse({
      id: record.id,
      status: getMeta(record, "status") ?? "unknown",
      confidence: confidence.success ? confidence.data : "low",
      questionIds: getMetaList(record, "questions"),
      note: record.body,
    });
    return parsed.success ? { ...parsed.data, title: record.title } : null;
  },
  toRecord: (item, existing) => ({
    id: item.id,
    title: existing?.title || item.title || item.id,
    meta: mergeMeta(existing?.meta ?? [], [
      ["status", item.status],
      ["confidence", item.confidence],
      ["questions", joinList(item.questionIds)],
    ]),
    body: item.note,
  }),
};
