// Filesystem PlanStore: docs/plan markdown in the target repo is the source of truth (D10).
// Every write is read -> upsert -> write through the protocol codecs, so hand edits win.
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  type Answer,
  COVERAGE_DIMENSION_LABELS,
  type ConversationBranch,
  type CoverageDimension,
  type CoverageState,
  type Decision,
  type Gap,
  type GoalDoc,
  HARVEST_MARK_KEY,
  type HandoffPlan,
  type HarvestCandidate,
  type HistoryEvent,
  type Idea,
  PLAN_DIR,
  PLAN_FILES,
  type ParkedItem,
  type PlanFileKey,
  type PlanSnapshot,
  type QuestionRound,
  type RecordCodec,
  type RecordDoc,
  type Risk,
  SESSIONS_DIR,
  STAGES_DIR,
  type SessionLogEntry,
  type SessionLogSummary,
  type Stage,
  branchCodec,
  coverageCodec,
  decisionCodec,
  gapCodec,
  getMeta,
  getPreambleMeta,
  goalDocSchema,
  handoffPlanSchema,
  type IngestDraft,
  ingestDraftSchema,
  SOURCES_DIR,
  harvestCodec,
  ideaCodec,
  nextId,
  parkedCodec,
  parseGoalDoc,
  parseRecordDoc,
  parseSessionLog,
  parseStage,
  readItems,
  riskCodec,
  serializeGoalDoc,
  serializeHandoffDoc,
  serializeIngestDoc,
  serializeRecordDoc,
  serializeStage,
  sessionFileName,
  setPreambleMeta,
  slugify,
  stageFileName,
  stageSchema,
  upsertItem,
} from "@octogent/octoplan-protocol";
import { FileWriter, readTextOrNull } from "./fsIo";
import { PlanIndex, type PlanWarningListener, isIndexedPath, toCoverageState } from "./index";
import {
  displayAnswer,
  entryRecord,
  findSessionLog,
  latestEntryFor,
  newSessionLogText,
  rewriteHeader,
} from "./sessionLog";
import type {
  BranchInput,
  DecisionInput,
  HarvestCandidateInput,
  PlanChangeListener,
  PlanStore,
  StartSessionLogInput,
} from "./types";
import { type PlanDirWatcher, watchPlanDir } from "./watcher";

export type { PlanWarning, PlanWarningListener } from "./index";

export type FsPlanStoreOptions = {
  /** Broken records are skipped on read and reported here once each (default: console.warn). */
  onWarning?: PlanWarningListener;
  /** Quiet period before an external edit is reported (default 150 ms). */
  debounceMs?: number;
};

// GOAL.md, HANDOFF.md and OCTOPUS.md have serializers of their own.
type ListFileKey = Exclude<PlanFileKey, "goal" | "handoff" | "octopus">;

/** Harvest titles compare case- and whitespace-insensitively (rejected ones never return). */
const titleKey = (title: string) => title.trim().replace(/\s+/g, " ").toLowerCase();

const byAt = (a: HistoryEvent, b: HistoryEvent) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0);

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;
const STAGE_FILE_RE = /^STAGE-(\d+)\.md$/;

const today = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const dateOf = (timestamp: string) => DATE_RE.exec(timestamp)?.[0] ?? today();

/** A session log's path relative to docs/plan, as the index and watcher name it. */
const sessionRel = (path: string) => `${SESSIONS_DIR}/${basename(path)}`;

const findItem = <T extends { id: string }>(doc: RecordDoc, codec: RecordCodec<T>, id: string) => {
  const record = doc.records.find((r) => r.id === id);
  return record ? codec.fromRecord(record) : null;
};

/** Validates through the codec's own schema so an invalid item is never written. */
const checked = <T extends { id: string }>(codec: RecordCodec<T>, item: T, file: string): T => {
  const roundTrip = codec.fromRecord(codec.toRecord(item));
  if (!roundTrip) throw new Error(`invalid ${file} record ${item.id}`);
  return roundTrip;
};

class FsPlanStore implements PlanStore {
  private readonly planDir: string;
  private readonly writer = new FileWriter();
  private readonly index: PlanIndex;
  private readonly listeners = new Set<PlanChangeListener>();
  private readonly sessionPaths = new Map<string, string>();
  private readonly debounceMs: number;
  private watcher: Promise<PlanDirWatcher | null> | null = null;
  private emitTimer: NodeJS.Timeout | null = null;
  private disposed = false;

