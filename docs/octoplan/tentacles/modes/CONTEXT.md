# Octoplan Modes

The four interview presets — Deep interview, Quick align, Brainstorm, Devil's advocate — with their system prompts, coverage dimensions, stop rules and the GOAL.md generator.

## Owns
- `apps/octoplan/server/modes/`: the `ModeDefinition` type (`types.ts`), the four mode definitions, their system prompt text, the coverage engine, the GOAL.md generation logic, and (wave 2) the stage generator and brainstorm board logic.
- `apps/octoplan/web/src/components/coverage/`: the `CoverageMap` component the ui-shell mounts, plus its CSS.
- `apps/octoplan/tests/modes/`.

## Read first
- `docs/octoplan/SPEC.md` §4 (modes + coverage table), §3.3 (PARKED/TENTATIVE/REVISION markers), §3.4 (plan tools and the tool allowlist), §7 (outputs), D8, D9, D11, D12 and D16.
- `packages/octoplan-protocol/src/domain.ts` (`ModeId`, `CoverageDimensionId`, `COVERAGE_DIMENSION_LABELS`, `CoverageState`, `GoalDoc`) and `answerEncoding.ts` (the marker constants, so prompts quote them exactly).

## What exists
- `modeIdSchema` and the 12 coverage dimensions are in the protocol.
- The live-verified AskUserQuestion loop is in `apps/octoplan/server/probe/askUserQuestionProbe.ts`.
- Nothing in `server/modes/` yet.

## Contracts
- `ModeDefinition` in `server/modes/types.ts` comes FIRST (todo 1), because the bridge consumes it:
  - `{ id: ModeId; label; systemPromptAppend: string; allowedTools: string[]; dimensions: CoverageDimensionId[]; roundSize: number /* ≤4 */; stopRule: (coverage: CoverageState, answeredCount: number) => boolean }`
  - export `getMode(id)`.
- `CoverageMap({ coverage, dimensions })` is exported from `web/src/components/coverage/index.ts`.
- Protocol changes go through the octopus.

## Prompt rules (every mode)
These are Octoplan's own prompts, with no SentiTools dependency (D12). Every mode prompt must require that:
1. Every question goes through AskUserQuestion, never as plain text in a reply.
2. Each question has 2–4 concrete options, the recommended one first with its label suffixed " (Recommended)", and a one-line tradeoff in each description.
3. After every answered round, Claude calls `mcp__octoplan__plan_update_coverage` for each touched dimension, and `plan_record_decision` for each settled choice, with `questionIds`.
4. PARKED answers are treated as the stated assumption and not re-asked unless it matters. TENTATIVE answers trigger `plan_add_risk`. A REVISION turn means re-checking the listed decisions and reporting what changed.
5. Replies between rounds stay short: a heading per topic, with no restating of the user's answers.

## Constraints
- Prompts are plain TypeScript template strings in `server/modes/prompts/*.ts`, so they can be diffed and unit-tested (e.g. "contains AskUserQuestion", "mentions every allowed plan tool").
- The deep interview stop rule is: every one of its dimensions is `covered`, or the user stops (D9). There is no question budget.
- **Don't touch** `apps/web`, `apps/api`, `packages/core`, or other tentacles' folders.

## Test
`pnpm --filter @octogent/octoplan test -- tests/modes` · `pnpm --filter @octogent/octoplan build` · `pnpm exec biome check apps/octoplan`. Prompt quality is judged live in the octopus's gate, not by unit tests.

## Done means
- `getMode()` returns all four modes with prompts that satisfy the rules above.
- The coverage engine turns `plan_update_coverage` calls + answered questions into a `CoverageState`.
- `CoverageMap` renders it.
- The deep interview's final step produces a valid GOAL.md via `plan_write_goal`.
