// Rebuildable in-memory index over docs/plan. Everything here is derived from the markdown
// files (D10); dropping the index and calling rebuild() yields the same data.
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  COVERAGE_DIMENSION_LABELS,
  type CoverageDimension,
  type CoverageDimensionId,
  type CoverageState,
  type Decision,
  type Gap,
  type GoalDoc,
  type HarvestCandidate,
  type Idea,
  type MdRecord,
  PLAN_DIR,
  PLAN_FILES,
  type ParkedItem,
  type PlanSnapshot,
  type RecordCodec,
  type Risk,
  SESSIONS_DIR,
  type SessionLog,
  type SessionLogSummary,
  coverageCodec,
  decisionCodec,
  gapCodec,
  goalDocSchema,
  harvestCodec,
  ideaCodec,
  modeIdSchema,
  parkedCodec,
  parseGoalDoc,
  parseHandoffDoc,
  parseIngestDoc,
  parseRecordDoc,
  parseSessionLog,
  riskCodec,
  serializeRecord,
} from "@octogent/octoplan-protocol";
import { hashText, readTextOrNull } from "./fsIo";
import { sessionIdOf } from "./sessionLog";

export type PlanWarning = { file: string; recordId: string; message: string };
export type PlanWarningListener = (warning: PlanWarning) => void;

export type PlanOpenCounts = {
  activeDecisions: number;
  staleDecisions: number;
  openGaps: number;
  openRisks: number;
  parked: number;
  inboxIdeas: number;
  uncoveredDimensions: number;
};

export type PlanIndexData = {
  snapshot: PlanSnapshot;
  /** Question id -> ids of decisions (any status) citing it in `questions` or `depends-on`. */
  decisionsByQuestion: Record<string, string[]>;
  questionsByDecision: Record<string, string[]>;
  /** From COVERAGE.md `questions`. */
  dimensionsByQuestion: Record<string, CoverageDimensionId[]>;
  questionsByDimension: Record<CoverageDimensionId, string[]>;
  openCounts: PlanOpenCounts;
};

export const COVERAGE_DIMENSION_IDS = Object.keys(
  COVERAGE_DIMENSION_LABELS,
) as CoverageDimensionId[];

// Placeholder serializeGoalDoc writes for an empty "Why"; parseGoalDoc hands it back verbatim.
const EMPTY_WHY = "_Not written yet._";

type Parsed = {
  decisions: Decision[];
  gaps: Gap[];
  risks: Risk[];
  parked: ParkedItem[];
  ideas: Idea[];
  coverage: CoverageDimension[];
  goal: GoalDoc | null;
  harvest: HarvestCandidate[];
  // HANDOFF.md and OCTOPUS.md together make `snapshot().handoff`, so both texts are kept.
  handoff: string | null;
  octopus: string | null;
  ingest: string | null;
};

/** One parsed docs/plan/sessions/*.md file. */
export type IndexedSessionLog = {
  /** File name inside sessions/. */
  file: string;
  /** The Octoplan session id from the header, when present. */
  sessionId?: string;
  log: SessionLog;
};

type FileSpec = { [K in keyof Parsed]: { key: K; path: string } }[keyof Parsed];

/** Plan files the snapshot is built from, relative to docs/plan (plus every sessions/*.md). */
export const INDEXED_FILES: FileSpec[] = [
  { key: "decisions", path: PLAN_FILES.decisions.path },
  { key: "gaps", path: PLAN_FILES.gaps.path },
  { key: "risks", path: PLAN_FILES.risks.path },
  { key: "parked", path: PLAN_FILES.parked.path },
  { key: "ideas", path: PLAN_FILES.ideas.path },
  { key: "coverage", path: PLAN_FILES.coverage.path },
  { key: "goal", path: PLAN_FILES.goal.path },
  { key: "harvest", path: PLAN_FILES.harvest.path },
  { key: "handoff", path: PLAN_FILES.handoff.path },
  { key: "octopus", path: PLAN_FILES.octopus.path },
  { key: "ingest", path: PLAN_FILES.ingest.path },
];