  constructor(
    readonly repoPath: string,
    options: FsPlanStoreOptions,
  ) {
    this.planDir = join(repoPath, PLAN_DIR);
    this.debounceMs = options.debounceMs ?? 150;
    this.index = new PlanIndex(repoPath, options.onWarning ? { onWarning: options.onWarning } : {});
  }

  async snapshot(): Promise<PlanSnapshot> {
    return (await this.index.sync()).snapshot;
  }

  // ---------- record files ----------

  private planPath(rel: string) {
    return join(this.planDir, rel);
  }

  private async mutateList<T>(
    key: ListFileKey,
    change: (doc: RecordDoc) => { doc: RecordDoc | null; result: T },
  ): Promise<T> {
    const file = PLAN_FILES[key];
    const result = await this.writer.mutate(this.planPath(file.path), (current) => {
      const doc =
        current === null ? { preamble: file.preamble, records: [] } : parseRecordDoc(current);
      const next = change(doc);
      return { text: next.doc ? serializeRecordDoc(next.doc) : null, result: next.result };
    });
    await this.afterWrite([file.path]);
    return result;
  }

  private addItem<T extends { id: string }>(
    key: ListFileKey,
    codec: RecordCodec<T>,
    prefix: string,
    input: Omit<T, "id">,
  ): Promise<T> {
    return this.mutateList(key, (doc) => {
      const item = checked(codec, { ...input, id: nextId(doc, prefix) } as T, PLAN_FILES[key].path);
      return { doc: upsertItem(doc, codec, item), result: item };
    });
  }

  upsertDecision(input: DecisionInput): Promise<Decision> {
    return this.mutateList("decisions", (doc) => {
      const existing = input.id ? findItem(doc, decisionCodec, input.id) : null;
      const decision = checked(
        decisionCodec,
        {
          id: input.id ?? nextId(doc, "D"),
          title: input.title,
          date: input.date ?? existing?.date ?? today(),
          status: input.status ?? existing?.status ?? "active",
          source: input.source,
          questionIds: input.questionIds,
          dependsOn: input.dependsOn,
          body: input.body,
        },
        PLAN_FILES.decisions.path,
      );
      return { doc: upsertItem(doc, decisionCodec, decision), result: decision };
    });
  }

  async markDecisionsStale(ids: readonly string[]): Promise<void> {
    await this.mutateList("decisions", (doc) => {
      let next = doc;
      for (const id of ids) {
        const decision = findItem(next, decisionCodec, id);
        if (decision && decision.status !== "stale") {
          next = upsertItem(next, decisionCodec, { ...decision, status: "stale" });
        }
      }
      return { doc: next === doc ? null : next, result: undefined };
    });
  }

  async dependentDecisions(questionId: string): Promise<Decision[]> {
    const data = await this.index.sync();
    const ids = new Set(data.decisionsByQuestion[questionId] ?? []);
    return data.snapshot.decisions.filter(
      (d) =>
        d.status === "active" &&
        (ids.has(d.id) || d.questionIds.includes(questionId) || d.dependsOn.includes(questionId)),
    );
  }

  addGap(input: Omit<Gap, "id">) {
    return this.addItem("gaps", gapCodec, "G", input);
  }

  addRisk(input: Omit<Risk, "id">) {
    return this.addItem("risks", riskCodec, "R", input);
  }

  park(input: Omit<ParkedItem, "id">) {
    return this.addItem("parked", parkedCodec, "P", input);
  }

  addIdea(input: Omit<Idea, "id">) {
    return this.addItem("ideas", ideaCodec, "I", input);
  }

  updateCoverage(dimension: CoverageDimension): Promise<CoverageState> {
    return this.mutateList("coverage", (doc) => {
      const item = { ...dimension, title: COVERAGE_DIMENSION_LABELS[dimension.id] };
      if (!coverageCodec.fromRecord(coverageCodec.toRecord(item))) {
        throw new Error(`invalid coverage dimension ${dimension.id}`);
      }
      const next = upsertItem(doc, coverageCodec, item);
      const dimensions = readItems(next, coverageCodec).map(({ title: _t, ...d }) => d);
      return { doc: next, result: toCoverageState(dimensions) };
    });
  }

