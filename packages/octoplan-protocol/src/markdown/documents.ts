import type { AnswerModifier, CoverageStatus, GoalDoc, ModeId, Stage } from "../domain";
import {
  type HandoffPlan,
  type HandoffTentacle,
  type HandoffTodo,
  handoffPlanSchema,
  handoffTentacleSchema,
} from "../v2";
import { PLAN_FILES } from "./planFiles";
import {
  type MdRecord,
  getMeta,
  getMetaList,
  mergeMeta,
  parseRecordDoc,
  serializeRecordDoc,
} from "./records";

// ---------- GOAL.md ----------
//
// # Goal — <title>
// ## Why / ## Goals / ## Non-goals / ## Definition of done
// Done items: `- [ ] text <!-- op:id=DOD1 status=partial -->` + optional `  - evidence: ...`
// Sections Octoplan doesn't own are returned as `extra` and written back after ours.

const GOAL_SECTIONS = {
  why: "Why",
  goals: "Goals",
  nonGoals: "Non-goals",
  done: "Definition of done",
} as const;

const DONE_RE =
  /^- \[( |x|X)\] (.*?)\s*<!-- op:id=([A-Za-z0-9._-]+) status=(unknown|partial|covered) -->\s*$/;
const EVIDENCE_RE = /^\s+- evidence: ?(.*)$/;

export const parseGoalDoc = (text: string): { goal: GoalDoc; extra: string } => {
  const sections = splitSections(text);
  const goal: GoalDoc = {
    title: sections.title,
    why: withoutPlaceholder((sections.byHeading.get(GOAL_SECTIONS.why) ?? []).join("\n").trim()),
    goals: bulletList(sections.byHeading.get(GOAL_SECTIONS.goals)),
    nonGoals: bulletList(sections.byHeading.get(GOAL_SECTIONS.nonGoals)),
    done: [],
  };
  const doneLines = sections.byHeading.get(GOAL_SECTIONS.done) ?? [];
  for (const line of doneLines) {
    const match = DONE_RE.exec(line);
    if (match?.[2] !== undefined && match[3] && match[4]) {
      goal.done.push({
        id: match[3],
        text: match[2].trim(),
        status: match[4] as CoverageStatus,
        evidence: "",
      });
      continue;
    }
    const evidence = EVIDENCE_RE.exec(line);
    const last = goal.done.at(-1);
    if (evidence && last) last.evidence = (evidence[1] ?? "").trim();
  }
  const known = new Set<string>(Object.values(GOAL_SECTIONS));
  const extra = sections.order
    .filter((heading) => !known.has(heading))
    .map(
      (heading) => `## ${heading}\n\n${(sections.byHeading.get(heading) ?? []).join("\n").trim()}`,
    )
    .join("\n\n");
  return { goal, extra };
};

export const serializeGoalDoc = (goal: GoalDoc, extra = ""): string => {
  const bullets = (items: readonly string[]) =>
    items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "_None yet._";
  const done =
    goal.done.length > 0
      ? goal.done
          .map((item) => {
            const box = item.status === "covered" ? "x" : " ";
            const line = `- [${box}] ${item.text} <!-- op:id=${item.id} status=${item.status} -->`;
            return item.evidence ? `${line}\n  - evidence: ${item.evidence}` : line;
          })
          .join("\n")
      : "_None yet._";
  const parts = [
    `# Goal — ${goal.title}`,
    `## ${GOAL_SECTIONS.why}\n\n${goal.why || "_Not written yet._"}`,
    `## ${GOAL_SECTIONS.goals}\n\n${bullets(goal.goals)}`,
    `## ${GOAL_SECTIONS.nonGoals}\n\n${bullets(goal.nonGoals)}`,
    `## ${GOAL_SECTIONS.done}\n\n${done}`,
  ];
  if (extra.trim()) parts.push(extra.trim());
  return `${parts.join("\n\n")}\n`;
};

const splitSections = (text: string) => {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let title = "";
  const byHeading = new Map<string, string[]>();
  const order: string[] = [];
  let current: string | null = null;
  for (const line of lines) {
    const h1 = /^# (?:Goal\s*[—–-]\s*)?(.*)$/.exec(line);
    if (h1 && !title && current === null) {
      title = (h1[1] ?? "").trim();
      continue;
    }
    const h2 = /^## (.*)$/.exec(line);
    if (h2) {
      current = (h2[1] ?? "").trim();
      if (!byHeading.has(current)) {
        byHeading.set(current, []);
        order.push(current);
      }
      continue;
    }
    if (current) byHeading.get(current)?.push(line);
  }
  return { title, byHeading, order };
};

// serializeGoalDoc writes this placeholder for an empty Why; it must read back as "".
const WHY_PLACEHOLDER = "_Not written yet._";
const withoutPlaceholder = (text: string) => (text === WHY_PLACEHOLDER ? "" : text);

