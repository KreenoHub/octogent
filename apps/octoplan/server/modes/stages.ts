// Staged build prompts (wave 2): GOAL.md + DECISIONS.md -> self-contained "build one stage,
// then stop" prompts. Deterministic: the same plan always yields the same stages.
import type { Decision, DoneCriterion, GoalDoc, Stage } from "@octogent/octoplan-protocol";
import type { BuildStages } from "./wave2Types";

/** Build stages carry the DoD items; one final stage verifies everything end to end. */
const MAX_BUILD_STAGES = 4;
const TITLE_MAX = 60;

const STOPWORDS = new Set([
  "the",
  "and",
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

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();

const words = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 4 && !STOPWORDS.has(word)),
  );

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

const truncate = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

/** Decisions whose title/body share a meaningful word with the stage's items; all if none do. */
const relevantDecisions = (
  items: readonly DoneCriterion[],
  active: readonly Decision[],
): Decision[] => {
  const stageWords = words(items.map((item) => item.text).join(" "));
  const matched = active.filter((decision) =>
    [...words(`${decision.title} ${decision.body}`)].some((word) => stageWords.has(word)),
  );
  return matched.length > 0 ? matched : [...active];
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

const decisionsSection = (decisions: readonly Decision[]): string =>
  decisions.length > 0
    ? `## Decisions this stage relies on
${decisions.map((d) => `- ${d.id} — ${oneLine(d.title)}`).join("\n")}
Follow these decisions. If one turns out to be wrong, stop and say so instead of working around it.`
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

const stopLine = (index: number, total: number): string =>
  index < total
    ? `STOP after the testing checkpoint. Don't start stage ${index + 1}: report what you built, the commands you ran and their output, then wait for the user to test it and say "continue".`
    : "STOP after the testing checkpoint. This is the last stage: report each Done-when item with its evidence, then wait for the user to sign off.";

export const buildStages: BuildStages = (goal, decisions) => {
  if (goal.done.length === 0) {
    throw new Error(
      "Can't build stages: GOAL.md has no definition of done items. Write the goal (with checkable DoD items) first.",
    );
  }
  const active = decisions.filter((decision) => decision.status === "active");
  const buildChunks = chunk(goal.done, Math.min(MAX_BUILD_STAGES, goal.done.length));
  const total = buildChunks.length + 1;
  const title = oneLine(goal.title);

  const buildTitles = buildChunks.map((items) =>
    truncate(oneLine(items[0]?.text ?? "Build"), TITLE_MAX),
  );
  const titles = [...buildTitles, "Integrate and verify end to end"];

  const header = (index: number) =>
    `# ${title} — Stage ${index} of ${total}: ${titles[index - 1]}

You are building one stage of "${title}". Build only this stage, then stop at its testing checkpoint. This prompt is self-contained: you don't need any earlier chat.`;

  const buildStagesList: Stage[] = buildChunks.map((items, i) => {
    const index = i + 1;
    const prompt = `${header(index)}

${contextSection(goal)}

${previousSection(index, titles)}

## Build this stage
Make these definition-of-done items true, and only these:
${items.map((item) => `- ${item.id}: ${oneLine(item.text)}`).join("\n")}

${decisionsSection(relevantDecisions(items, active))}

## Done when
${items.map(doneLine).join("\n")}
- [ ] The project's existing tests and type-check still pass.

## Testing checkpoint
Run the command behind each Done-when item and paste its real output. Tick an item only with that evidence; if one fails, fix it within this stage's scope or report it as open.

${stopLine(index, total)}`;
    return {
      index,
      title: titles[i] ?? `Stage ${index}`,
      goal: `Make ${items.map((item) => item.id).join(", ")} true.`,
      prompt,
    };
  });

  const verifyPrompt = `${header(total)}

${contextSection(goal)}

${previousSection(total, titles)}

## Build this stage
Wire the stages together and close the gaps between them. Don't add features beyond GOAL.md; anything new goes in a note for the user, not in code.

${decisionsSection(active)}

## Done when
${goal.done.map(doneLine).join("\n")}
- [ ] The full test suite and type-check pass from a clean checkout.

## Testing checkpoint
Re-run every Done-when check from scratch, in order, and paste the output of each. Report any item that fails with what you tried.

${stopLine(total, total)}`;

  return [
    ...buildStagesList,
    {
      index: total,
      title: titles[total - 1] ?? "Integrate and verify end to end",
      goal: "Every definition-of-done item in GOAL.md passes, checked end to end.",
      prompt: verifyPrompt,
    },
  ];
};