  async writeGoal(goal: GoalDoc): Promise<void> {
    const valid = goalDocSchema.parse(goal);
    await this.writer.mutate(this.planPath(PLAN_FILES.goal.path), (current) => ({
      text: serializeGoalDoc(valid, current === null ? "" : parseGoalDoc(current).extra),
      result: undefined,
    }));
    await this.afterWrite([PLAN_FILES.goal.path]);
  }

  // ---------- session logs ----------

  private get sessionsDir() {
    return this.planPath(SESSIONS_DIR);
  }

  async startSessionLog(input: StartSessionLogInput): Promise<string> {
    const date = dateOf(input.startedAt);
    const text = newSessionLogText(
      {
        title: input.title,
        mode: input.mode,
        repoPath: this.repoPath,
        startedAt: input.startedAt,
        ...(input.claudeSessionId ? { claudeSessionId: input.claudeSessionId } : {}),
        summary: "",
      },
      input.sessionId,
    );
    await mkdir(this.sessionsDir, { recursive: true });
    for (let n = 1; ; n++) {
      const name =
        n === 1
          ? sessionFileName(date, input.title)
          : `${date}-${slugify(input.title).slice(0, 55).replace(/-+$/, "")}-${n}.md`;
      const path = join(this.sessionsDir, name);
      if (!(await this.claim(path))) continue;
      await this.writer.mutate(path, () => ({ text, result: undefined }));
      this.sessionPaths.set(input.sessionId, path);
      await this.afterWrite([sessionRel(path)]);
      return path;
    }
  }

  /** Creates the file exclusively so two sessions never share a log. */
  private async claim(path: string) {
    try {
      await writeFile(path, "", { flag: "wx" });
      return true;
    } catch (error) {
      if ((error as { code?: string }).code === "EEXIST") return false;
      throw error;
    }
  }

  private async sessionPath(sessionId: string) {
    const known = this.sessionPaths.get(sessionId);
    if (known) return known;
    const found = await findSessionLog(this.sessionsDir, sessionId);
    if (found) this.sessionPaths.set(sessionId, found);
    return found;
  }

  private async requireSessionPath(sessionId: string) {
    const path = await this.sessionPath(sessionId);
    if (!path) throw new Error(`no session log for Octoplan session ${sessionId}`);
    return path;
  }

  async setClaudeSessionId(sessionId: string, claudeSessionId: string): Promise<void> {
    const path = await this.requireSessionPath(sessionId);
    await this.writer.mutate(path, (current) => ({
      text: current === null ? null : rewriteHeader(current, { claudeSessionId }),
      result: undefined,
    }));
    await this.afterWrite([sessionRel(path)]);
  }

  async writeSessionSummary(sessionId: string, summary: string): Promise<void> {
    const path = await this.requireSessionPath(sessionId);
    await this.writer.mutate(path, (current) => ({
      text: current === null ? null : rewriteHeader(current, { summary }),
      result: undefined,
    }));
    await this.afterWrite([sessionRel(path)]);
  }

  async latestAnswer(sessionId: string, questionId: string): Promise<SessionLogEntry | null> {
    try {
      const path = await this.sessionPath(sessionId);
      const text = path ? await readTextOrNull(path) : null;
      return text === null ? null : latestEntryFor(parseSessionLog(text).entries, questionId);
    } catch {
      return null;
    }
  }

