// Staged build prompts (wave 2): GOAL.md + DECISIONS.md -> self-contained "build one stage,
// then stop" prompts. Deterministic: the same plan always yields the same stages.
//
// When the active decisions define waves ("Wave 3 (focus): dock, answer chips, …"), each wave
// becomes one build stage and gate items (e2e, full test runs, a week of real use) wait for
// the final stage. Otherwise the definition of done is cut into ≤4 contiguous chunks.
import type { Decision, DoneCriterion, GoalDoc, Stage } from "@octogent/octoplan-protocol";
import type { BuildStages } from "./wave2Types";

/** Build stages carry the DoD items; one final stage verifies everything end to end. */
const MAX_BUILD_STAGES = 4;
/** A stage prompt cites at most this many decisions (the rest live in DECISIONS.md). */
const MAX_STAGE_DECISIONS = 12;
const TITLE_WORDS = 5;
const FINAL_TITLE = "Integrate and verify end to end";
const LEFTOVER_TITLE = "Remaining goals";

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "are",
  "its",
  "not",
  "all",
  "any",
  "one",
  "with",
  "from",
  "that",
  "this",
  "into",
  "when",
  "then",
  "have",
  "passes",
  "pass",
  "test",
  "tests",
  "runs",
  "uses",
  "lives",
  "each",
  "every",
  "should",
  "must",
]);

/** Short title words to skip (articles, prepositions) on top of STOPWORDS. */
const TITLE_SKIP = new Set(["a", "an", "in", "of", "to", "on", "at", "is", "it", "be", "by", "or"]);

const SUFFIXES = ["ation", "ence", "ance", "ing", "ed", "s"];

const DONE_GENERIC = "The project's existing tests and type-check still pass.";
const DONE_FINAL_GENERIC = "The full test suite and type-check pass from a clean checkout.";

/** DoD items that only a finished product can pass: they wait for the final stage. */
const GATE_ITEM = /\be2e\b|\bgate\b|week of real|\btype-checks?\b|\bfull test suite\b/i;

const WAVE_LINE =
  /^[ \t]*(?:[-*][ \t]+)?\**Wave[ \t]+(\d+)\**[ \t]*(?:\(([^)\n]+)\)|[—–-][ \t]*([^:\n]+?))?[ \t]*:[ \t]*(.+)$/gim;

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();

const stem = (word: string): string => {
  for (const suffix of SUFFIXES) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
};

const words = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 3 && !STOPWORDS.has(word))
      .map(stem),
  );

const overlap = (a: ReadonlySet<string>, b: ReadonlySet<string>): number => {
  let hits = 0;
  for (const word of a) if (b.has(word)) hits += 1;
  return hits;
};

/** D-ids cited in `text`, in order of first mention. */
const citedIds = (text: string): string[] => [
  ...new Set([...text.matchAll(/\bD(\d+)\b/g)].map((match) => `D${match[1]}`)),
];

const idNumber = (id: string): number => Number.parseInt(id.replace(/^\D+/, ""), 10) || 0;
const byIdOrder = (a: string, b: string) => idNumber(a) - idNumber(b);

/** Split `items` into `count` contiguous chunks, earlier chunks taking the remainder. */
const chunk = <T>(items: readonly T[], count: number): T[][] => {
  const base = Math.floor(items.length / count);
  const extra = items.length % count;
  const chunks: T[][] = [];
  let at = 0;
  for (let i = 0; i < count; i += 1) {
    const size = base + (i < extra ? 1 : 0);
    chunks.push(items.slice(at, at + size));
    at += size;
  }
  return chunks;
};

