# Octoplan Question Cards

The heart of Octoplan: AskUserQuestion rounds as keyboard-driven cards you can answer, park, mark tentative, or revise later.

## Owns
- `apps/octoplan/web/src/qcards/`: `QuestionRoundCard`, option rows, the preview panel, the Other input, modifier controls, the answered-history panel, revision UI, and this folder's CSS (`qcards.css`, imported from the folder's index).
- `apps/octoplan/tests/qcards/`.

## Read first
- `docs/octoplan/SPEC.md` §3.2–3.3 (the question loop + modifier encoding), §6 (question card + keyboard map), D7 and D23.
- `packages/octoplan-protocol/src/domain.ts`: `QuestionRound`, `Question` (1–4 per round, 2–4 options each, optional monospace `preview`, `multiSelect`) and `Answer` (`selected`, `otherText`, `modifier: none|tentative|parked`, `assumption`, `revisionOf`).
- `packages/octoplan-protocol/src/answerEncoding.ts`: what Claude will actually receive for your `Answer` objects. Show a preview of that text on the card before confirming.

## What exists
Nothing in `web/src/qcards/` yet. The ui-shell tentacle renders a placeholder where `QuestionRoundCard` mounts and provides `sendClientEvent` through its `useOctoplan()` hook. Until that hook lands, take `onAnswer(answers: Answer[])` / `onRevise(answer: Answer)` props so the card is testable in isolation.

## Contracts
- The public component is `QuestionRoundCard({ round, answered?, onAnswer, onRevise })`, exported from `web/src/qcards/index.ts`. Keep everything else internal.
- The card emits `Answer` objects only; it never builds answer strings. The ui-shell turns them into `answer-round` / `revise-answer` events.
- Protocol changes go through the octopus.

## Keyboard map (must match SPEC §6)
| Key | Action |
|---|---|
| 1–9 | pick |
| Space | toggle (multi-select) |
| O | Other |
| T | tentative |
| P | park, which asks for an assumption and pre-fills it with the "(Recommended)" option's label |
| Tab / Shift+Tab | next / previous question in the round |
| Enter | confirm the round (only when every question has an answer or is parked) |
| R | revise, on a selected answered card |

Keys are scoped to the focused card and never fire inside text inputs except Enter/Esc.

## Constraints
- **The option whose label ends in "(Recommended)" is visually marked.** Keep the label text as-is, because Claude matches answers by label.
- Previews render monospace side by side with the option list when any option has a preview (the same idea as the terminal picker).
- "Why this question": show the `dimension` label (from `COVERAGE_DIMENSION_LABELS`) in a collapsed `<details>`. It's optional and never loud (D7).
- **Answered cards** show the chosen labels, a modifier badge (TENTATIVE / PARKED + assumption), and the revision chain (previous answers struck through, newest last).
- **Accessibility:** use a radiogroup/checkbox semantics per question, and visible focus rings in the accent colour.
- **Don't touch** `apps/web`, `apps/api`, `packages/core`, or other tentacles' folders.

## Test
`pnpm --filter @octogent/octoplan test -- tests/qcards` (jsdom) · `pnpm --filter @octogent/octoplan build` · `pnpm exec biome check apps/octoplan`

## Done means
- A full round of 4 questions (mixed single and multi-select, one with previews) can be answered with the keyboard only, including one parked and one tentative answer.
- Enter emits exactly the expected `Answer[]`.
- A revision emits one `Answer` with `revisionOf` set.
