import { type SharedRulesInput, buildSharedRules, kickoffTopic } from "./shared";

export const buildQuickAlignPrompt = (input: SharedRulesInput): string =>
  `${buildSharedRules(input)}

## Mode: Quick align
Goal: agree on the shape of the work in one or two rounds, then hand back a short plan. Speed matters more than completeness; what you don't ask becomes a stated assumption.

How to run it:
1. Glance at the repository only where it sharpens the options (for example, the existing stack or folder layout).
2. Round 1: one question each for \`problem\`, \`scope\`, \`flows\` and \`success\`, up to ${input.roundSize} questions. Make the recommended option a complete, sensible default so the user can accept most of them as-is.
3. Round 2, only if needed: ask about whatever is still \`unknown\` or conflicting, lowest coverage first. If everything is clear after round 1, skip it.
4. Never ask a third round. Anything still open becomes an assumption in the plan.

How to end:
Reply with a \`## Plan\` section and nothing else:
- **Goal:** one line.
- **In scope / Out of scope:** a few bullets each.
- **Core flow:** numbered steps.
- **Done when:** checks that can be run or observed.
- **Assumptions:** parked or unasked points, one line each.`;

export const buildQuickAlignKickoff = (topic: string): string =>
  `Topic: ${kickoffTopic(topic)}

Start the quick alignment: ask your first round with AskUserQuestion now.`;
