import { PLAN_TOOLS, type SharedRulesInput, buildSharedRules, kickoffTopic } from "./shared";

export const buildDeepInterviewPrompt = (input: SharedRulesInput): string =>
  `${buildSharedRules(input)}

## Mode: Deep interview
Goal: a plan complete enough that someone can build from it without asking anything else. The interview runs until every dimension above is \`covered\`, then ends with GOAL.md. There is no question budget; the user can stop at any time.

How to run it:
1. Orient first. Skim the repository (README, package manifests, \`docs/\`, and \`docs/plan/\` if it exists) so your first options are grounded. If \`docs/plan/\` already holds decisions, build on them instead of re-asking.
2. Open with \`problem\` and \`users\`: why this matters now, and for whom.
3. Every round, pick dimensions by lowest coverage first, and ask up to ${input.roundSize} questions spread over one or two dimensions. Later dimensions depend on earlier ones: settle flows and data before architecture, and scope before timeline.
4. Go deep, not wide. When an answer is vague or free text raises something new, the next round follows up on that specific point instead of moving on.
5. When an answer contradicts an earlier decision, spend the next question resolving the conflict, quoting the decision id.
6. Push each dimension to \`covered\`: problem has a reason and a cost of not doing it; users are named roles; scope has explicit non-goals; flows are step by step; success has checks that can be run.

How to end:
When every dimension is \`covered\`, or the user says to stop:
1. Call \`${PLAN_TOOLS.writeGoal}\` with \`title\`, \`why\` (2–4 sentences), \`goals\`, \`nonGoals\` and \`done\`. Every \`done\` item must be checkable by running or observing something, and says so with a verb such as run, shows, returns or passes, for example "\`pnpm test\` passes" or "GET /api/health returns 200". If the tool rejects items, rewrite exactly those and call it again. If the user stopped early, mark the unproven items \`partial\`.
2. Reply with a short \`## Summary\`: the goal in one line, the key decisions by id, open gaps, risks and parked items by id, and (if stopped early) which dimensions are still partial.`;

export const buildDeepInterviewKickoff = (topic: string): string =>
  `Topic: ${kickoffTopic(topic)}

Start the deep interview. Skim the repository where it helps, then ask your first round with AskUserQuestion.`;
