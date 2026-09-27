// v2 prompts and pure transforms for harvest (D31) and the Octogent handoff (D45, D47).
// Prompts inline everything the headless pass needs, so Claude reads files only to check.
import type { Decision, HandoffTentacle, HandoffTodo, Stage } from "@octogent/octoplan-protocol";
import type {
  BuildHandoffPrompt,
  BuildHarvestPrompt,
  BuildOctopusPrompt,
  FallbackHandoff,
  NormalizeHandoff,
} from "./v2Types";

/** Same text as integrations/octogentExport.ts (copied, not imported: different tentacle). */
export const DONE_WHEN_FALLBACK =
  "Done when the change is in place and a test or command you ran shows it works.";

const HARVEST_MAX = 5;
const HARVEST_COMMITS_MAX = 50;
const COMMIT_BODY_MAX = 200;
const ID_MAX = 40;

/** Done-when lines every stage prompt carries; not worth a todo of their own. */
const GENERIC_DONE =
  /existing tests and type-check still pass|full test suite and type-check pass|works and is covered by a test$/i;

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();

const clip = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 3).trimEnd()}...`;

const decisionList = (decisions: readonly Decision[]): string => {
  const active = decisions.filter((decision) => decision.status === "active");
  return active.length > 0
    ? active.map((d) => `- ${d.id} — ${oneLine(d.title)}`).join("\n")
    : "- (no active decisions)";
};

/** Octogent tentacle id: lowercase letters, digits and dashes, max 40, never empty. */
export const slugId = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, ID_MAX)
    .replace(/-+$/, "");

/** One line that ends with (or contains) a "Done when …" clause. */
const withDoneWhen = (text: string): string => {
  let line = oneLine(text);
  if (!/\bDone when\b/i.test(line)) {
    if (!/[.!?]$/.test(line)) line = `${line}.`;
    line = `${line} ${DONE_WHEN_FALLBACK}`;
  }
  return line;
};

export const buildHarvestPrompt: BuildHarvestPrompt = ({ inputs, decisions, knownTitles }) => {
  const commits = inputs.commits.slice(0, HARVEST_COMMITS_MAX);
  const commitLines =
    commits.length > 0
      ? commits
          .map((c) => {
            const body = oneLine(c.body);
            return `- ${c.sha.slice(0, 7)} (${c.branch}) ${oneLine(c.subject)}${body ? ` — ${clip(body, COMMIT_BODY_MAX)}` : ""}`;
          })
          .join("\n")
      : "- (no new commits)";
  const todoLines =
    inputs.todos.length > 0
      ? inputs.todos
          .map(
            (t) =>
              `- ${t.tentacleId}: done ${t.done.length > 0 ? t.done.map(oneLine).join(" | ") : "(none)"}; open ${t.open.length > 0 ? t.open.map(oneLine).join(" | ") : "(none)"}`,
          )
          .join("\n")
      : "- (no tentacle todos)";
  const known =
    knownTitles.length > 0
      ? knownTitles.map((title) => `- ${oneLine(title)}`).join("\n")
      : "- (none yet)";
  return `# Octoplan harvest (read-only)

Find build-time decisions: choices made while building that the plan below doesn't record yet. This pass is read-only: never edit files. You may Read/Grep the repo to confirm what a commit did.

## Commits since the last harvest
${commitLines}

## Tentacle todos now
${todoLines}

## Active decisions (docs/plan/DECISIONS.md)
${decisionList(decisions)}

## Already proposed — never propose these again
${known}

## What to do
- Call plan_add_harvest once per NEW build-time decision, at most ${HARVEST_MAX} in total.
- title: the choice in one short line. body: one or two sentences on what was chosen and why.
- source: the commit sha (sourceKind "commit"), or \`todo:<tentacleId>\` (sourceKind "todo").
- contradicts: the D-ids above this choice conflicts with; [] when it conflicts with none.
- Skip anything an active decision already records, routine refactors, fixes and chores.
- If there is nothing new, call nothing and reply "No new decisions."`;
};

