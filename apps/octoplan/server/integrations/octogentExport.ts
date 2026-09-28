// Export a plan into an Octogent tentacle (`<workspace>/.octogent/tentacles/<id>/`).
// Deck reads CONTEXT.md's first `# Heading` as the name and the first paragraph as the
// description, and only `- [ ] ` / `- [x] ` lines of todo.md as work items (docs/concepts/tentacles.md).
// D36: Octoplan only ever rewrites its own `<!-- octoplan:start -->` block in CONTEXT.md; hand
// notes and Octogent's suggested-skills block stay byte-identical. Todos carry D-id stamps
// (`- [ ] [D14, D29] text`, D26) and dedupe by their text without the stamp.
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Decision, GoalDoc } from "@octogent/octoplan-protocol";
import type { Exec, ExportToTentacleInput, ExportToTentacleResult } from "./types";
import { resolveWorkspace } from "./workspace";

export const START_OCTOGENT_MESSAGE = "Start Octogent in this repo first (run `octogent` there)";
export const DONE_WHEN_FALLBACK =
  "Done when the change is in place and a test or command you ran shows it works.";
export const OCTOPLAN_START = "<!-- octoplan:start -->";
export const OCTOPLAN_END = "<!-- octoplan:end -->";

const OCTOPLAN_BLOCK = /<!-- octoplan:start -->[\s\S]*?<!-- octoplan:end -->/;
const TODO_ITEM = /^- \[[ xX]\] (.*)$/;
const STAMP = /^\[(D\d+(?:\s*,\s*D\d+)*)\]\s*/;
const TENTACLE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();

export const isValidTentacleId = (id: string): boolean =>
  TENTACLE_ID.test(id) && !id.includes("..");

export const tentacleDir = (workspace: string, tentacleId: string): string =>
  join(workspace, ".octogent", "tentacles", tentacleId);

/** `[D14, D29] Build it. Done when …` -> { ids: ["D14", "D29"], text: "Build it. Done when …" }. */
export const splitStamp = (text: string): { ids: string[]; text: string } => {
  const match = STAMP.exec(text);
  if (!match) return { ids: [], text };
  return {
    ids: (match[1] as string).split(",").map((id) => id.trim()),
    text: text.slice(match[0].length),
  };
};

/** The dedupe key of a todo: its text without checkbox, D-id stamp or extra whitespace. */
export const todoKey = (text: string): string => oneLine(splitStamp(oneLine(text)).text);

const uniqueIds = (ids: readonly string[]): string[] => [
  ...new Set(ids.map((id) => id.trim()).filter((id) => /^D\d+$/.test(id))),
];

/**
 * Collapse a task to a single `- [ ] ` line that ends in a "Done when …" clause, stamped with
 * its decision ids: the given ones, else a leading `[D1, D2]` stamp already in the text.
 */
export const toTodoLine = (task: string, decisionIds: readonly string[] = []): string | null => {
  const raw = oneLine(task).replace(/^[-*]\s+(\[[ xX]\]\s+)?/, "");
  const stamped = splitStamp(raw);
  let text = stamped.text.trim();
  if (!text) return null;
  if (!/\bDone when\b/i.test(text)) {
    if (!/[.!?]$/.test(text)) text = `${text}.`;
    text = `${text} ${DONE_WHEN_FALLBACK}`;
  }
  const ids = uniqueIds(decisionIds.length > 0 ? decisionIds : stamped.ids);
  return `- [ ] ${ids.length > 0 ? `[${ids.join(", ")}] ` : ""}${text}`;
};

const describe = (goal: GoalDoc | null, decisions: readonly Decision[]): string => {
  const fromGoal = goal ? oneLine(goal.why) || oneLine(goal.goals[0] ?? "") : "";
  if (fromGoal) return fromGoal;
  return `Plan exported from Octoplan with ${decisions.length} active decision${
    decisions.length === 1 ? "" : "s"
  }.`;
};

/** The `--description` for `octogent tentacle create`: the first sentence, capped at 160 chars. */
export const shortDescription = (description: string): string => {
  const sentence = /^(.+?[.!?])(\s|$)/.exec(oneLine(description))?.[1] ?? oneLine(description);
  return sentence.length > 160 ? `${sentence.slice(0, 157)}...` : sentence;
};