const bulletList = (lines: string[] | undefined) =>
  (lines ?? [])
    .map((line) => /^- (.*)$/.exec(line)?.[1]?.trim())
    .filter((item): item is string => Boolean(item) && item !== "_None yet._");

// ---------- sessions/YYYY-MM-DD-<slug>.md ----------
//
// Chronological answer log. A revision is a new entry with `revises: A3`,
// so the full history of every answer stays readable in git.

export type SessionLogEntry = {
  id: string;
  questionId: string;
  questionText: string;
  round: number;
  dimension?: string;
  answer: string;
  modifier: AnswerModifier;
  assumption?: string;
  revises?: string;
  answeredAt: string;
};

export type SessionLog = {
  title: string;
  mode: ModeId;
  repoPath: string;
  startedAt: string;
  claudeSessionId?: string;
  summary: string;
  entries: SessionLogEntry[];
};

export const serializeSessionLog = (log: SessionLog): string => {
  const header = [
    `# Session — ${log.title}`,
    "",
    `- mode: ${log.mode}`,
    `- repo: ${log.repoPath}`,
    `- started: ${log.startedAt}`,
    ...(log.claudeSessionId ? [`- claude-session: ${log.claudeSessionId}`] : []),
    "",
    "## Summary",
    "",
    log.summary.trim() || "_In progress._",
    "",
    "## Answers",
  ].join("\n");
  const records: MdRecord[] = log.entries.map((entry) => ({
    id: entry.id,
    title: entry.questionText,
    meta: mergeMeta(
      [],
      [
        ["question", entry.questionId],
        ["round", String(entry.round)],
        ["dimension", entry.dimension],
        ["answer", entry.answer],
        ["modifier", entry.modifier],
        ["assumption", entry.assumption],
        ["revises", entry.revises],
        ["answered-at", entry.answeredAt],
      ],
    ),
    body: "",
  }));
  return serializeRecordDoc({ preamble: header, records });
};

export const parseSessionLog = (text: string): SessionLog => {
  const doc = parseRecordDoc(text);
  const pre = doc.preamble.split("\n");
  const meta = (key: string) =>
    pre
      .map((line) => new RegExp(`^- ${key}: ?(.*)$`).exec(line)?.[1])
      .find(Boolean)
      ?.trim();
  const summaryStart = pre.findIndex((line) => line.trim() === "## Summary");
  const summaryEnd = pre.findIndex((line) => line.trim() === "## Answers");
  const summary =
    summaryStart === -1
      ? ""
      : pre
          .slice(summaryStart + 1, summaryEnd === -1 ? undefined : summaryEnd)
          .join("\n")
          .trim();
  const claudeSessionId = meta("claude-session");
  return {
    title: /^# Session\s*[—–-]\s*(.*)$/.exec(pre[0] ?? "")?.[1]?.trim() ?? "",
    mode: (meta("mode") ?? "deep-interview") as ModeId,
    repoPath: meta("repo") ?? "",
    startedAt: meta("started") ?? "",
    ...(claudeSessionId ? { claudeSessionId } : {}),
    summary: summary === "_In progress._" ? "" : summary,
    entries: doc.records.map((record) => {
      const dimension = getMeta(record, "dimension");
      const assumption = getMeta(record, "assumption");
      const revises = getMeta(record, "revises");
      return {
        id: record.id,
        questionId: getMeta(record, "question") ?? "",
        questionText: record.title,
        round: Number.parseInt(getMeta(record, "round") ?? "0", 10),
        ...(dimension ? { dimension } : {}),
        answer: getMeta(record, "answer") ?? "",
        modifier: (getMeta(record, "modifier") ?? "none") as AnswerModifier,
        ...(assumption ? { assumption } : {}),
        ...(revises ? { revises } : {}),
        answeredAt: getMeta(record, "answered-at") ?? "",
      };
    }),
  };
};

// ---------- stages/STAGE-n.md ----------