export const buildHandoffPrompt: BuildHandoffPrompt = ({
  snapshot,
  stages,
  existing,
  repoTree,
  heading,
}) => {
  const goal = snapshot.goal;
  const goalText = goal
    ? `${oneLine(goal.title)}\n${oneLine(goal.why)}\n\nGoals:\n${goal.goals.map((g) => `- ${oneLine(g)}`).join("\n") || "- (none)"}\n\nDefinition of done:\n${goal.done.map((d) => `- ${d.id}: ${oneLine(d.text)}`).join("\n") || "- (none)"}`
    : "(no GOAL.md)";
  const stageText =
    stages.length > 0
      ? stages
          .map(
            (s) =>
              `- Stage ${s.index}: ${oneLine(s.title)} — decisions: ${stageDecisionIds(s).join(", ") || "(none)"}`,
          )
          .join("\n")
      : "- (no stages generated; group todos by the plan's own waves or goals)";
  const existingText =
    existing.length > 0
      ? existing
          .map(
            (t) =>
              `- ${t.id} (${oneLine(t.name)}): owns ${t.owns.join(", ") || "(nothing listed)"}; todos ${t.todoDone}/${t.todoTotal}`,
          )
          .join("\n")
      : "- (none yet)";
  const tree = repoTree.length > 0 ? repoTree.map((path) => `- ${path}`).join("\n") : "- (empty)";
  return `# Octoplan handoff: split the plan into Octogent tentacles (read-only)

Turn the plan below into Octogent tentacles, each with one-line todos. This pass is read-only: never edit files. Read or Glob the repo only to check folder ownership.

## Goal
${goalText}

## Active decisions (docs/plan/DECISIONS.md)
${decisionList(snapshot.decisions)}

## Stages, in build order (use their titles as wave names)
${stageText}

## Existing tentacles in the workspace
${existingText}

## Repo folders (two levels)
${tree}

## Rules
- 3–8 tentacles. Each owns disjoint repo folders chosen from the list above (owns = repo-relative paths); no folder belongs to two tentacles.
- Reuse an existing tentacle when its owned folders match the work: same id, existing=true. New tentacles: existing=false, id = lowercase letters, digits and dashes.
- Every todo is a single line that ends in "Done when …" with a check someone can run (a test, a command, a visible result).
- Stamp each todo with the D-ids it implements (decisionIds, from the active decisions only).
- Group todos by wave: wave = the stage title it belongs to, e.g. "${oneLine(stages[0]?.title ?? "Wave 1")}". Contracts and shared types come first in the earliest wave.
- name: a short human name; description: one sentence on what the tentacle builds.
- Todos go under "## ${oneLine(heading)}" in each tentacle's todo.md; don't repeat that heading in the text.
- Call plan_propose_handoff exactly once with every tentacle, then stop.`;
};

/** A stage's decision ids: its own field, else the ids listed in its prompt's decisions section. */
const stageDecisionIds = (stage: Stage): string[] => {
  if (stage.decisionIds && stage.decisionIds.length > 0) return [...stage.decisionIds];
  const section = /## Decisions this stage relies on\n([\s\S]*?)(?:\n## |$)/.exec(stage.prompt);
  return [...(section?.[1] ?? "").matchAll(/^- (D\d+)\b/gm)].map((match) => match[1] ?? "");
};

/** The unchecked items of a stage prompt's "## Done when" section, without their DoD ids. */
const stageDoneItems = (stage: Stage): string[] => {
  const section = /## Done when\n([\s\S]*?)(?:\n## |$)/.exec(stage.prompt);
  const items = [...(section?.[1] ?? "").matchAll(/^- \[[ xX]\] (.+)$/gm)]
    .map((match) => oneLine((match[1] ?? "").replace(/^DOD[-\w]*:\s*/i, "")))
    .filter((text) => text.length > 0 && !GENERIC_DONE.test(text));
  return items.length > 0 ? items : stage.goal.trim() ? [oneLine(stage.goal)] : [];
};

const citedIds = (text: string): string[] => [
  ...new Set([...text.matchAll(/\bD(\d+)\b/g)].map((match) => `D${match[1]}`)),
];

export const fallbackHandoff: FallbackHandoff = ({ snapshot, stages, existing }) => {
  const known = new Set(snapshot.decisions.map((decision) => decision.id));
  const tentacles: HandoffTentacle[] = existing.map((t) => ({
    id: t.id,
    name: t.name || t.id,
    description: t.description,
    owns: [...t.owns],
    existing: true,
    todos: [],
  }));
  const seen = new Set<string>();
  for (const stage of [...stages].sort((a, b) => a.index - b.index)) {
    const title = oneLine(stage.title) || `Stage ${stage.index}`;
    const stageIds = stageDecisionIds(stage).filter((id) => known.has(id));
    const todos: HandoffTodo[] = [];
    for (const text of stageDoneItems(stage)) {
      // The final stage repeats every DoD item: each lands once, in its earliest stage.
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const cited = citedIds(text).filter((id) => known.has(id));
      todos.push({
        text: withDoneWhen(text),
        decisionIds: cited.length > 0 ? cited : stageIds,
        wave: title,
      });
    }
    if (todos.length === 0) continue;
    // A stage that names an existing tentacle's folder is that tentacle's work.
    const owner = tentacles.find(
      (t) => t.existing && t.owns.some((path) => path.trim() && stage.prompt.includes(path.trim())),
    );
    if (owner) {
      owner.todos.push(...todos);
      continue;
    }
    tentacles.push({
      id: slugId(title) || `stage-${stage.index}`,
      name: title,
      description: oneLine(stage.goal),
      owns: [],
      existing: false,
      todos,
    });
  }
  return tentacles;
};