const SESSION_FILE_RE = new RegExp(`^${SESSIONS_DIR}/[^/]+\\.md$`);

/** True for docs/plan-relative paths the snapshot depends on. */
export const isIndexedPath = (rel: string) =>
  SESSION_FILE_RE.test(rel) || INDEXED_FILES.some((spec) => spec.path === rel);

/** Board summary of one session log (D13): answers, parked, tentative and revision counts. */
export const summarizeSessionLog = ({ file, log }: IndexedSessionLog): SessionLogSummary => {
  const mode = modeIdSchema.safeParse(log.mode);
  const count = (test: (entry: SessionLog["entries"][number]) => boolean) =>
    log.entries.filter(test).length;
  return {
    file,
    title: log.title,
    mode: mode.success ? mode.data : "deep-interview",
    startedAt: log.startedAt,
    ...(log.claudeSessionId ? { claudeSessionId: log.claudeSessionId } : {}),
    summary: log.summary,
    answers: log.entries.length,
    parked: count((e) => e.modifier === "parked"),
    tentative: count((e) => e.modifier === "tentative"),
    revisions: count((e) => Boolean(e.revises)),
  };
};

/** Newest first: by start time, then by file name (which starts with the date). */
const newestFirst = (a: IndexedSessionLog, b: IndexedSessionLog) =>
  b.log.startedAt.localeCompare(a.log.startedAt) || b.file.localeCompare(a.file);

export const emptyDimension = (id: CoverageDimensionId): CoverageDimension => ({
  id,
  status: "unknown",
  confidence: "low",
  questionIds: [],
  note: "",
});

/** All twelve dimensions in canonical order; COVERAGE.md values override the defaults. */
export const toCoverageState = (fromFile: readonly CoverageDimension[]): CoverageState => {
  const byId = new Map(fromFile.map((d) => [d.id, d]));
  return { dimensions: COVERAGE_DIMENSION_IDS.map((id) => byId.get(id) ?? emptyDimension(id)) };
};

export const parseGoalText = (text: string | null): GoalDoc | null => {
  if (text === null || text.trim() === "") return null;
  const { goal } = parseGoalDoc(text);
  const parsed = goalDocSchema.safeParse({ ...goal, why: goal.why === EMPTY_WHY ? "" : goal.why });
  return parsed.success ? parsed.data : null;
};

const isQuestionId = (id: string) => /^Q\d+$/.test(id);

const push = <K extends string>(map: Record<K, string[]>, key: K, value: string) => {
  const list = map[key] ?? [];
  if (!list.includes(value)) list.push(value);
  map[key] = list;
};

export const deriveIndex = (snapshot: PlanSnapshot): PlanIndexData => {
  const decisionsByQuestion: Record<string, string[]> = {};
  const questionsByDecision: Record<string, string[]> = {};
  for (const decision of snapshot.decisions) {
    for (const id of [...decision.questionIds, ...decision.dependsOn]) {
      if (!isQuestionId(id)) continue;
      push(decisionsByQuestion, id, decision.id);
      push(questionsByDecision, decision.id, id);
    }
  }
  const dimensionsByQuestion: Record<string, CoverageDimensionId[]> = {};
  const questionsByDimension = Object.fromEntries(
    COVERAGE_DIMENSION_IDS.map((id) => [id, [] as string[]]),
  ) as Record<CoverageDimensionId, string[]>;
  for (const dimension of snapshot.coverage.dimensions) {
    for (const questionId of dimension.questionIds) {
      push(questionsByDimension, dimension.id, questionId);
      const dims = dimensionsByQuestion[questionId] ?? [];
      if (!dims.includes(dimension.id)) dims.push(dimension.id);
      dimensionsByQuestion[questionId] = dims;
    }
  }
  const count = <T>(items: readonly T[], test: (item: T) => boolean) => items.filter(test).length;
  return {
    snapshot,
    decisionsByQuestion,
    questionsByDecision,
    dimensionsByQuestion,
    questionsByDimension,
    openCounts: {
      activeDecisions: count(snapshot.decisions, (d) => d.status === "active"),
      staleDecisions: count(snapshot.decisions, (d) => d.status === "stale"),
      openGaps: count(snapshot.gaps, (g) => g.status === "open"),
      openRisks: count(snapshot.risks, (r) => r.status === "open"),
      parked: count(snapshot.parked, (p) => p.status === "parked"),
      inboxIdeas: count(snapshot.ideas, (i) => i.status === "inbox" || i.status === "starred"),
      uncoveredDimensions: count(snapshot.coverage.dimensions, (d) => d.status !== "covered"),
    },
  };
};