  async recordAnswers(
    sessionId: string,
    round: QuestionRound,
    answers: Answer[],
  ): Promise<SessionLogEntry[]> {
    const path =
      (await this.sessionPath(sessionId)) ??
      // Answers must never be lost, so an unknown session gets a log of its own.
      (await this.startSessionLog({
        sessionId,
        title: `session ${sessionId}`,
        mode: "deep-interview",
        startedAt: answers[0]?.answeredAt ?? new Date().toISOString(),
      }));
    const logRel = sessionRel(path);

    type Recorded = { entry: SessionLogEntry; previous: SessionLogEntry | null };
    const recorded = await this.writer.mutate(path, (current) => {
      if (current === null) throw new Error(`session log ${path} disappeared`);
      const doc = parseRecordDoc(current);
      const entries = parseSessionLog(current).entries;
      const out: Recorded[] = [];
      for (const answer of answers) {
        const question = round.questions.find((q) => q.id === answer.questionId);
        const previous = latestEntryFor(entries, answer.questionId);
        const revises =
          answer.revisionOf === undefined
            ? undefined
            : (previous?.id ?? (/^A\d+$/.test(answer.revisionOf) ? answer.revisionOf : undefined));
        const answerText = displayAnswer(answer);
        const assumption =
          answer.modifier === "parked"
            ? answer.assumption?.trim() || answer.selected.join(", ") || "recommended option"
            : undefined;
        const dimension = question?.dimension ?? previous?.dimension;
        const entry: SessionLogEntry = {
          id: nextId(doc, "A"),
          questionId: answer.questionId,
          questionText: question?.question ?? previous?.questionText ?? answer.questionId,
          round: round.index,
          ...(dimension ? { dimension } : {}),
          answer: answerText,
          modifier: answer.modifier,
          ...(assumption ? { assumption } : {}),
          ...(revises ? { revises } : {}),
          answeredAt: answer.answeredAt,
        };
        doc.records.push(entryRecord(entry));
        entries.push(entry);
        out.push({ entry, previous });
      }
      return { text: serializeRecordDoc(doc), result: out };
    });

    for (const { entry, previous } of recorded) {
      if (entry.modifier === "parked") {
        await this.park({
          title: entry.questionText,
          questionId: entry.questionId,
          assumption: entry.assumption ?? "",
          date: dateOf(entry.answeredAt),
          status: "parked",
          body: `Parked in ${logRel} (${entry.id}).`,
        });
      } else if (previous?.modifier === "parked") {
        await this.resolveParked(entry);
      }
      if (entry.modifier === "tentative") {
        await this.addRisk({
          title: `Tentative: ${entry.questionText}`,
          likelihood: "medium",
          impact: "medium",
          origin: `${entry.questionId} tentative`,
          status: "open",
          body: `Answered "${entry.answer}" in ${logRel} (${entry.id}).`,
        });
      }
    }
    await this.afterWrite([logRel]);
    return recorded.map((r) => r.entry);
  }

  /** A parked question that now has a real answer: its PARKED.md item is resolved. */
  private async resolveParked(entry: SessionLogEntry) {
    await this.mutateList("parked", (doc) => {
      let next: RecordDoc | null = null;
      for (const item of readItems(doc, parkedCodec)) {
        if (item.questionId !== entry.questionId || item.status !== "parked") continue;
        const note = `Resolved by ${entry.id}: ${entry.answer}.`;
        const body = item.body ? `${item.body} ${note}` : note;
        next = upsertItem(next ?? doc, parkedCodec, { ...item, status: "resolved", body });
      }
      return { doc: next, result: undefined };
    });
  }

  // ---------- wave 2: ideas, stages, branches ----------

  updateIdea(idea: Idea): Promise<Idea> {
    return this.mutateList("ideas", (doc) => {
      if (!findItem(doc, ideaCodec, idea.id)) {
        throw new Error(`unknown idea ${idea.id} in ${PLAN_FILES.ideas.path}`);
      }
      const item = checked(ideaCodec, idea, PLAN_FILES.ideas.path);
      return { doc: upsertItem(doc, ideaCodec, item), result: item };
    });
  }

  private get stagesDir() {
    return this.planPath(STAGES_DIR);
  }

  /** Stage indexes present on disk, from file names matching STAGE-<n>.md. */
  private async stageFiles(): Promise<Array<{ index: number; path: string }>> {
    let names: string[];
    try {
      names = await readdir(this.stagesDir);
    } catch {
      return [];
    }
    return names.flatMap((name) => {
      const match = STAGE_FILE_RE.exec(name);
      return match?.[1]
        ? [{ index: Number.parseInt(match[1], 10), path: join(this.stagesDir, name) }]
        : [];
    });
  }

  async readStages(): Promise<Stage[]> {
    const stages: Stage[] = [];
    for (const file of await this.stageFiles()) {
      const text = await readTextOrNull(file.path).catch(() => null);
      const stage = text === null ? null : parseStage(text);
      if (stage) stages.push(stage);
    }
    return stages.sort((a, b) => a.index - b.index);
  }