/** The first few meaningful words of `text` (code spans dropped), never ending in "…". */
const shortTitle = (text: string, fallback: string): string => {
  const picked = text
    .replace(/`[^`]*`/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((word) => /^\p{L}/u.test(word))
    .filter((word) => !STOPWORDS.has(word.toLowerCase()) && !TITLE_SKIP.has(word.toLowerCase()))
    .slice(0, TITLE_WORDS)
    .join(" ");
  return picked ? `${picked.charAt(0).toUpperCase()}${picked.slice(1)}` : fallback;
};

/** Active decisions by id. */
type DecisionIndex = ReadonlyMap<string, Decision>;

/** `direct` ids plus one level of their depends-on, known ids only, capped, in id order. */
const withDependsOn = (direct: readonly string[], index: DecisionIndex): string[] => {
  const ids = [...new Set(direct)].filter((id) => index.has(id)).sort(byIdOrder);
  for (const id of [...ids]) {
    for (const dep of index.get(id)?.dependsOn ?? []) {
      if (index.has(dep) && !ids.includes(dep)) ids.push(dep);
    }
  }
  return ids.slice(0, MAX_STAGE_DECISIONS).sort(byIdOrder);
};

/**
 * The decisions a stage relies on: the D-ids its texts cite plus their depends-on. Only when
 * nothing is cited, the decisions sharing the most words with the texts (all, if none share).
 */
const relevantIds = (texts: readonly string[], index: DecisionIndex): string[] => {
  const cited = citedIds(texts.join("\n")).filter((id) => index.has(id));
  if (cited.length > 0) return withDependsOn(cited, index);
  const stageWords = words(texts.join(" "));
  const active = [...index.values()];
  const scored = active
    .map((decision, order) => ({
      decision,
      order,
      score: overlap(words(`${decision.title} ${decision.body}`), stageWords),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order);
  const picked = scored.length > 0 ? scored.map((entry) => entry.decision) : active;
  return picked
    .slice(0, MAX_STAGE_DECISIONS)
    .map((decision) => decision.id)
    .sort(byIdOrder);
};

type Wave = { number: number; name: string; items: string[] };

/** Wave definitions in the active decisions; a later decision redefining a wave wins. */
const parseWaves = (active: readonly Decision[]): Wave[] => {
  const waves = new Map<number, Wave>();
  for (const decision of active) {
    for (const match of decision.body.matchAll(WAVE_LINE)) {
      const number = Number.parseInt(match[1] ?? "", 10);
      const items = (match[4] ?? "")
        .split(/[,;]/)
        .map((item) => oneLine(item).replace(/[.]+$/, ""))
        .filter((item) => item.length > 0);
      if (!Number.isFinite(number) || items.length === 0) continue;
      waves.set(number, { number, name: oneLine(match[2] ?? match[3] ?? ""), items });
    }
  }
  return [...waves.values()].sort((a, b) => a.number - b.number);
};

const bulletList = (items: readonly string[], empty: string): string =>
  items.length > 0 ? items.map((item) => `- ${oneLine(item)}`).join("\n") : empty;

const contextSection = (goal: GoalDoc): string =>
  `## Project context
${oneLine(goal.why) || "(GOAL.md gives no why.)"}

Goals:
${bulletList(goal.goals, "- (none listed)")}

Non-goals (don't build these):
${bulletList(goal.nonGoals, "- (none listed)")}`;

const decisionsSection = (ids: readonly string[], index: DecisionIndex): string =>
  ids.length > 0
    ? `## Decisions this stage relies on
${ids.map((id) => `- ${id} — ${oneLine(index.get(id)?.title ?? "")}`).join("\n")}
Follow these decisions (the rest are in docs/plan/DECISIONS.md). If one turns out to be wrong, stop and say so instead of working around it.`
    : `## Decisions this stage relies on
- No recorded decisions constrain this stage. Don't invent new ones; if a real choice comes up, stop and ask the user.`;

const previousSection = (index: number, titles: readonly string[]): string =>
  index === 1
    ? "## Where you are\nThis is the first stage. Start from the current state of the repository."
    : `## Where you are\nStages 1–${index - 1} are done and tested:\n${titles
        .slice(0, index - 1)
        .map((title, i) => `${i + 1}. ${title}`)
        .join("\n")}\nBuild on them; don't redo or refactor them unless this stage needs it.`;

const doneLine = (item: DoneCriterion): string => `- [ ] ${item.id}: ${oneLine(item.text)}`;
const checkLine = (text: string): string => `- [ ] ${oneLine(text)}`;

const stopLine = (index: number, total: number): string =>
  index < total
    ? `STOP after the testing checkpoint. Don't start stage ${index + 1}: report what you built, the commands you ran and their output, then wait for the user to test it and say "continue".`
    : "STOP after the testing checkpoint. This is the last stage: report each Done-when item with its evidence, then wait for the user to sign off.";

/** What one build stage is made of, before it is rendered into a prompt. */
type BuildSpec = {
  title: string;
  goal: string;
  /** The "## Build this stage" body. */
  build: string;
  /** Checkbox lines for "## Done when" (the generic tests line is added after them). */
  done: string[];
  decisionIds: string[];
};

const chunkSpecs = (goal: GoalDoc, index: DecisionIndex): BuildSpec[] =>
  chunk(goal.done, Math.min(MAX_BUILD_STAGES, goal.done.length)).map((items, i) => ({
    title: shortTitle(items[0]?.text ?? "", `Stage ${i + 1}`),
    goal: `Make ${items.map((item) => item.id).join(", ")} true.`,
    build: `Make these definition-of-done items true, and only these:
${items.map((item) => `- ${item.id}: ${oneLine(item.text)}`).join("\n")}`,
    done: items.map(doneLine),
    decisionIds: relevantIds(
      items.map((item) => item.text),
      index,
    ),
  }));

/** One spec per wave, plus a "Remaining goals" spec for work no wave claims. */
const waveSpecs = (
  goal: GoalDoc,
  waves: readonly Wave[],
  index: DecisionIndex,
): { specs: BuildSpec[]; finalItems: DoneCriterion[] } => {
  const active = [...index.values()];
  const itemWords = waves.map((wave) => wave.items.map((item) => words(item)));
  const waveWords = itemWords.map((sets) => new Set(sets.flatMap((set) => [...set])));
  // Decisions a wave item names ("answer chips" -> "Answered rounds collapse to answer chips").
  const named = itemWords.map(
    (sets) =>
      new Set(
        active
          .filter((decision) => {
            const titleWords = words(decision.title);
            return sets.some(
              (set) => set.size > 0 && overlap(set, titleWords) >= Math.min(2, set.size),
            );
          })
          .map((decision) => decision.id),
      ),
  );
  /** The wave `text` belongs to (index), or -1 when no wave scores at least 2. */
  const bestWave = (text: string): number => {
    const textWords = words(text);
    const cited = citedIds(text);
    let best = -1;
    let bestScore = 1;
    waves.forEach((_, i) => {
      const score =
        overlap(textWords, waveWords[i] ?? new Set()) +
        2 * cited.filter((id) => named[i]?.has(id)).length;
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    });
    return best;
  };

  const goalsOf = waves.map((): string[] => []);
  const doneOf = waves.map((): DoneCriterion[] => []);
  const idsOf = waves.map((_, i) => [...(named[i] ?? [])]);
  const leftoverGoals: string[] = [];
  const leftoverDone: DoneCriterion[] = [];
  const leftoverIds: string[] = [];
  const finalItems: DoneCriterion[] = [];

  for (const text of goal.goals) {
    const at = bestWave(text);
    if (at >= 0) goalsOf[at]?.push(text);
    else leftoverGoals.push(text);
    // A cited decision goes to the wave that names it, else wherever its goal went.
    for (const id of citedIds(text)) {
      const namedAt = named.findIndex((set) => set.has(id));
      const target = namedAt >= 0 ? idsOf[namedAt] : at >= 0 ? idsOf[at] : leftoverIds;
      target?.push(id);
    }
  }
  for (const item of goal.done) {
    if (GATE_ITEM.test(item.text)) {
      finalItems.push(item);
      continue;
    }
    const at = bestWave(item.text);
    if (at >= 0) {
      doneOf[at]?.push(item);
      idsOf[at]?.push(...citedIds(item.text));
    } else {
      leftoverDone.push(item);
      leftoverIds.push(...citedIds(item.text));
    }
  }

  const specs: BuildSpec[] = waves.map((wave, i) => {
    const goals = goalsOf[i] ?? [];
    const done = doneOf[i] ?? [];
    const label = wave.name ? `Wave ${wave.number} (${wave.name})` : `Wave ${wave.number}`;
    const doneLines = [...done.map(doneLine), ...goals.map(checkLine)];
    return {
      title: wave.name ? `Wave ${wave.number} — ${wave.name}` : `Wave ${wave.number}`,
      goal: `${label}: ${wave.items.join(", ")}.`,
      build: `${label}. Build these, and only these:
${bulletList(wave.items, "- (no items)")}${goals.length > 0 ? `\n\nThey serve these goals:\n${bulletList(goals, "")}` : ""}${
  done.length > 0
    ? `\n\nDefinition-of-done items this wave makes true:\n${done.map((item) => `- ${item.id}: ${oneLine(item.text)}`).join("\n")}`
    : ""
}`,
      done:
        doneLines.length > 0
          ? doneLines
          : wave.items.map((item) => checkLine(`${item} works and is covered by a test`)),
      decisionIds: withDependsOn(idsOf[i] ?? [], index),
    };
  });

  // Unclaimed gate-free DoD items and goals: one more build stage, so no work is dropped.
  if (leftoverGoals.length > 0 || leftoverDone.length > 0) {
    const texts = [...leftoverGoals, ...leftoverDone.map((item) => item.text)];
    specs.push({
      title: LEFTOVER_TITLE,
      goal:
        leftoverDone.length > 0
          ? `Make ${leftoverDone.map((item) => item.id).join(", ")} true and finish the goals no wave covers.`
          : "Finish the goals no wave covers.",
      build: `Work the plan's waves don't cover. Build these, and only these:
${[
  ...leftoverGoals.map((text) => `- ${oneLine(text)}`),
  ...leftoverDone.map((item) => `- ${item.id}: ${oneLine(item.text)}`),
].join("\n")}`,
      done: [...leftoverDone.map(doneLine), ...leftoverGoals.map(checkLine)],
      decisionIds:
        leftoverIds.length > 0 ? withDependsOn(leftoverIds, index) : relevantIds(texts, index),
    });
  }
  return { specs, finalItems };
};

export const buildStages: BuildStages = (goal, decisions) => {
  if (goal.done.length === 0) {
    throw new Error(
      "Can't build stages: GOAL.md has no definition of done items. Write the goal (with checkable DoD items) first.",
    );
  }
  const active = decisions.filter((decision) => decision.status === "active");
  const index: DecisionIndex = new Map(active.map((decision) => [decision.id, decision]));
  const waves = parseWaves(active);
  const { specs, finalItems } =
    waves.length > 0
      ? waveSpecs(goal, waves, index)
      : { specs: chunkSpecs(goal, index), finalItems: goal.done };
  const total = specs.length + 1;
  const title = oneLine(goal.title);
  const titles = [...specs.map((spec) => spec.title), FINAL_TITLE];

  const header = (at: number) =>
    `# ${title} — Stage ${at} of ${total}: ${titles[at - 1]}

You are building one stage of "${title}". Build only this stage, then stop at its testing checkpoint. This prompt is self-contained: you don't need any earlier chat.`;

  const buildStagesList: Stage[] = specs.map((spec, i) => {
    const at = i + 1;
    const prompt = `${header(at)}

${contextSection(goal)}

${previousSection(at, titles)}

## Build this stage
${spec.build}

${decisionsSection(spec.decisionIds, index)}

## Done when
${spec.done.join("\n")}
${checkLine(DONE_GENERIC)}

## Testing checkpoint
Run the command behind each Done-when item and paste its real output. Tick an item only with that evidence; if one fails, fix it within this stage's scope or report it as open.

${stopLine(at, total)}`;
    return {
      index: at,
      title: spec.title,
      goal: spec.goal,
      prompt,
      decisionIds: spec.decisionIds,
    };
  });

  const finalIds = relevantIds(
    (finalItems.length > 0 ? finalItems : goal.done).map((item) => item.text),
    index,
  );
  const verifyPrompt = `${header(total)}

${contextSection(goal)}

${previousSection(total, titles)}

## Build this stage
Wire the stages together and close the gaps between them. Don't add features beyond GOAL.md; anything new goes in a note for the user, not in code.

${decisionsSection(finalIds, index)}

## Done when
${goal.done.map(doneLine).join("\n")}
${checkLine(DONE_FINAL_GENERIC)}

## Testing checkpoint
Re-run every Done-when check from scratch, in order, and paste the output of each. Report any item that fails with what you tried.

${stopLine(total, total)}`;

  return [
    ...buildStagesList,
    {
      index: total,
      title: FINAL_TITLE,
      goal: "Every definition-of-done item in GOAL.md passes, checked end to end.",
      prompt: verifyPrompt,
      decisionIds: finalIds,
    },
  ];
};