const emptyParsed = (): Parsed => ({
  decisions: [],
  gaps: [],
  risks: [],
  parked: [],
  ideas: [],
  coverage: [],
  goal: null,
  harvest: [],
  handoff: null,
  octopus: null,
  ingest: null,
});

// Passed to refresh() to rescan docs/plan/sessions.
const SESSIONS_SCAN = `${SESSIONS_DIR}/`;
const allPaths = () => [...INDEXED_FILES.map((f) => f.path), SESSIONS_SCAN];

export class PlanIndex {
  private readonly planDir: string;
  private readonly onWarning: PlanWarningListener;
  private readonly warned = new Set<string>();
  private hashes = new Map<string, string | null>();
  private parsed = emptyParsed();
  private sessionHashes = new Map<string, string>();
  private sessions = new Map<string, IndexedSessionLog>();
  private current: PlanIndexData = deriveIndex(this.toSnapshot());
  // Reads are serialized so a slow read of old content can't land after a newer one.
  private queue: Promise<unknown> = Promise.resolve();
  private loaded = false;

  constructor(
    readonly repoPath: string,
    options: { onWarning?: PlanWarningListener } = {},
  ) {
    this.planDir = join(repoPath, PLAN_DIR);
    this.onWarning =
      options.onWarning ??
      ((w) => console.warn(`[octoplan] ${w.file}#${w.recordId}: ${w.message}`));
  }

  get data(): PlanIndexData {
    return this.current;
  }

  /** Every parsed session log, newest first (as of the last sync/refresh). */
  get sessionLogs(): IndexedSessionLog[] {
    return [...this.sessions.values()].sort(newestFirst);
  }

  /** Forgets everything and re-derives the index from disk. */
  rebuild(): Promise<PlanIndexData> {
    return this.serialized(() => {
      this.hashes = new Map();
      this.parsed = emptyParsed();
      this.sessionHashes = new Map();
      this.sessions = new Map();
      return this.load(allPaths());
    });
  }

  /** Re-reads every indexed file, re-parsing only those whose content changed. */
  sync(): Promise<PlanIndexData> {
    return this.refresh(allPaths());
  }

  /**
   * Re-reads just these files (paths relative to docs/plan; others are ignored). Any
   * sessions/ path rescans the sessions folder.
   */
  refresh(relPaths: readonly string[]): Promise<PlanIndexData> {
    return this.serialized(() => this.load(relPaths));
  }

