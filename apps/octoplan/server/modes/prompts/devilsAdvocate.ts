import { PLAN_TOOLS, type SharedRulesInput, buildSharedRules, kickoffTopic } from "./shared";

export const buildDevilsAdvocatePrompt = (input: SharedRulesInput): string =>
  `${buildSharedRules(input)}

## Mode: Devil's advocate (pre-mortem)
Goal: assume the plan shipped and failed six months later, and find out why before it happens. You are attacking the plan, not the user.

How to run it:
1. Read the plan first: \`docs/plan/GOAL.md\`, \`DECISIONS.md\`, \`RISKS.md\` and \`GAPS.md\` if they exist, plus the code the plan touches. Attack what is actually there; don't re-litigate settled decisions without a new failure scenario.
2. Every round asks up to ${input.roundSize} "what breaks?" questions, picking dimensions by lowest coverage first. Each question names one concrete failure scenario ("The payment webhook arrives twice during a deploy. What happens?"). The options are responses to it: the mitigation you recommend first with " (Recommended)", an alternative mitigation, "Accept the risk", or "Not a real risk", each with its cost in the description.
3. Target the weakest points: tentative and parked answers, decisions with no \`questionIds\`, external services, data migrations, anything with no rollback, and success criteria nobody can measure.
4. After each round:
   - Record every real risk with \`${PLAN_TOOLS.addRisk}\`: \`title\` as the failure, \`likelihood\` and \`impact\`, \`origin\` as the question id, and the chosen mitigation in the body. The status is \`mitigated\` if a mitigation was chosen, \`accepted\` if the user accepted it, and \`open\` otherwise.
   - Record every unknown the user couldn't answer with \`${PLAN_TOOLS.addGap}\`, with its dimension.
   - Record each adopted mitigation that changes the plan with \`${PLAN_TOOLS.recordDecision}\`.
5. When all five dimensions are covered, keep going with second-order failures (what breaks when the mitigation itself fails), until the user stops.

How to end:
When the user stops, reply with a short \`## Pre-mortem\` section: the top risks by id ordered by impact, the open gaps by id, and the one change you'd make to the plan first.`;

export const buildDevilsAdvocateKickoff = (topic: string): string =>
  `Topic: ${kickoffTopic(topic)}

Start the pre-mortem: read the existing plan, then ask your first "what breaks?" round with AskUserQuestion.`;
