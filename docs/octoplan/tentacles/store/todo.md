# Todo

- [x] **PlanStore interface + filesystem implementation** — define `PlanStore` in `apps/octoplan/server/store/types.ts` exactly as listed in this tentacle's CONTEXT.md, then implement `createFsPlanStore(repoPath)` in `server/store/fsPlanStore.ts`. It uses the protocol codecs and `PLAN_FILES` under `<repo>/docs/plan/`. Writes are atomic (temp file + rename in the same dir) and serialized per file. Missing files are created with their preamble, and ids are allocated with `nextId` (D, G, R, P, I). `dependentDecisions(q)` returns decisions whose `questions` or `depends-on` contain `q`. Done when `tests/store/fsPlanStore.test.ts` (temp dirs) covers first write creates the file, upsert preserves an unknown meta key and hand-written body, 20 concurrent `addRisk` calls produce R1..R20 with none lost, and `snapshot()` matches the files after a reload.
- [x] **Session log writer** — `appendSessionEntry` and `writeSessionSummary` maintain `docs/plan/sessions/<YYYY-MM-DD>-<slug>.md` via `serializeSessionLog`/`parseSessionLog`. Entries get `A<n>` ids; a revision is a new entry with `revises: A<k>` (D23). `recordAnswers` writes one entry per answer with the display answer text. Parked answers also add a `PARKED.md` item with the assumption, and tentative answers add a `RISKS.md` item (`origin: Q<n> tentative`). Done when a test records a round with one plain, one parked and one tentative answer, then revises one, and asserts all four files' contents.
- [x] **File watcher** — `watchPlanDir(repoPath, onChange)` uses `fs.watch` on `docs/plan` (recursive on Windows), debounced ~150 ms. It ignores Octoplan's own writes by comparing a content hash stored at write time, and re-reads only the changed file. `PlanStore.onChange` fires with a fresh snapshot. Close the watchers on dispose. Done when a test edits `DECISIONS.md` externally and receives the change within 2 s, and a store write does NOT trigger a second change event.
- [x] **Rebuildable index** — `server/store/index.ts` builds an in-memory index from the files: decisions↔questions, questions↔coverage dimensions, and open counts for the plan board. `rebuild()` re-derives everything from disk, and the index never persists anything that isn't in markdown. Done when a test deletes the index object, rebuilds from files, and gets an identical result, and `snapshot()` uses it.

## Wave 2

- [x] **Idea inbox across projects** — `IDEAS.md` per repo plus a small registry of known repos in `~/.octoplan/projects.json` (paths only; content stays in the repos). `searchIdeas(query)` scans all registered repos' IDEAS.md with case-insensitive matching on title, tags and body. Done when a test with two temp repos finds ideas in both and survives one repo being deleted.

## v2

Planned in Octoplan (docs/plan/GOAL.md, DECISIONS.md D1–D43). Ids in brackets are the decisions each task implements; cite them in commit messages (D26).

### Wave 3 — focus (D41)

- [x] [D29, D30] **Replayable session log** — store enough in docs/plan/sessions (plus a block log if needed) to rebuild cards, pending rounds and claudeSessionId after a restart. Done when a round-trip test writes a session with one answered and one pending round, reloads it, and gets identical blocks and the pending round back.

### Wave 4 — memory (D41)

- [x] [D27] **HARVEST.md H-records** — read/write `docs/plan/HARVEST.md` in the shared record format with source (sha or todo diff), status pending/accepted/rejected, and the resulting D id; accepting creates the D-record, rejected titles never reappear. Done when round-trip tests cover all three statuses and accept writes a new D-record linked from the H-record.
- [x] [D28] **User conventions store** — C-records in `~/.octoplan/CONVENTIONS.md` (next to projects.json), exposed on the snapshot for the digest. Done when a test with a temp home dir writes, reads and lists C-records without touching any repo.

### Wave 5 — overview (D41)

- [x] [D13, D9] **Cross-session aggregate** — expose every session in the repo (open questions, parked, tentative, stale) as one snapshot the board can render. Done when a fixture with two sessions yields one aggregate with both sessions' unanswered rounds and parked items.
- [x] [D24] **History timeline** — build the History timeline type (decisions, revisions, branches with dates and session ids) from session logs and DECISIONS.md. Done when a fixture test returns events in date order including one revision and one conversation branch.

### Dogfood fixes (found while planning v2 in Octoplan)

- [x] **Worktrees register as separate projects** — opening the octoplan-v2 worktree added it to ~/.octoplan/projects.json next to the main checkout, so the same repo's sessions split across two projects and the D13 cross-session view would miss half. Done when paths from one git common dir map to one project and a test registers a worktree without adding a second entry.

### Wave 6 — handoff to Octogent (D44–D48)

- [x] [D46, D47] **HANDOFF.md + OCTOPUS.md** — `readHandoff`/`writeHandoff` round-trip docs/plan/HANDOFF.md (T-records per tentacle, todos as checkbox lines with D-ids and wave) and `writeOctopusPrompt` writes docs/plan/OCTOPUS.md; `snapshot().handoff` carries it. Done when a round-trip test with two tentacles and waved todos returns an identical plan and a hand edit to a todo line survives a re-read.