  async writeStages(stages: readonly Stage[]): Promise<void> {
    const valid = stages.map((stage) => stageSchema.parse(stage));
    const indexes = new Set<number>();
    for (const stage of valid) {
      if (indexes.has(stage.index)) throw new Error(`duplicate stage index ${stage.index}`);
      indexes.add(stage.index);
    }
    await Promise.all(
      valid.map((stage) =>
        this.writer.mutate(join(this.stagesDir, stageFileName(stage.index)), () => ({
          text: serializeStage(stage),
          result: undefined,
        })),
      ),
    );
    for (const file of await this.stageFiles()) {
      if (indexes.has(file.index)) continue;
      await this.writer.mutate(file.path, () => ({ text: null, result: undefined }));
      // Recorded before removal so the watcher treats the deletion as our own.
      this.writer.hashes.set(file.path, undefined);
      await rm(file.path, { force: true });
    }
    this.scheduleEmit();
  }

  async readBranches(): Promise<ConversationBranch[]> {
    const text = await readTextOrNull(this.planPath(PLAN_FILES.branches.path));
    return text === null ? [] : readItems(parseRecordDoc(text), branchCodec);
  }

  upsertBranch(input: BranchInput): Promise<ConversationBranch> {
    return this.mutateList("branches", (doc) => {
      const branch = checked(
        branchCodec,
        { ...input, id: input.id ?? nextId(doc, "B") },
        PLAN_FILES.branches.path,
      );
      const next = upsertItem(doc, branchCodec, branch);
      // The codec has no date; an extra `date` meta key dates the branch on the History tab.
      const record = next.records.find((r) => r.id === branch.id);
      if (record && getMeta(record, "date") === undefined) record.meta.unshift(["date", today()]);
      return { doc: next, result: branch };
    });
  }

  // ---------- v2: harvest (D27) ----------

  // Accepting reads HARVEST.md, writes DECISIONS.md, then HARVEST.md again; one at a time.
  private harvestQueue: Promise<unknown> = Promise.resolve();

  async readHarvest(): Promise<HarvestCandidate[]> {
    return (await this.index.sync()).snapshot.harvest ?? [];
  }

  async addHarvest(inputs: readonly HarvestCandidateInput[]): Promise<HarvestCandidate[]> {
    if (inputs.length === 0) return [];
    return this.mutateList("harvest", (doc) => {
      // Raw record titles, so even a hand-broken record still blocks its title.
      const known = new Set(doc.records.map((record) => titleKey(record.title)));
      const added: HarvestCandidate[] = [];
      let next = doc;
      for (const input of inputs) {
        const key = titleKey(input.title);
        if (!key || known.has(key)) continue;
        known.add(key);
        const { date, ...rest } = input;
        const candidate = checked(
          harvestCodec,
          { ...rest, id: nextId(next, "H"), date: date ?? today(), status: "pending" },
          PLAN_FILES.harvest.path,
        );
        next = upsertItem(next, harvestCodec, candidate);
        added.push(candidate);
      }
      return { doc: added.length > 0 ? next : null, result: added };
    });
  }

  resolveHarvest(
    id: string,
    action: "accept" | "reject",
  ): Promise<{ candidate: HarvestCandidate; decision?: Decision }> {
    const run = this.harvestQueue.catch(() => undefined).then(() => this.resolveOne(id, action));
    this.harvestQueue = run;
    return run;
  }

  private async resolveOne(
    id: string,
    action: "accept" | "reject",
  ): Promise<{ candidate: HarvestCandidate; decision?: Decision }> {
    const text = await readTextOrNull(this.planPath(PLAN_FILES.harvest.path));
    const found = text === null ? null : findItem(parseRecordDoc(text), harvestCodec, id);
    if (!found) throw new Error(`unknown harvest candidate ${id} in ${PLAN_FILES.harvest.path}`);
    let decision: Decision | undefined;
    if (action === "accept") {
      const linked = found.decisionId
        ? (await this.index.sync()).snapshot.decisions.find((d) => d.id === found.decisionId)
        : undefined;
      // Accepting twice keeps the first D-record instead of writing a duplicate.
      decision =
        linked ??
        (await this.upsertDecision({
          title: found.title,
          body: found.body,
          source: `harvest ${id}`,
          questionIds: [],
          dependsOn: [],
        }));
    }
    const candidate = await this.mutateList("harvest", (doc) => {
      const current = findItem(doc, harvestCodec, id) ?? found;
      const item: HarvestCandidate =
        action === "accept"
          ? { ...current, status: "accepted", ...(decision ? { decisionId: decision.id } : {}) }
          : { ...current, status: "rejected" };
      return { doc: upsertItem(doc, harvestCodec, item), result: item };
    });
    return decision ? { candidate, decision } : { candidate };
  }

