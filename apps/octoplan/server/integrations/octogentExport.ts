// Export a plan into an Octogent tentacle (`<repo>/.octogent/tentacles/<id>/`).
// Deck reads CONTEXT.md's first `# Heading` as the name and the first paragraph as the
// description, and only `- [ ] ` / `- [x] ` lines of todo.md as work items (docs/concepts/tentacles.md).
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Decision, GoalDoc } from "@octogent/octoplan-protocol";
import type { Exec, ExportToTentacleInput, ExportToTentacleResult } from "./types";

export const START_OCTOGENT_MESSAGE = "Start Octogent in this repo first (run `octogent` there)";
export const DONE_WHEN_FALLBACK =
  "Done when the change is in place and a test or command you ran shows it works.";

const MANAGED_BLOCK =
  /<!-- octogent:suggested-skills:start -->[\s\S]*?<!-- octogent:suggested-skills:end -->/;
const TODO_ITEM = /^- \[[ xX]\] (.*)$/;
const TENTACLE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();

/** Collapse a task to a single `- [ ] ` line that ends in a "Done when …" clause. */
export const toTodoLine = (task: string): string | null => {
  let text = oneLine(task).replace(/^[-*]\s+(\[[ xX]\]\s+)?/, "");
  if (!text) return null;
  if (!/\bDone when\b/i.test(text)) {
    if (!/[.!?]$/.test(text)) text = `${text}.`;
    text = `${text} ${DONE_WHEN_FALLBACK}`;
  }
  return `- [ ] ${text}`;
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
  const sentence = /^(.+?[.!?])(\s|$)/.exec(description)?.[1] ?? description;
  return sentence.length > 160 ? `${sentence.slice(0, 157)}...` : sentence;
};

const list = (items: readonly string[]) => items.map((item) => `- ${oneLine(item)}`);

export const renderContext = (
  tentacleId: string,
  goal: GoalDoc | null,
  decisions: readonly Decision[],
): string => {
  const active = decisions.filter((d) => d.status === "active");
  const lines = [`# ${oneLine(goal?.title ?? "") || tentacleId}`, "", describe(goal, active)];
  const section = (heading: string, body: string[]) => {
    if (body.length > 0) lines.push("", `## ${heading}`, "", ...body);
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
    "Active decisions",
    active.map((d) => {
      const summary = oneLine(d.body.split(/\r?\n/).find((l) => l.trim()) ?? "");
      return `- **${d.id} — ${oneLine(d.title)}**${summary ? `: ${summary}` : ""}`;
    }),
  );
  lines.push(
    "",
    "_Exported from Octoplan (GOAL.md + active decisions). Octoplan rewrites this file on each export, except the suggested-skills block._",
  );
  return lines.join("\n");
};

/** Replace everything except the Octogent-managed suggested-skills block. */
export const mergeContext = (existing: string | null, human: string): string => {
  const block = existing ? MANAGED_BLOCK.exec(existing)?.[0] : undefined;
  return block ? `${human}\n\n${block}\n` : `${human}\n`;
};

export const appendTodos = (
  existing: string | null,
  tasks: readonly string[],
): { content: string; added: number; skipped: number } => {
  const base = existing ?? "# Todo\n";
  const seen = new Set(
    base
      .split(/\r?\n/)
      .map((line) => TODO_ITEM.exec(line.trim())?.[1]?.trim())
      .filter((text): text is string => Boolean(text)),
  );
  const lines: string[] = [];
  let skipped = 0;
  for (const task of tasks) {
    const line = toTodoLine(task);
    if (!line) continue;
    const text = line.slice("- [ ] ".length);
    if (seen.has(text)) {
      skipped += 1;
      continue;
    }
    seen.add(text);
    lines.push(line);
  }
  if (lines.length === 0) return { content: base, added: 0, skipped };
  let content = base.endsWith("\n") ? base : `${base}\n`;
  if (!TODO_ITEM.test(content.trimEnd().split(/\r?\n/).pop() ?? "")) content = `${content}\n`;
  return { content: `${content}${lines.join("\n")}\n`, added: lines.length, skipped };
};

const readIfExists = async (file: string): Promise<string | null> => {
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
};

export const exportToTentacle = async (
  exec: Exec,
  input: ExportToTentacleInput,
): Promise<ExportToTentacleResult> => {
  const { repoPath, tentacleId } = input;
  if (!TENTACLE_ID.test(tentacleId) || tentacleId.includes("..")) {
    return {
      ok: false,
      message: `"${tentacleId}" is not a valid tentacle id (letters, digits, . _ - only).`,
    };
  }

  const dir = join(repoPath, ".octogent", "tentacles", tentacleId);
  const human = renderContext(tentacleId, input.goal, input.decisions);
  let created = false;

  if (!existsSync(dir)) {
    const description = shortDescription(
      describe(
        input.goal,
        input.decisions.filter((d) => d.status === "active"),
      ),
    );
    const result = await exec(
      "octogent",
      ["tentacle", "create", tentacleId, "--description", description],
      repoPath,
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
        message: `Octogent created "${tentacleId}" outside ${repoPath}. ${START_OCTOGENT_MESSAGE}.`,
      };
    }
    created = true;
  }

  await mkdir(dir, { recursive: true });
  const contextFile = join(dir, "CONTEXT.md");
  await writeFile(contextFile, mergeContext(await readIfExists(contextFile), human), "utf8");

  const todoFile = join(dir, "todo.md");
  const todo = appendTodos(await readIfExists(todoFile), input.tasks);
  await writeFile(todoFile, todo.content, "utf8");

  const plural = (n: number) => `${n} task${n === 1 ? "" : "s"}`;
  return {
    ok: true,
    message: `${created ? "Created" : "Updated"} tentacle "${tentacleId}": ${plural(
      todo.added,
    )} added, ${todo.skipped} skipped as duplicates.`,
  };
};
