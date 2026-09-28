# Stage 4 — Integrate and verify end to end

## Goal

Every definition-of-done item in GOAL.md passes, checked end to end.

## Decisions

D1, D49, D50, D51, D53, D54, D55, D56, D57, D60, D61, D68

## Prompt

```text
# Octoplan v3 — start anywhere, launch Octogent, see the way — Stage 4 of 4: Integrate and verify end to end

You are building one stage of "Octoplan v3 — start anywhere, launch Octogent, see the way". Build only this stage, then stop at its testing checkpoint. This prompt is self-contained: you don't need any earlier chat.

## Project context
v2 fixed the friction inside a session, but the edges of the workflow are still rough. Every plan has to start from an existing repo and a topic, and whatever the user already wrote (an idea, notes, half a plan, a built project) is ignored unless it sits in docs/plan. The handoff ends at a link to a guessed port, so Octogent has to be started by hand. And the cockpit hides the workflow behind hotkeys, so the user can't tell where they are or what to do next. If v3 doesn't fix these, planning keeps starting in terminal chat and the handoff keeps stalling.

Goals:
- A home screen offers two entry paths: a new project from an idea (Octoplan creates the folder) or an import of something that exists (D50, D51)
- Import reads a main folder plus any extra files, folders and pasted text; it detects how mature the material is and extracts plan items with evidence (D52, D53, D54, D55)
- A "What I understood" review lets the user keep, edit or drop every extracted item before anything is written to docs/plan (D56)
- Deep planning after an import asks only about what's missing or weak (D57)
- A "Run Octogent" button starts Octogent in a visible terminal in the handoff folder and finds its real port (D58, D59, D60, D61)
- A seven-step stepper and a next-action bar guide the user from Start to Build, with the centre pane following the step (D62, D63, D64)
- No feature is reachable only by a hotkey, and there's one path to Octogent (D65, D66)

Non-goals (don't build these):
- Cloning from a git URL or importing from web links (D52, G2)
- Starting, steering or talking to tentacle workers; Octoplan only starts the Octogent dashboard (D12, D58)
- Stopping or supervising the Octogent process after launch (D59)
- Editing upstream apps/web, apps/api or packages/core (D8)
- Multi-user, sharing, auth or a mobile layout (D12)
- Steps that block the user from opening a later step (D63)

## Where you are
Stages 1–3 are done and tested:
1. Wave 6 — launch
2. Wave 7 — entry and import
3. Wave 8 — guidance
Build on them; don't redo or refactor them unless this stage needs it.

## Build this stage
Wire the stages together and close the gaps between them. Don't add features beyond GOAL.md; anything new goes in a note for the user, not in code.

## Decisions this stage relies on
- D1 — v2 targets all four D5 pain points again
- D49 — v3 targets three frictions: entry, launch, guidance
- D50 — A home screen with two entry paths
- D51 — "New from idea" creates the project folder
- D53 — Ingestion is one headless read-only pass over an inventory
- D54 — Ingest detects how mature the material is
- D55 — Ingest extracts plan items with evidence
- D56 — "What I understood" review before anything is written
- D57 — After import, deep planning starts from what's missing
- D60 — Octoplan runs `octogent init` first when needed
- D61 — Octoplan finds a running Octogent through its runtime.json
- D68 — v3 live gate: e2e:v3
Follow these decisions (the rest are in docs/plan/DECISIONS.md). If one turns out to be wrong, stop and say so instead of working around it.

## Done when
- [ ] DOD1: `pnpm --filter @octogent/octoplan test` and `pnpm --filter @octogent/octoplan-protocol test` pass, and `pnpm --filter @octogent/octoplan build` type-checks clean
- [ ] DOD2: Running `pnpm --filter @octogent/octoplan e2e:v3` passes and saves headless screenshots of the home screen, the Understand review and the stepper at each of the seven steps to docs/octoplan/screenshots/v3/ (D68)
- [ ] DOD3: In e2e:v3, "New project from an idea" with a temp parent folder creates `<parent>/<slug>` holding a git repo with one commit, README.md containing the idea and docs/plan/, and shows the first question card within the Interview step (D51)
- [ ] DOD4: In e2e:v3, importing the three-maturity fixture (one-line idea file, half-plan folder, built repo plus an outside spec) writes docs/plan/INGEST.md with status draft, a maturity for each source, at least one found item quoting its source path, and one "Sources disagree on …" gap (D53, D54, D55)
- [ ] DOD5: In e2e:v3, dropping one item and applying the review writes the kept items to DECISIONS.md, GOAL.md or GAPS.md with `source: import`, leaves the dropped one out, marks INGEST.md applied, and the first question round asks about an open gap rather than a kept decision (D56, D57)
- [ ] DOD6: `deriveWorkflow` unit tests show the expected current step for each of: a new empty project, an imported draft, a pending round, GOAL.md present, stages present, HANDOFF.md applied, and all handed-off todos ticked (D62)
- [ ] DOD7: In e2e:v3, "Run Octogent" on a workspace without `.octogent/project.json` runs `octogent init`, calls the terminal launcher with the workspace as its folder, then shows "Running :port" with the port read from runtime.json, and a retried handoff Apply creates the tentacles (D60, D61)
- [ ] DOD8: With Octogent already running for the workspace, the button shows "Open Octogent" and clicking it starts no second process (checked in a unit test of the launcher) (D61)
- [ ] DOD9: On the user's Windows machine, clicking Run Octogent opens a visible terminal window running octogent in the handoff folder, and Octogent's dashboard opens in the browser (D59)
- [ ] DOD10: A grep of apps/octoplan/web/src shows every hotkey action (F, I, B, G, E) also bound to a visible button, and the board has no separate Export button (D65, D66)
- [ ] DOD11: After a week of real use, the user's next real project was started from the home screen (new or import) and handed off with Run Octogent, shown by its docs/plan/INGEST.md or README commit and its HANDOFF.md (D49)
- [ ] DOD12: Unit tests of the import inventory show .git, node_modules, lockfiles and binaries skipped and the entry cap applied, and an INGEST.md with found, inferred and disagreement items round-trips through its codec byte-for-byte (D53, D56)
- [ ] The full test suite and type-check pass from a clean checkout.

## Testing checkpoint
Re-run every Done-when check from scratch, in order, and paste the output of each. Report any item that fails with what you tried.

STOP after the testing checkpoint. This is the last stage: report each Done-when item with its evidence, then wait for the user to sign off.
```