const list = (items: readonly string[]) => items.map((item) => `- ${oneLine(item)}`);

/** The Octoplan-managed block: goal, owned paths (handoff) and active decisions. */
export const renderManagedBlock = (
  goal: GoalDoc | null,
  decisions: readonly Decision[],
  owns: readonly string[] = [],
): string => {
  const active = decisions.filter((d) => d.status === "active");
  const lines = [OCTOPLAN_START, "## Plan (from Octoplan)"];
  const why = goal ? oneLine(goal.why) : "";
  if (why) lines.push("", why);
  const section = (heading: string, body: string[]) => {
    if (body.length > 0) lines.push("", `### ${heading}`, "", ...body);
  };
  if (goal) {
    section("Goals", list(goal.goals));
    section("Non-goals", list(goal.nonGoals));
    section(
      "Done when",
      goal.done.map((d) => `- ${d.id}: ${oneLine(d.text)} (${d.status})`),
    );
  }
  section(
    "Owns",
    owns.map((path) => `- \`${oneLine(path).replace(/`/g, "")}\``),
  );
  section(
    "Active decisions",
    active.map((d) => {
      const summary = oneLine(d.body.split(/\r?\n/).find((l) => l.trim()) ?? "");
      return `- **${d.id} — ${oneLine(d.title)}**${summary ? `: ${summary}` : ""}`;
    }),
  );
  lines.push(
    "",
    "_Managed by Octoplan: this block is rewritten on every export. Edit outside it._",
    OCTOPLAN_END,
  );
  return lines.join("\n");
};

const eolOf = (text: string): string => (text.includes("\r\n") ? "\r\n" : "\n");

/**
 * Put `block` into CONTEXT.md. An existing octoplan block is replaced in place; otherwise the
 * block goes at the end. Every byte outside the block is kept. A missing or fresh file (just
 * created by Octogent) gets `# name` + description first so Deck shows the name.
 */
export const mergeContext = (
  existing: string | null,
  block: string,
  fresh?: { name: string; description: string },
): string => {
  const eol = eolOf(existing ?? "");
  const withEol = block.replace(/\r?\n/g, eol);
  if (existing && OCTOPLAN_BLOCK.test(existing)) {
    return existing.replace(OCTOPLAN_BLOCK, () => withEol);
  }
  if (fresh && (!existing || !existing.trim())) {
    return `# ${oneLine(fresh.name)}\n\n${oneLine(fresh.description)}\n\n${block}\n`;
  }
  const base = existing ?? "";
  if (!base.trim()) return `${withEol}${eol}`;
  const trimmedEnd = base.replace(/(\r?\n)*$/, "");
  return `${trimmedEnd}${eol}${eol}${withEol}${eol}`;
};

export type TodoPlacement = { heading?: string; wave?: string };