export const normalizeHandoff: NormalizeHandoff = (tentacles, existing, decisions) => {
  const known = new Set(decisions.map((decision) => decision.id));
  const existingById = new Map(existing.map((t) => [t.id, t]));
  const merged = new Map<string, HandoffTentacle>();
  tentacles.forEach((raw, i) => {
    const id = slugId(raw.id) || slugId(raw.name) || `tentacle-${i + 1}`;
    const todos: HandoffTodo[] = raw.todos.flatMap((todo) => {
      const text = oneLine(todo.text);
      if (!text) return [];
      return [
        {
          text: withDoneWhen(text),
          decisionIds: [...new Set(todo.decisionIds.map((d) => d.trim()))].filter((d) =>
            known.has(d),
          ),
          wave: oneLine(todo.wave),
        },
      ];
    });
    const owns = raw.owns.map((path) => path.trim()).filter(Boolean);
    const current = merged.get(id);
    if (!current) {
      merged.set(id, {
        id,
        name: oneLine(raw.name),
        description: oneLine(raw.description),
        owns: [...new Set(owns)],
        existing: false,
        todos: [],
      });
    }
    const target = merged.get(id);
    if (!target) return;
    if (!target.name) target.name = oneLine(raw.name);
    if (!target.description) target.description = oneLine(raw.description);
    target.owns = [...new Set([...target.owns, ...owns])];
    for (const todo of todos) {
      if (!target.todos.some((t) => t.text === todo.text && t.wave === todo.wave)) {
        target.todos.push(todo);
      }
    }
  });
  return [...merged.values()].flatMap((t) => {
    const found = existingById.get(t.id);
    const next: HandoffTentacle = {
      ...t,
      existing: Boolean(found),
      name: t.name || oneLine(found?.name ?? "") || t.id,
      description: t.description || oneLine(found?.description ?? ""),
      owns: t.owns.length > 0 ? t.owns : [...(found?.owns ?? [])],
    };
    return next.todos.length > 0 || next.existing ? [next] : [];
  });
};

/** Waves in first-seen order across the tentacles' todos, each with the tentacles working in it. */
const wavesOf = (tentacles: readonly HandoffTentacle[]): Array<[string, string[]]> => {
  const waves = new Map<string, string[]>();
  for (const t of tentacles) {
    for (const todo of t.todos) {
      const wave = todo.wave || "Unscheduled";
      const ids = waves.get(wave) ?? [];
      if (!ids.includes(t.id)) ids.push(t.id);
      waves.set(wave, ids);
    }
  }
  return [...waves.entries()];
};

export const buildOctopusPrompt: BuildOctopusPrompt = ({ plan, goal, decisions }) => {
  const title = oneLine(goal?.title ?? "") || oneLine(plan.heading);
  const cell = (text: string) => text.replace(/\|/g, "\\|");
  const table = plan.tentacles
    .map(
      (t) =>
        `| ${t.id} | ${cell(t.owns.join(", ") || "(see CONTEXT.md)")} | ${t.todos.length} | ${t.existing ? "reused" : "new"} |`,
    )
    .join("\n");
  const waves = wavesOf(plan.tentacles);
  const waveText =
    waves.length > 0
      ? waves.map(([wave, ids], i) => `${i + 1}. **${wave}** — ${ids.join(", ")}`).join("\n")
      : "1. (no todos yet)";
  const decisionIds = decisions.filter((d) => d.status === "active").map((d) => d.id);
  return `# Octopus — ${title}

You coordinate the build of "${title}" across Octogent tentacles. This prompt is self-contained: the plan lives in docs/plan (GOAL.md, DECISIONS.md), and each tentacle's work is in \`.octogent/tentacles/<id>/\` (CONTEXT.md + todo.md, under "## ${oneLine(plan.heading)}").

## Goal
${oneLine(goal?.why ?? "") || "(see docs/plan/GOAL.md)"}
${goal && goal.goals.length > 0 ? `\n${goal.goals.map((g) => `- ${oneLine(g)}`).join("\n")}\n` : ""}
## Tentacles
| id | owns | todos | |
| --- | --- | --- | --- |
${table || "| (none) | | 0 | |"}

## Waves, in order
${waveText}

## Rules
- Contracts first: at the start of each wave, commit the shared types and interfaces the wave's tentacles build against, before any worker starts.
- One worker per tentacle, each only in its own folders; folders never overlap, so workers run in parallel.
- Every commit message cites the D-ids it implements (e.g. "feat: dock [D14]")${decisionIds.length > 0 ? `; the active decisions are ${decisionIds[0]}–${decisionIds.at(-1)}` : ""}.
- Nobody edits docs/plan: decisions change only through Octoplan. If a decision looks wrong, stop and tell the user.
- Stop after each wave: run the tests, report what landed, and wait for the user to test it before starting the next wave.

## How to start
1. Open Octogent's Deck for this workspace${plan.workspace ? ` (${plan.workspace})` : ""}.
2. Seed the first wave's contracts, then spawn one agent per tentacle in that wave from the Deck.
3. Review each tentacle's diff against its todo.md "Done when" checks before merging.`;
};