  async harvestMark(): Promise<string | null> {
    const text = await readTextOrNull(this.planPath(PLAN_FILES.harvest.path));
    if (text === null) return null;
    return getPreambleMeta(parseRecordDoc(text).preamble, HARVEST_MARK_KEY) || null;
  }

  async setHarvestMark(sha: string): Promise<void> {
    await this.mutateList("harvest", (doc) => ({
      doc: { ...doc, preamble: setPreambleMeta(doc.preamble, HARVEST_MARK_KEY, sha) },
      result: undefined,
    }));
  }

  // ---------- v2: overview (D13, D24) ----------

  async readSessionLogs(): Promise<SessionLogSummary[]> {
    return (await this.index.sync()).snapshot.sessionLogs ?? [];
  }

  async readHistory(): Promise<HistoryEvent[]> {
    const { snapshot } = await this.index.sync();
    const logs = this.index.sessionLogs;
    const events: HistoryEvent[] = [];

    for (const { file, log } of logs) {
      events.push({
        at: log.startedAt,
        kind: "session",
        refId: file,
        title: log.title || file,
        sessionFile: file,
      });
      for (const entry of log.entries) {
        if (!entry.revises) continue;
        events.push({
          at: entry.answeredAt,
          kind: "revision",
          refId: entry.id,
          title: `${entry.questionText}: ${entry.answer} (revises ${entry.revises})`,
          sessionFile: file,
        });
      }
    }

    for (const decision of snapshot.decisions) {
      events.push({
        at: decision.date,
        kind: "decision",
        refId: decision.id,
        title: decision.title,
      });
      // No stale date is stored, so the mark sits on the decision's own date.
      if (decision.status === "stale") {
        events.push({
          at: decision.date,
          kind: "stale",
          refId: decision.id,
          title: `${decision.title} (stale)`,
        });
      }
    }

    const logFor = (sessionId: string) => logs.find((l) => l.sessionId === sessionId);
    const branchesText = await readTextOrNull(this.planPath(PLAN_FILES.branches.path));
    for (const record of branchesText === null ? [] : parseRecordDoc(branchesText).records) {
      const branch = branchCodec.fromRecord(record);
      if (!branch) continue;
      const log = logFor(branch.sessionId) ?? logFor(branch.parentSessionId);
      const at = getMeta(record, "date") || log?.log.startedAt || "";
      events.push({
        at,
        kind: "branch",
        refId: branch.id,
        title: branch.title,
        ...(log ? { sessionFile: log.file } : {}),
      });
    }

    for (const candidate of snapshot.harvest ?? []) {
      if (candidate.status === "pending") continue;
      const title =
        candidate.status === "accepted"
          ? `Accepted: ${candidate.title}${candidate.decisionId ? ` as ${candidate.decisionId}` : ""}`
          : `Rejected: ${candidate.title}`;
      events.push({ at: candidate.date, kind: "harvest", refId: candidate.id, title });
    }

    const handoff = snapshot.handoff;
    if (handoff) {
      const count = `${handoff.tentacles.length} tentacle${handoff.tentacles.length === 1 ? "" : "s"}`;
      events.push({
        at: handoff.generatedAt,
        kind: "handoff",
        refId: PLAN_FILES.handoff.path,
        title: `Handoff generated (${count})`,
      });
      if (handoff.appliedAt) {
        events.push({
          at: handoff.appliedAt,
          kind: "handoff",
          refId: PLAN_FILES.handoff.path,
          title: `Handoff applied to ${handoff.workspace || "Octogent"} (${count})`,
        });
      }
    }

    // Array.prototype.sort is stable, so same-time events keep the order above.
    return events.sort(byAt);
  }