const headingLevel = (line: string): number => {
  const match = /^(#{1,6})\s/.exec(line);
  return match ? (match[1] as string).length : 0;
};

const isHeading = (line: string, level: number, title: string): boolean =>
  headingLevel(line) === level && oneLine(line.slice(level + 1)) === oneLine(title);

/** Index after the region's last non-blank line (where new todo lines go). */
const lastContentIndex = (lines: readonly string[], start: number, end: number): number => {
  let at = end;
  while (at > start && !(lines[at - 1] as string).trim()) at -= 1;
  return at;
};

/**
 * Append todo lines to todo.md, deduped by text (ignoring checkbox and D-id stamp) against the
 * whole file. With a heading they go at the end of `## heading` (created at the end of the file
 * when missing); with a wave, under `### wave` inside it (created at the end of the section);
 * wave "" = directly under the heading, before any `###` subsection. No heading = end of file.
 */
export const appendTodos = (
  existing: string | null,
  lines: readonly string[],
  placement: TodoPlacement = {},
): { content: string; added: number; skipped: number } => {
  const base = existing ?? "# Todo\n";
  const eol = eolOf(base);
  const seen = new Set(
    base
      .split(/\r?\n/)
      .map((line) => TODO_ITEM.exec(line.trim())?.[1])
      .filter((text): text is string => Boolean(text))
      .map(todoKey),
  );
  const fresh: string[] = [];
  let skipped = 0;
  for (const line of lines) {
    const key = todoKey(line.replace(/^- \[[ xX]\] /, ""));
    if (!key) continue;
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    fresh.push(line);
  }
  if (fresh.length === 0) return { content: base, added: 0, skipped };

  const heading = placement.heading?.trim();
  if (!heading) {
    let content = base.endsWith("\n") ? base : `${base}${eol}`;
    if (!TODO_ITEM.test(content.trimEnd().split(/\r?\n/).pop() ?? "")) content = `${content}${eol}`;
    return { content: `${content}${fresh.join(eol)}${eol}`, added: fresh.length, skipped };
  }

  const doc = base.replace(/(\r?\n)*$/, "").split(/\r?\n/);
  const sectionEnd = (from: number, maxLevel: number) => {
    let at = from + 1;
    while (at < doc.length) {
      const level = headingLevel(doc[at] as string);
      if (level > 0 && level <= maxLevel) break;
      at += 1;
    }
    return at;
  };
  const openHeading = (at: number, text: string) => {
    // A blank line before the new heading (unless it starts the file) and one after it.
    const before = at > 0 && (doc[at - 1] as string).trim() ? [""] : [];
    const next = doc[at];
    doc.splice(at, 0, ...before, text, ...(next !== undefined && !next.trim() ? [] : [""]));
    return at + before.length;
  };

  let h2 = doc.findIndex((line) => isHeading(line, 2, heading));
  if (h2 === -1) h2 = openHeading(doc.length, `## ${heading}`);
  let regionStart = h2;
  let regionEnd = sectionEnd(h2, 2);
  const wave = placement.wave?.trim();
  if (wave) {
    let h3 = -1;
    for (let i = h2 + 1; i < regionEnd; i += 1) {
      if (isHeading(doc[i] as string, 3, wave)) {
        h3 = i;
        break;
      }
    }
    if (h3 === -1) h3 = openHeading(lastContentIndex(doc, h2 + 1, regionEnd), `### ${wave}`);
    regionStart = h3;
    regionEnd = sectionEnd(h3, 3);
  } else {
    // Directly under the heading: stop before the first subsection.
    for (let i = h2 + 1; i < regionEnd; i += 1) {
      if (headingLevel(doc[i] as string) >= 3) {
        regionEnd = i;
        break;
      }
    }
  }

  let at = lastContentIndex(doc, regionStart + 1, regionEnd);
  if (at === regionStart + 1 && !(doc[regionStart + 1] ?? "x").trim()) {
    at = regionStart + 2; // after the heading's blank line
  } else if (at === regionStart + 1 || !TODO_ITEM.test(doc[at - 1] as string)) {
    doc.splice(at, 0, "");
    at += 1;
  }
  const after = doc[at];
  doc.splice(at, 0, ...fresh, ...(after?.trim() ? [""] : []));
  return { content: `${doc.join(eol)}${eol}`, added: fresh.length, skipped };
};

export const readIfExists = async (file: string): Promise<string | null> => {
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
};

/**
 * Makes sure `<workspace>/.octogent/tentacles/<id>/` exists, creating it through the Octogent
 * CLI (which needs Octogent running in that workspace). Errors come back as user-facing text.
 */
export const ensureTentacle = async (
  exec: Exec,
  workspace: string,
  tentacleId: string,
  description: string,
): Promise<{ ok: true; created: boolean } | { ok: false; message: string }> => {
  if (!isValidTentacleId(tentacleId)) {
    return {
      ok: false,
      message: `"${tentacleId}" is not a valid tentacle id (letters, digits, . _ - only).`,
    };
  }
  const dir = tentacleDir(workspace, tentacleId);
  if (existsSync(dir)) return { ok: true, created: false };
  // The CLI finds its server by exact cwd through `.octogent/project.json`; without it, it falls
  // back to localhost:8787, which may be another project's Octogent. Don't risk the wrong repo.
  if (!existsSync(join(workspace, ".octogent", "project.json"))) {
    return { ok: false, message: START_OCTOGENT_MESSAGE };
  }

  const result = await exec(
    "octogent",
    ["tentacle", "create", tentacleId, "--description", shortDescription(description)],
    workspace,
  );
  if (result.code !== 0) {
    const output = `${result.stderr}\n${result.stdout}`;
    if (/could not reach api|start octogent|ECONNREFUSED|fetch failed/i.test(output)) {
      return { ok: false, message: START_OCTOGENT_MESSAGE };
    }
    if (result.code === 127) {
      return {
        ok: false,
        message:
          "The `octogent` CLI was not found on PATH. Install Octogent, then start it in this repo.",
      };
    }
    const first = result.stderr.trim().split(/\r?\n/)[0] ?? "";
    return { ok: false, message: `octogent tentacle create failed: ${first || result.code}` };
  }
  if (!existsSync(dir)) {
    return {
      ok: false,
      message: `Octogent created "${tentacleId}" outside ${workspace}. ${START_OCTOGENT_MESSAGE}.`,
    };
  }
  return { ok: true, created: true };
};

export type WriteTentacleInput = {
  workspace: string;
  tentacleId: string;
  created: boolean;
  name: string;
  description: string;
  block: string;
  todos: ReadonlyArray<{ line: string; placement: TodoPlacement }>;
};

/** Writes the managed block and appends todos, grouped by placement in their given order. */
export const writeTentacle = async (
  input: WriteTentacleInput,
): Promise<{ added: number; skipped: number }> => {
  const dir = tentacleDir(input.workspace, input.tentacleId);
  await mkdir(dir, { recursive: true });
  const contextFile = join(dir, "CONTEXT.md");
  const existing = await readIfExists(contextFile);
  // A tentacle Octogent just created only has its stub heading: replace it with the plan's.
  const fresh = { name: input.name, description: input.description };
  const merged = input.created
    ? mergeContext(renameHeading(existing, input.name), input.block, fresh)
    : mergeContext(existing, input.block, fresh);
  if (merged !== existing) await writeFile(contextFile, merged, "utf8");

  const todoFile = join(dir, "todo.md");
  const before = await readIfExists(todoFile);
  let content = before;
  let added = 0;
  let skipped = 0;
  const groups: Array<{ placement: TodoPlacement; lines: string[] }> = [];
  for (const todo of input.todos) {
    const last = groups[groups.length - 1];
    if (
      last &&
      last.placement.heading === todo.placement.heading &&
      last.placement.wave === todo.placement.wave
    ) {
      last.lines.push(todo.line);
    } else {
      groups.push({ placement: todo.placement, lines: [todo.line] });
    }
  }
  for (const group of groups) {
    const result = appendTodos(content, group.lines, group.placement);
    content = result.content;
    added += result.added;
    skipped += result.skipped;
  }
  if (content === null) content = "# Todo\n";
  if (content !== before) await writeFile(todoFile, content, "utf8");
  return { added, skipped };
};

/** Octogent's create writes `# <id>

<description>`: give the stub the plan's display name. */
export const renameHeading = (existing: string | null, name: string): string | null => {
  if (!existing) return existing;
  return existing.replace(/^# .*$/m, () => `# ${oneLine(name)}`);
};

export const exportToTentacle = async (
  exec: Exec,
  input: ExportToTentacleInput,
): Promise<ExportToTentacleResult> => {
  const { tentacleId } = input;
  if (!isValidTentacleId(tentacleId)) {
    return {
      ok: false,
      message: `"${tentacleId}" is not a valid tentacle id (letters, digits, . _ - only).`,
    };
  }
  const workspace = await resolveWorkspace(exec, input.repoPath);
  const active = input.decisions.filter((d) => d.status === "active");
  const description = describe(input.goal, active);
  const ensured = await ensureTentacle(exec, workspace, tentacleId, description);
  if (!ensured.ok) return ensured;

  const placement: TodoPlacement = input.heading?.trim() ? { heading: input.heading.trim() } : {};
  const todos = input.tasks
    .map((task) => toTodoLine(task))
    .filter((line): line is string => line !== null)
    .map((line) => ({ line, placement }));
  const { added, skipped } = await writeTentacle({
    workspace,
    tentacleId,
    created: ensured.created,
    name: oneLine(input.goal?.title ?? "") || tentacleId,
    description,
    block: renderManagedBlock(input.goal, active),
    todos,
  });

  const plural = (n: number) => `${n} task${n === 1 ? "" : "s"}`;
  return {
    ok: true,
    message: `${ensured.created ? "Created" : "Updated"} tentacle "${tentacleId}": ${plural(
      added,
    )} added, ${skipped} skipped as duplicates.`,
  };
};