  private serialized<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.catch(() => undefined).then(task);
    this.queue = run;
    return run;
  }

  private async load(relPaths: readonly string[]): Promise<PlanIndexData> {
    // Until every file has been read once, a partial refresh would leave the rest empty.
    const specs = this.loaded
      ? INDEXED_FILES.filter((spec) => relPaths.includes(spec.path))
      : INDEXED_FILES;
    const scanSessions = !this.loaded || relPaths.some((rel) => rel.startsWith(SESSIONS_SCAN));
    this.loaded = true;
    if (scanSessions) await this.scanSessions();
    const texts = await Promise.all(
      specs.map((spec) =>
        readTextOrNull(join(this.planDir, spec.path)).catch((error: unknown) => {
          this.onWarning({ file: spec.path, recordId: "*", message: String(error) });
          return null;
        }),
      ),
    );
    specs.forEach((spec, i) => this.apply(spec, texts[i] ?? null));
    return this.derive();
  }

  private apply(spec: FileSpec, text: string | null) {
    const hash = text === null ? null : hashText(text);
    if (this.hashes.has(spec.path) && this.hashes.get(spec.path) === hash) return;
    this.hashes.set(spec.path, hash);
    switch (spec.key) {
      case "decisions":
        this.parsed.decisions = this.readList(spec.path, text, decisionCodec);
        break;
      case "gaps":
        this.parsed.gaps = this.readList(spec.path, text, gapCodec);
        break;
      case "risks":
        this.parsed.risks = this.readList(spec.path, text, riskCodec);
        break;
      case "parked":
        this.parsed.parked = this.readList(spec.path, text, parkedCodec);
        break;
      case "ideas":
        this.parsed.ideas = this.readList(spec.path, text, ideaCodec);
        break;
      case "coverage":
        this.parsed.coverage = this.readList(spec.path, text, coverageCodec).map(
          ({ title: _title, ...dimension }) => dimension,
        );
        break;
      case "goal":
        this.parsed.goal = parseGoalText(text);
        break;
      case "harvest":
        this.parsed.harvest = this.readList(spec.path, text, harvestCodec);
        break;
      case "handoff":
        this.parsed.handoff = text;
        break;
      case "octopus":
        this.parsed.octopus = text;
        break;
      case "ingest":
        this.parsed.ingest = text;
        break;
    }
  }

  /** Re-parses changed sessions/*.md files and forgets deleted ones. */
  private async scanSessions() {
    const dir = join(this.planDir, SESSIONS_DIR);
    let names: string[];
    try {
      names = (await readdir(dir)).filter((name) => name.endsWith(".md"));
    } catch {
      names = [];
    }
    const present = new Set(names);
    for (const name of [...this.sessions.keys()]) {
      if (present.has(name)) continue;
      this.sessions.delete(name);
      this.sessionHashes.delete(name);
    }
    await Promise.all(
      names.map(async (file) => {
        const text = await readTextOrNull(join(dir, file)).catch(() => null);
        // A log being claimed is empty for a moment; it is picked up on the next write.
        if (text === null || text.trim() === "") {
          this.sessions.delete(file);
          this.sessionHashes.delete(file);
          return;
        }
        const hash = hashText(text);
        if (this.sessionHashes.get(file) === hash) return;
        this.sessionHashes.set(file, hash);
        try {
          const sessionId = sessionIdOf(text);
          this.sessions.set(file, {
            file,
            ...(sessionId ? { sessionId } : {}),
            log: parseSessionLog(text),
          });
        } catch (error) {
          this.sessions.delete(file);
          this.onWarning({
            file: `${SESSIONS_DIR}/${file}`,
            recordId: "*",
            message: String(error),
          });
        }
      }),
    );
  }

  private readList<T extends { id: string }>(
    file: string,
    text: string | null,
    codec: RecordCodec<T>,
  ): T[] {
    if (text === null) return [];
    const items: T[] = [];
    for (const record of parseRecordDoc(text).records) {
      const item = codec.fromRecord(record);
      if (item) items.push(item);
      else this.warnOnce(file, record);
    }
    return items;
  }

  private warnOnce(file: string, record: MdRecord) {
    const key = `${file}#${record.id}#${hashText(serializeRecord(record))}`;
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.onWarning({
      file,
      recordId: record.id,
      message: "record does not match its schema and was skipped",
    });
  }

  private toSnapshot(): PlanSnapshot {
    const p = this.parsed;
    return {
      decisions: p.decisions,
      gaps: p.gaps,
      risks: p.risks,
      parked: p.parked,
      ideas: p.ideas,
      coverage: toCoverageState(p.coverage),
      goal: p.goal,
      harvest: p.harvest,
      sessionLogs: this.sessionLogs.map(summarizeSessionLog),
      handoff:
        p.handoff === null
          ? null
          : parseHandoffDoc(p.handoff, (p.octopus ?? "").replace(/\r\n/g, "\n")),
      ingest: p.ingest === null ? null : parseIngestDoc(p.ingest),
    };
  }

  private derive(): PlanIndexData {
    this.current = deriveIndex(structuredClone(this.toSnapshot()));
    return this.current;
  }
}
