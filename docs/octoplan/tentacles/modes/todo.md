# Todo

- [x] **ModeDefinition + four modes** — create `apps/octoplan/server/modes/types.ts` (`ModeDefinition` exactly as in this tentacle's CONTEXT.md) and `server/modes/index.ts` with `getMode(id)`, plus the definitions: **deep-interview:** all 12 dimensions, round size 4, stops when all are covered. **quick-align:** problem, scope, flows and success; stops after 2 answered rounds. **brainstorm:** problem, users and flows; stops on user converge. **devils-advocate:** risks, ops, data, integrations and success; stops on user stop. The allowed tools are `Read`, `Glob`, `Grep`, `AskUserQuestion` and `mcp__octoplan__*` for every mode. Done when `tests/modes/modes.test.ts` asserts each mode's dimensions, round size and allowlist, and `stopRule` truth tables (deep interview false with one `partial`, true when all `covered`).
- [x] **System prompts** — write `server/modes/prompts/{shared,deepInterview,quickAlign,brainstorm,devilsAdvocate}.ts`. `shared.ts` holds the five rules from CONTEXT.md "Prompt rules", quoting `PARKED_MARKER` / `TENTATIVE_MARKER` / `REVISION_MARKER` from the protocol. Each mode adds its goal, how to pick the next dimension (lowest coverage first), and how to end: **deep interview:** ends by calling `plan_write_goal`. **quick align:** ends with a short plan in the reply. **brainstorm:** generates 6–10 ideas via `plan_add_idea`, then asks which to star, merge, kill or park. **devil's advocate:** asks "what breaks?" questions and records `plan_add_risk` / `plan_add_gap`. Done when tests assert every prompt contains "AskUserQuestion", the three markers, every `mcp__octoplan__plan_*` tool the mode needs, and "(Recommended)".
- [x] **Coverage engine** — `server/modes/coverage.ts`: `applyCoverageUpdate(state, update)` handles `plan_update_coverage` payloads; status only moves forward unless the update says `regress: true`. `initialCoverage(mode)` starts all of the mode's dimensions at `unknown`/`low`. `coverageScore(state)` returns the covered share for the focus-mode bar. Done when unit tests cover forward-only moves, explicit regress, linking question ids without duplicates, and score math.
- [x] **CoverageMap component** — `web/src/components/coverage/CoverageMap.tsx`: one row per dimension with the label from `COVERAGE_DIMENSION_LABELS`, a 3-state bar (unknown / partial / covered in border / warning / green tokens), a confidence dot, and the note as a tooltip. Match the existing `.op-coverage` look in `web/src/styles/cockpit.css`, but keep the new CSS in this folder. Done when a jsdom test renders a mixed state and asserts `data-status` per row and the covered count text.
- [x] **GOAL.md generation** — `server/modes/goal.ts`: `buildGoalDoc(input)` normalizes what Claude passes to `plan_write_goal` into a valid `GoalDoc` (trims, dedupes goals, assigns `DOD<n>` ids, and rejects DoD items without a checkable verb such as "run", "shows", "returns" or "passes" with a helpful error string sent back to Claude). Done when tests cover normalization, id assignment and the rejection message, and the serialized output round-trips through `parseGoalDoc`.

## Wave 2

- [x] **Brainstorm board logic** — `server/modes/brainstorm.ts`: state transitions for ideas (inbox → starred / merged / killed / parked / adopted), merging two ideas into one with both ids recorded in the body, and a "converge" step that builds a user turn asking Claude to turn starred ideas into decisions. Done when tests cover every transition, including illegal ones being rejected.
- [x] **Staged build prompts** — `server/modes/stages.ts`: from GOAL.md + DECISIONS.md, build `Stage[]` (each a self-contained prompt that builds one stage and stops at a testing checkpoint) and write them via `serializeStage` to `docs/plan/stages/STAGE-n.md` through the store. Done when a test with a fixture goal produces stages that round-trip through `parseStage`, and each prompt contains "Done when" and a stop instruction.

## v2

Planned in Octoplan (docs/plan/GOAL.md, DECISIONS.md D1–D43). Ids in brackets are the decisions each task implements; cite them in commit messages (D26).

### Wave 4 — memory (D41)

- [ ] [G1, D26] **Trace todos to decisions** — stages and exported tasks carry `decisions:` ids so export can stamp them (settles gap G1). Done when a stage built from a GOAL.md + DECISIONS.md fixture lists the D-ids behind each task and the export receives them.

### Wave 5 — overview (D41)

- [ ] [D39] **Live mode runs for the gate** — Quick align, Brainstorm and Devil's advocate each complete one live round with every question arriving as a card. Done when e2e:v2 prints a pass line for each of the three modes.

### Dogfood fixes (found while planning v2 in Octoplan)

- [ ] **Stage titles are truncated DoD text** — stages are titled after their first definition-of-done line cut at 60 chars (v2 Stage 1 is "`pnpm --filter @octogent/octoplan test` and `pnpm --filter…"). Done when each stage gets a short name (from the wave/decision it builds, or asked of Claude) and a test asserts no title ends in an ellipsis.
- [ ] **Stages ignore the plan's own waves** — `buildStages` cuts the DoD list into ≤4 contiguous chunks, so v2 Stage 1 demands the full e2e:v2 screenshots before any feature exists and D41's three waves are lost. Done when a GOAL.md whose decisions define waves yields one stage per wave, with gate items in the last stage, covered by a test.
- [ ] **Every stage lists nearly every decision** — `relevantDecisions` matches on any shared word, so v2 Stage 1 lists 38 of 43 decisions. Done when relevance uses the D-ids cited by the stage's goals/DoD (plus their depends-on), and a test on the v2 fixture lists ≤12 decisions per stage.