export const serializeStage = (stage: Stage): string => {
  const longestRun = Math.max(2, ...[...stage.prompt.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = "`".repeat(longestRun + 1);
  // v2 (G1): `## Decisions` with a comma list, only when the stage cites any.
  const decisions =
    stage.decisionIds && stage.decisionIds.length > 0
      ? `## Decisions\n\n${stage.decisionIds.join(", ")}\n\n`
      : "";
  return `# Stage ${stage.index} — ${stage.title}\n\n## Goal\n\n${stage.goal.trim()}\n\n${decisions}## Prompt\n\n${fence}text\n${stage.prompt.replace(/\n+$/, "")}\n${fence}\n`;
};

export const parseStage = (text: string): Stage | null => {
  const normalized = text.replace(/\r\n/g, "\n");
  const head = /^# Stage (\d+)\s*[—–-]\s*(.*)$/m.exec(normalized);
  const prompt = /## Prompt\n\n(`{3,})text\n([\s\S]*?)\n\1\s*$/.exec(normalized);
  if (!head?.[1] || !prompt) return null;
  // Everything before the prompt, so a prompt that mentions "## Decisions" can't confuse it.
  const before = normalized.slice(0, prompt.index + "## Prompt".length);
  const goal = /## Goal\n\n([\s\S]*?)\n\n## (?:Decisions|Prompt)/.exec(before);
  const decisions = /## Decisions\n\n([\s\S]*?)\n\n## Prompt/.exec(before);
  const decisionIds = (decisions?.[1] ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  return {
    index: Number.parseInt(head[1], 10),
    title: (head[2] ?? "").trim(),
    goal: (goal?.[1] ?? "").trim(),
    prompt: prompt[2] ?? "",
    ...(decisionIds.length > 0 ? { decisionIds } : {}),
  };
};

// ---------- preamble meta lines ----------
//
// Some files keep a few `- key: value` lines in their preamble (HARVEST.md's harvest mark,
// HANDOFF.md's status). These helpers read and replace one line without touching the rest.

const preambleLineRe = (key: string) => new RegExp(`^- ${key}: ?(.*)$`);

export const getPreambleMeta = (preamble: string, key: string): string | undefined => {
  const re = preambleLineRe(key);
  for (const line of preamble.replace(/\r\n/g, "\n").split("\n")) {
    const match = re.exec(line);
    if (match) return (match[1] ?? "").trim();
  }
  return undefined;
};

/** Replaces the key's line in place, or appends it at the end of the preamble. */
export const setPreambleMeta = (preamble: string, key: string, value: string): string => {
  const re = preambleLineRe(key);
  const lines = preamble.replace(/\r\n/g, "\n").split("\n");
  const line = `- ${key}: ${oneLineText(value)}`;
  const index = lines.findIndex((l) => re.test(l));
  if (index !== -1) {
    lines[index] = line;
    return lines.join("\n");
  }
  const trimmed = preamble.trim();
  if (trimmed === "") return line;
  // Join a trailing block of meta lines instead of starting a new paragraph.
  return /(^|\n)- [a-z][a-z0-9-]*:.*$/.test(trimmed)
    ? `${trimmed}\n${line}`
    : `${trimmed}\n\n${line}`;
};

/** HARVEST.md preamble key for the newest commit sha the last harvest covered. */
export const HARVEST_MARK_KEY = "last-harvest";

// ---------- HANDOFF.md (D46) ----------
//
// # Handoff to Octogent
//
// - status: draft
// - generated: 2026-09-27T10:00:00.000Z
// - source: claude
// - workspace: /path/to/checkout
// - heading: Octoplan v2
//
// <!-- op:id=T1 -->
// ## T1 — Store
// - id: store
// - description: Reads and writes docs/plan.
// - owns: apps/octoplan/server/store, apps/octoplan/tests/store
// - existing: yes
//
// - [ ] [D27] HARVEST.md round-trips. Done when …
//
// ### Wave 4
//
// - [ ] [D28, D4] Conventions store. Done when …
//
// The octopus prompt is not stored here; it lives in OCTOPUS.md (D47).

const HANDOFF_KEYS = ["status", "generated", "applied", "source", "workspace", "heading"];
const HANDOFF_NOTE =
  "Tentacles and todos for Octogent. Edit freely: todo lines are read back as written. The octopus prompt is in OCTOPUS.md.";
const TODO_RE = /^- \[( |x|X)\] (.*)$/;
const TODO_IDS_RE = /^\[([A-Z][A-Za-z]*\d+(?:\s*,\s*[A-Z][A-Za-z]*\d+)*)\]\s+(.*)$/;
const WAVE_RE = /^###\s+(.*)$/;

const oneLineText = (value: string) => value.replace(/\s*\n\s*/g, " ").trim();

export const serializeHandoffTodo = (todo: HandoffTodo) => {
  const ids = todo.decisionIds.length > 0 ? `[${todo.decisionIds.join(", ")}] ` : "";
  return `- [ ] ${ids}${oneLineText(todo.text)}`;
};

/** Todos grouped by wave in order of first appearance; todos without a wave come first. */
const serializeTodos = (todos: readonly HandoffTodo[]) => {
  const waves: string[] = [];
  for (const todo of todos) if (!waves.includes(todo.wave)) waves.push(todo.wave);
  waves.sort((a, b) => (a === "" ? -1 : b === "" ? 1 : 0));
  return waves
    .map((wave) => {
      const lines = todos.filter((t) => t.wave === wave).map(serializeHandoffTodo);
      return wave === "" ? lines.join("\n") : `### ${oneLineText(wave)}\n\n${lines.join("\n")}`;
    })
    .join("\n\n");
};

/** Checkbox lines under optional `### <wave>` subheadings; other lines are ignored. */
export const parseHandoffTodos = (body: string): HandoffTodo[] => {
  const todos: HandoffTodo[] = [];
  let wave = "";
  for (const line of body.replace(/\r\n/g, "\n").split("\n")) {
    const heading = WAVE_RE.exec(line);
    if (heading) {
      wave = (heading[1] ?? "").trim();
      continue;
    }
    const todo = TODO_RE.exec(line.trimEnd());
    if (!todo) continue;
    const rest = (todo[2] ?? "").trim();
    const ids = TODO_IDS_RE.exec(rest);
    const text = (ids ? (ids[2] ?? "") : rest).trim();
    if (!text) continue;
    todos.push({
      text,
      decisionIds: ids ? (ids[1] ?? "").split(",").map((id) => id.trim()) : [],
      wave,
    });
  }
  return todos;
};

const tentacleRecord = (tentacle: HandoffTentacle, index: number, existing?: MdRecord) => ({
  id: `T${index + 1}`,
  title: oneLineText(tentacle.name),
  meta: mergeMeta(existing?.meta ?? [], [
    ["id", tentacle.id],
    ["description", oneLineText(tentacle.description)],
    ["owns", tentacle.owns.length > 0 ? tentacle.owns.join(", ") : undefined],
    ["existing", tentacle.existing ? "yes" : "no"],
  ]),
  body: serializeTodos(tentacle.todos),
});

/**
 * HANDOFF.md for a plan (its octopusPrompt is ignored). Given the file's current text, the
 * title, unknown preamble lines and unknown tentacle meta keys (matched by tentacle id) are
 * kept, so hand edits win.
 */
export const serializeHandoffDoc = (
  plan: Omit<HandoffPlan, "octopusPrompt"> & { octopusPrompt?: string },
  existing?: string | null,
): string => {
  const old = existing ? parseRecordDoc(existing) : null;
  const oldLines = old ? old.preamble.split("\n") : [];
  const hasTitle = oldLines[0]?.startsWith("# ") ?? false;
  const title = hasTitle ? (oldLines[0] ?? "") : PLAN_FILES.handoff.preamble;
  const known = new RegExp(`^- (?:${HANDOFF_KEYS.join("|")}):`);
  const extras = old
    ? oldLines
        .slice(hasTitle ? 1 : 0)
        .filter((line) => !known.test(line))
        .join("\n")
        .trim()
    : HANDOFF_NOTE;
  const meta: Array<[string, string | undefined]> = [
    ["status", plan.status],
    ["generated", plan.generatedAt],
    ["applied", plan.appliedAt],
    ["source", plan.source],
    ["workspace", plan.workspace],
    ["heading", plan.heading],
  ];
  const metaLines = meta
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `- ${key}: ${oneLineText(value)}`);
  const preamble = [title, "", ...metaLines, ...(extras ? ["", extras] : [])].join("\n");
  const records = plan.tentacles.map((tentacle, index) =>
    tentacleRecord(
      tentacle,
      index,
      old?.records.find((record) => getMeta(record, "id") === tentacle.id),
    ),
  );
  return serializeRecordDoc({ preamble, records });
};

/** A tentacle from its T-record, or null when a hand edit broke it. */
export const parseHandoffTentacle = (record: MdRecord): HandoffTentacle | null => {
  const parsed = handoffTentacleSchema.safeParse({
    id: getMeta(record, "id") ?? "",
    name: record.title,
    description: getMeta(record, "description") ?? "",
    owns: getMetaList(record, "owns"),
    existing: /^(yes|true)$/i.test(getMeta(record, "existing") ?? ""),
    todos: parseHandoffTodos(record.body),
  });
  return parsed.success ? parsed.data : null;
};

/** HANDOFF.md back into a plan; broken tentacles are skipped, a broken header reads as null. */
export const parseHandoffDoc = (text: string, octopusPrompt = ""): HandoffPlan | null => {
  if (text.trim() === "") return null;
  const doc = parseRecordDoc(text);
  const meta = (key: string) => getPreambleMeta(doc.preamble, key);
  const appliedAt = meta("applied");
  const parsed = handoffPlanSchema.safeParse({
    status: meta("status") ?? "draft",
    generatedAt: meta("generated") ?? "",
    ...(appliedAt ? { appliedAt } : {}),
    source: meta("source") ?? "claude",
    workspace: meta("workspace") ?? "",
    heading: meta("heading") ?? "",
    tentacles: doc.records
      .map(parseHandoffTentacle)
      .filter((t): t is HandoffTentacle => t !== null),
    octopusPrompt,
  });
  return parsed.success ? parsed.data : null;
};