  // ---------- v2: handoff (D46, D47) ----------

  async readHandoff(): Promise<HandoffPlan | null> {
    return (await this.index.sync()).snapshot.handoff ?? null;
  }

  async writeHandoff(plan: HandoffPlan): Promise<void> {
    const valid = handoffPlanSchema.parse(plan);
    await this.writer.mutate(this.planPath(PLAN_FILES.handoff.path), (current) => ({
      text: serializeHandoffDoc(valid, current),
      result: undefined,
    }));
    // HANDOFF.md doesn't hold the prompt, so a draft's prompt goes to OCTOPUS.md right away;
    // otherwise it would be lost before Apply (which rewrites it with writeOctopusPrompt).
    if (valid.octopusPrompt !== "") await this.writeOctopusText(valid.octopusPrompt);
    await this.afterWrite([PLAN_FILES.handoff.path, PLAN_FILES.octopus.path]);
  }

  async writeOctopusPrompt(markdown: string): Promise<void> {
    await this.writeOctopusText(markdown);
    await this.afterWrite([PLAN_FILES.octopus.path]);
  }

  private writeOctopusText(markdown: string) {
    return this.writer.mutate(this.planPath(PLAN_FILES.octopus.path), () => ({
      text: markdown,
      result: undefined,
    }));
  }

  // ---------- v3: import (D52, D56) ----------

  async readIngest(): Promise<IngestDraft | null> {
    return (await this.index.sync()).snapshot.ingest ?? null;
  }

  async writeIngest(draft: IngestDraft): Promise<void> {
    const valid = ingestDraftSchema.parse(draft);
    await this.writer.mutate(this.planPath(PLAN_FILES.ingest.path), (current) => ({
      text: serializeIngestDoc(valid, current),
      result: undefined,
    }));
    await this.afterWrite([PLAN_FILES.ingest.path]);
  }

  async writePastedSource(text: string): Promise<string> {
    const dir = this.planPath(SOURCES_DIR);
    await mkdir(dir, { recursive: true });
    const taken = new Set(await readdir(dir).catch(() => [] as string[]));
    let n = 1;
    while (taken.has(`pasted-${n}.md`)) n += 1;
    const rel = `${SOURCES_DIR}/pasted-${n}.md`;
    await writeFile(this.planPath(rel), `${text.replace(/\r\n/g, "\n").trim()}\n`, "utf8");
    return rel;
  }

  // ---------- change events ----------

  onChange(listener: PlanChangeListener): () => void {
    this.listeners.add(listener);
    if (!this.watcher && !this.disposed) {
      this.watcher = watchPlanDir(this.repoPath, (files) => void this.onExternalChange(files), {
        hashes: this.writer.hashes,
        debounceMs: this.debounceMs,
      }).catch((error: unknown) => {
        console.warn(`[octoplan] cannot watch ${this.planDir}: ${String(error)}`);
        return null;
      });
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) void this.stopWatching();
    };
  }

  private async onExternalChange(files: string[]) {
    const indexed = files.filter(isIndexedPath);
    if (indexed.length === 0 || this.disposed) return;
    await this.index.refresh(indexed);
    this.scheduleEmit();
  }

  private async afterWrite(files: string[]) {
    await this.index.refresh(files);
    this.scheduleEmit();
  }

  /** Coalesces the writes of one tool call (or a burst of calls) into one event. */
  private scheduleEmit() {
    if (this.disposed || this.emitTimer || this.listeners.size === 0) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null;
      const snapshot = this.index.data.snapshot;
      for (const listener of [...this.listeners]) {
        try {
          listener(snapshot);
        } catch (error) {
          console.warn(`[octoplan] plan change listener failed: ${String(error)}`);
        }
      }
    }, 20);
  }

  private async stopWatching() {
    const pending = this.watcher;
    this.watcher = null;
    (await pending)?.close();
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    if (this.emitTimer) clearTimeout(this.emitTimer);
    this.emitTimer = null;
    this.listeners.clear();
    await this.stopWatching();
    await this.writer.idle();
  }
}

export const createFsPlanStore = (repoPath: string, options: FsPlanStoreOptions = {}): PlanStore =>
  new FsPlanStore(repoPath, options);
