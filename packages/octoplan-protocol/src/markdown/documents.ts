import type { AnswerModifier, CoverageStatus, GoalDoc, ModeId, Stage } from "../domain";
import { type MdRecord, getMeta, mergeMeta, parseRecordDoc, serializeRecordDoc } from "./records";

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
    why: (sections.byHeading.get(GOAL_SECTIONS.why) ?? []).join("\n").trim(),
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
  return `# Stage ${stage.index} — ${stage.title}\n\n## Goal\n\n${stage.goal.trim()}\n\n## Prompt\n\n${fence}text\n${stage.prompt.replace(/\n+$/, "")}\n${fence}\n`;
};

export const parseStage = (text: string): Stage | null => {
  const normalized = text.replace(/\r\n/g, "\n");
  const head = /^# Stage (\d+)\s*[—–-]\s*(.*)$/m.exec(normalized);
  const goal = /## Goal\n\n([\s\S]*?)\n\n## Prompt/.exec(normalized);
  const prompt = /## Prompt\n\n(`{3,})text\n([\s\S]*?)\n\1\s*$/.exec(normalized);
  if (!head?.[1] || !prompt) return null;
  return {
    index: Number.parseInt(head[1], 10),
    title: (head[2] ?? "").trim(),
    goal: (goal?.[1] ?? "").trim(),
    prompt: prompt[2] ?? "",
  };
};
