# Goal — Octoplan v3 — start anywhere, launch Octogent, see the way

## Why

v2 fixed the friction inside a session, but the edges of the workflow are still rough. Every plan has to start from an existing repo and a topic, and whatever the user already wrote (an idea, notes, half a plan, a built project) is ignored unless it sits in docs/plan. The handoff ends at a link to a guessed port, so Octogent has to be started by hand. And the cockpit hides the workflow behind hotkeys, so the user can't tell where they are or what to do next. If v3 doesn't fix these, planning keeps starting in terminal chat and the handoff keeps stalling.

## Goals

- A home screen offers two entry paths: a new project from an idea (Octoplan creates the folder) or an import of something that exists (D50, D51)
- Import reads a main folder plus any extra files, folders and pasted text; it detects how mature the material is and extracts plan items with evidence (D52, D53, D54, D55)
- A "What I understood" review lets the user keep, edit or drop every extracted item before anything is written to docs/plan (D56)
- Deep planning after an import asks only about what's missing or weak (D57)
- A "Run Octogent" button starts Octogent in a visible terminal in the handoff folder and finds its real port (D58, D59, D60, D61)
- A seven-step stepper and a next-action bar guide the user from Start to Build, with the centre pane following the step (D62, D63, D64)
- No feature is reachable only by a hotkey, and there's one path to Octogent (D65, D66)

## Non-goals

- Cloning from a git URL or importing from web links (D52, G2)
- Starting, steering or talking to tentacle workers; Octoplan only starts the Octogent dashboard (D12, D58)
- Stopping or supervising the Octogent process after launch (D59)
- Editing upstream apps/web, apps/api or packages/core (D8)
- Multi-user, sharing, auth or a mobile layout (D12)
- Steps that block the user from opening a later step (D63)

## Definition of done

- [x] `pnpm --filter @octogent/octoplan test` and `pnpm --filter @octogent/octoplan-protocol test` pass, and `pnpm --filter @octogent/octoplan build` type-checks clean <!-- op:id=DOD1 status=covered -->
  - evidence: pnpm test: 540 octoplan + 65 protocol tests pass; `pnpm --filter @octogent/octoplan build` (tsc + vite) clean, 2026-09-28
- [x] Running `pnpm --filter @octogent/octoplan e2e:v3` passes and saves headless screenshots of the home screen, the Understand review and the stepper at each of the seven steps to docs/octoplan/screenshots/v3/ (D68) <!-- op:id=DOD2 status=covered -->
  - evidence: e2e:v3 PASS 2026-09-28; 9 screenshots in docs/octoplan/screenshots/v3/
- [x] In e2e:v3, "New project from an idea" with a temp parent folder creates `<parent>/<slug>` holding a git repo with one commit, README.md containing the idea and docs/plan/, and shows the first question card within the Interview step (D51) <!-- op:id=DOD3 status=covered -->
  - evidence: e2e:v3: sprout-journal created with 1 commit, README with the idea, docs/plan; first card "What is the main reason you want this journal now?"
- [x] In e2e:v3, importing the three-maturity fixture (one-line idea file, half-plan folder, built repo plus an outside spec) writes docs/plan/INGEST.md with status draft, a maturity for each source, at least one found item quoting its source path, and one "Sources disagree on …" gap (D53, D54, D55) <!-- op:id=DOD4 status=covered -->
  - evidence: e2e:v3: INGEST.md draft, S1=built S2=partial-plan S3=notes S4=raw-idea, found items with quotes, "Sources disagree on storage: local JSON file vs Postgres"
- [x] In e2e:v3, dropping one item and applying the review writes the kept items to DECISIONS.md, GOAL.md or GAPS.md with `source: import`, leaves the dropped one out, marks INGEST.md applied, and the first question round asks about an open gap rather than a kept decision (D56, D57) <!-- op:id=DOD5 status=covered -->
  - evidence: e2e:v3: dropped item absent, 12 kept items written, decisions with source: import, INGEST applied, first round asked about next milestone / users (open gaps), no kept decision re-asked
- [x] `deriveWorkflow` unit tests show the expected current step for each of: a new empty project, an imported draft, a pending round, GOAL.md present, stages present, HANDOFF.md applied, and all handed-off todos ticked (D62) <!-- op:id=DOD6 status=covered -->
  - evidence: packages/octoplan-protocol/tests/workflow.test.ts (16 cases)
- [x] In e2e:v3, "Run Octogent" on a workspace without `.octogent/project.json` runs `octogent init`, calls the terminal launcher with the workspace as its folder, then shows "Running :port" with the port read from runtime.json, and a retried handoff Apply creates the tentacles (D60, D61) <!-- op:id=DOD7 status=covered -->
  - evidence: e2e:v3: octogent init, headless launch, running :9877 from runtime.json, handoff 3/3 tentacles created
- [x] With Octogent already running for the workspace, the button shows "Open Octogent" and clicking it starts no second process (checked in a unit test of the launcher) (D61) <!-- op:id=DOD8 status=covered -->
  - evidence: tests/integrations/octogentLaunch.test.ts; live 2026-09-28: a second launch-octogent replied "running" and started nothing
- [x] On the user's Windows machine, clicking Run Octogent opens a visible terminal window running octogent in the handoff folder, and Octogent's dashboard opens in the browser (D59) <!-- op:id=DOD9 status=covered -->
  - evidence: live on Windows 2026-09-28: cmd.exe /d /k octogent window in the octogent checkout, running on :8787 after 1.3 s
- [x] A grep of apps/octoplan/web/src shows every hotkey action (F, I, B, G, E) also bound to a visible button, and the board has no separate Export button (D65, D66) <!-- op:id=DOD10 status=covered -->
  - evidence: CockpitLayout.tsx: F/I/B/G/E hotkeys each have a toolbar button (tests/ui-shell/wave2Slots.test.tsx); PlanBoard has no Export button
- [ ] After a week of real use, the user's next real project was started from the home screen (new or import) and handed off with Run Octogent, shown by its docs/plan/INGEST.md or README commit and its HANDOFF.md (D49) <!-- op:id=DOD11 status=unknown -->
- [x] Unit tests of the import inventory show .git, node_modules, lockfiles and binaries skipped and the entry cap applied, and an INGEST.md with found, inferred and disagreement items round-trips through its codec byte-for-byte (D53, D56) <!-- op:id=DOD12 status=covered -->
  - evidence: apps/octoplan/tests/ingest/inventory.test.ts; packages/octoplan-protocol/tests/ingestCodec.test.ts
