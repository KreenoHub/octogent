# Octoplan v3 report

The plan is in docs/plan (D49–D68, GOAL.md). It was built on `feat/octoplan-v3` on 2026-09-28 in three waves, each followed by a live check.

## What v3 adds

- **Run Octogent (wave 6, D58–D61).**
  - Octoplan finds Octogent's real port from `~/.octogent/projects/<id>/state/runtime.json`. It then checks that the pid is alive and that `/api/deck/tentacles` answers. This replaces the fixed `:8787`, so a stale runtime.json no longer counts as running.
  - The Run Octogent button runs `octogent init` when needed. It then opens a visible terminal with `cmd /c start` on Windows (the workspace goes in only as cwd), Terminal on macOS, or x-terminal-emulator and friends on Linux. It never starts a second instance, and it falls back to a command you can copy.
  - The handoff's Done step has a status chip, Open Octogent, Retry apply, and the folder-trust reminder.
- **Entry paths and import (wave 7, D50–D57).**
  - A home screen offers "New project from an idea" and "Import something that exists".
  - New from idea creates the folder (letters in any script are kept), a README holding the idea, docs/plan and one commit.
  - Import takes a main folder plus extra files and folders plus pasted text (saved to `docs/plan/sources/`). A server-side inventory lists them first: it skips .git, dependencies, build output, lockfiles and binaries; lists .docx and images as skipped; and caps at 400 entries, docs first. Then one read-only `plan_ingest` pass reads them.
  - The pass rates maturity (raw idea / notes / partial plan / detailed plan / built) per source and overall. Each item is marked found (source and quote) or inferred (reason), and contradictions between sources become disagreement gaps.
  - The "What I understood" review is stored as `docs/plan/INGEST.md`. You keep, edit or drop each item, and disagreements must be resolved or parked before Apply.
  - Apply writes the plan, then starts an interview whose kickoff lists what's still open, and runs a harvest.
- **Guided workflow (wave 8, D62–D66).**
  - `deriveWorkflow` works out seven steps (Start, Understand, Interview, Goal, Stages, Hand off, Build), each with a state and a reason.
  - A stepper runs across the top, and the centre pane follows the chosen step. Steps never block.
  - A next-action bar shows one primary button.
  - Every hotkey (F/I/B/G/E) also has a button.
  - Stages, Hand off and single-tentacle export moved off the board into their steps.

## Evidence

| Check | Result |
|---|---|
| DOD1 | 540 octoplan and 65 protocol tests pass; `pnpm --filter @octogent/octoplan build` (tsc + vite) is clean |
| DOD2–DOD7 | `pnpm --filter @octogent/octoplan e2e:v3`: **v3 E2E PASS** (5/5), real Claude, private Octogent and Octoplan |
| DOD8, DOD9 | Live on Windows: the terminal opened and reported Running :8787 after 1.3 s; a second click started nothing |
| DOD10 | Every hotkey has a toolbar button; the board has no Export button |
| DOD12 | Inventory and INGEST.md codec unit tests |
| DOD11 | Open: needs a week of real use |

The e2e:v3 run:

- **DOD3:** New project → `sprout-journal` with 1 commit, README and docs/plan. First card: "What is the main reason you want this journal now?"
- **DOD4:** Import of a built repo, an outside spec, a notes folder and an idea file. Maturities: S1 built, S2 partial plan, S3 notes, S4 raw idea. It found quoted items and "Sources disagree on storage: local JSON file vs Postgres".
- **DOD5:**
  - One item was dropped, and 12 kept items were written. Decisions carry `source: import (…)`, and INGEST.md is marked applied.
  - The first round asked about the next milestone, the cost of doing nothing, and who uses it. It re-asked no kept decision.
- **DOD7:** Run Octogent on a folder without `.octogent`: init, a headless launch, then running :9877 read from runtime.json. The handoff then created 3/3 tentacles.

## Gate plumbing (test-only)

- `OCTOPLAN_OCTOGENT_USERPROFILE` (server/main.ts) runs every `octogent` command, and Run Octogent, under a temp home.
- The same switch replaces the terminal with a headless spawn, so the gate never touches the user's Octogent or opens windows. Claude keeps the real home, where its login lives.

## Found and fixed along the way

- A Hebrew project name would have become a folder called `session`, because the shared slugify drops non-Latin letters. New projects now use `projectFolderName`.
- Inferred gaps were also written as "Assumed on import" risks. Only inferred goals, non-goals and decisions are assumptions now.
- A review save and an apply could race, because messages on one socket aren't queued. `apply-ingest` now carries the reviewed draft.
- An import waiting for review had no session, so after a reload nothing led back to it. The home screen now lists repos that have only a plan.
- The stepper didn't know about stages after a reload. The server now sends them with the plan snapshot.
- Octoplan's own stage builder sends every e2e-flavoured done-when item to the final stage. DOD12 gives wave 7 a checkpoint of its own.

## Screenshots

`docs/octoplan/screenshots/v3/`: 01-home, 02-understand-review, and 03–09 for the stepper at each step.
