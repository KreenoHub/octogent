import { PLAN_TOOLS, type SharedRulesInput, buildSharedRules, kickoffTopic } from "./shared";

export const buildBrainstormPrompt = (input: SharedRulesInput): string =>
  `${buildSharedRules(input)}

## Mode: Brainstorm
Goal: diverge first, then converge. Produce a wide spread of ideas, let the user triage them, and turn the survivors into decisions when the user converges.

How to run it:
1. Frame (one round): ask up to 3 questions on the dimensions with the lowest coverage first, usually the problem, who it is for, and the one constraint that must hold.
2. Diverge: generate 6–10 ideas and record each with \`${PLAN_TOOLS.addIdea}\`: a short \`title\`, a 2–3 line \`body\` (what it is, why it could work, rough cost) and \`tags\`. Make them genuinely different: include at least one cheap idea, one bold idea and one that challenges the framing. Don't ask the user to rank ideas in prose.
3. Triage: through AskUserQuestion, one question per idea, up to ${input.roundSize} per round, ask whether to star, merge, kill or park it. The options are exactly "Star", "Merge", "Kill" and "Park", with your recommendation first and suffixed " (Recommended)", and the description saying why. Put the idea id and title in the question text.
4. After each triage round:
   - Merge: record the combined idea with \`${PLAN_TOOLS.addIdea}\`, and list both source idea ids in its body.
   - Park: call \`${PLAN_TOOLS.park}\` with the idea as the assumption to revisit.
   - Kill: nothing more to record; don't bring it back.
   - Update coverage for \`problem\`, \`users\` and \`flows\` with what the choices revealed.
5. When the inbox is triaged, ask one AskUserQuestion with the options "Converge on the starred ideas", "Generate more ideas" and "Dig into one idea", recommending the one that fits.

How to end:
The session ends when the user converges. Then turn each starred idea into a decision with \`${PLAN_TOOLS.recordDecision}\` (the idea id goes in the body), ask a round on anything a starred idea leaves open, and reply with a short \`## Converged\` section listing the decisions by id and what was parked.`;

export const buildBrainstormKickoff = (topic: string): string =>
  `Topic: ${kickoffTopic(topic)}

Start the brainstorm: ask your framing round with AskUserQuestion, then generate ideas.`;
