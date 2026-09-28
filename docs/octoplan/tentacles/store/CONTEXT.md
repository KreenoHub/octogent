# Octoplan Store

Reads and writes the docs/plan markdown in each target repo — the source of truth for decisions, parked questions, risks, coverage and session logs.

## Owns
- `apps/octoplan/server/store/`: the `PlanStore` interface (`types.ts`) and its filesystem implementation, the file watcher, the session log writer, and the rebuildable index.
- `apps/octoplan/tests/store/`.

## Read first
- `docs/octoplan/SPEC.md` §5 (storage) and D10, D21 and D23 in `docs/octoplan/DECISIONS.md`.
- `packages/octoplan-protocol/src/markdown/`:
  - `records.ts`: `parseRecordDoc`, `serializeRecordDoc`, `upsertItem`, `readItems`, `nextId`, `mergeMeta`
  - `codecs.ts`: one codec per record kind
  - `documents.ts`: GOAL.md, the session log and stages
  - `planFiles.ts`: `PLAN_DIR`, `PLAN_FILES` (paths + default preambles), `sessionFileName`
- `apps/octoplan/tests/docsDogfood.test.ts`: a real file round-tripping byte-for-byte. Keep that property for every file you write.

## What exists
All parsing and serialization is done and tested in the protocol package (26 tests). This tentacle adds I/O, concurrency, watching and indexing. It must not invent a second markdown format.

## Contracts
- `types.ts` defines `PlanStore` FIRST (todo item 1), because bridge and modes code against it:
  - `snapshot(): PlanSnapshot`
  - `recordAnswers(sessionId, round, answers)`
  - `upsertDecision`, `markDecisionsStale(ids)`, `dependentDecisions(questionId)`
  - `addGap`, `addRisk`, `park`, `addIdea`
  - `updateCoverage(dimension)`
  - `writeGoal(goal)`
  - `appendSessionEntry` / `writeSessionSummary`
  - `onChange(listener)`
  Keep it small, and extend it by messaging the octopus.
- Protocol changes go through the octopus. Don't edit `packages/octoplan-protocol` yourself.

## Constraints
- **Hand edits win.** Always read → `upsertItem` → write, never regenerate a file from memory. That keeps unknown keys, preambles and bodies intact.
- **Atomic writes:** write to a temp file in the same directory, then rename. Serialize writes per file with a small in-process queue, so two plan tools firing together can't lose an update.
- **Missing files** are created on first write with the `PLAN_FILES` preamble. Reads of missing files return empty docs, never errors.
- **Broken records** (a codec returns null) are skipped and reported once via a warning event. Never throw from a read.
- **Line endings:** accept CRLF and write LF (protocol parsers already normalize).
- The watcher must ignore Octoplan's own writes (track the last-written content hash per file) to avoid echo loops. Debounce about 150 ms.
- **Don't touch** `apps/web`, `apps/api`, `packages/core`, or other tentacles' directories.

## Test
Use real temp dirs (`fs.mkdtemp` under `os.tmpdir()`), never the repo's docs:
`pnpm --filter @octogent/octoplan test -- tests/store` · `pnpm --filter @octogent/octoplan build` · `pnpm exec biome check apps/octoplan`

## Done means
Bridge and modes can do everything the MVP needs through `PlanStore` alone:
- every docs/plan file round-trips with hand edits preserved
- concurrent upserts don't lose data
- a hand edit made while Octoplan is running reaches `onChange` listeners within 2 s
