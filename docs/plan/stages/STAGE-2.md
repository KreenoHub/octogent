# Stage 2 — Wave 7 — entry and import

## Goal

Wave 7 (entry and import): home screen, new project folder, import sources, ingest pass, maturity, What I understood review, INGEST.md, gap-focused kickoff.

## Decisions

D16, D31, D45, D49, D50, D51, D52, D53, D54, D55, D56, D57

## Prompt

```text
# Octoplan v3 — start anywhere, launch Octogent, see the way — Stage 2 of 4: Wave 7 — entry and import

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
Stages 1–1 are done and tested:
1. Wave 6 — launch
Build on them; don't redo or refactor them unless this stage needs it.

## Build this stage
Wave 7 (entry and import). Build these, and only these:
- home screen
- new project folder
- import sources
- ingest pass
- maturity
- What I understood review
- INGEST.md
- gap-focused kickoff

They serve these goals:
- A home screen offers two entry paths: a new project from an idea (Octoplan creates the folder) or an import of something that exists (D50, D51)
- Import reads a main folder plus any extra files, folders and pasted text; it detects how mature the material is and extracts plan items with evidence (D52, D53, D54, D55)
- A "What I understood" review lets the user keep, edit or drop every extracted item before anything is written to docs/plan (D56)
- Deep planning after an import asks only about what's missing or weak (D57)

Definition-of-done items this wave makes true:
- DOD12: Unit tests of the import inventory show .git, node_modules, lockfiles and binaries skipped and the entry cap applied, and an INGEST.md with found, inferred and disagreement items round-trips through its codec byte-for-byte (D53, D56)

## Decisions this stage relies on
- D16 — Server injects a plan digest into every session's first turn
- D31 — Harvest uses a short headless read-only Claude pass
- D45 — Claude proposes the tentacle split in a headless pass
- D49 — v3 targets three frictions: entry, launch, guidance
- D50 — A home screen with two entry paths
- D51 — "New from idea" creates the project folder
- D52 — Import takes a main folder plus any extra sources
- D53 — Ingestion is one headless read-only pass over an inventory
- D54 — Ingest detects how mature the material is
- D55 — Ingest extracts plan items with evidence
- D56 — "What I understood" review before anything is written
- D57 — After import, deep planning starts from what's missing
Follow these decisions (the rest are in docs/plan/DECISIONS.md). If one turns out to be wrong, stop and say so instead of working around it.

## Done when
- [ ] DOD12: Unit tests of the import inventory show .git, node_modules, lockfiles and binaries skipped and the entry cap applied, and an INGEST.md with found, inferred and disagreement items round-trips through its codec byte-for-byte (D53, D56)
- [ ] A home screen offers two entry paths: a new project from an idea (Octoplan creates the folder) or an import of something that exists (D50, D51)
- [ ] Import reads a main folder plus any extra files, folders and pasted text; it detects how mature the material is and extracts plan items with evidence (D52, D53, D54, D55)
- [ ] A "What I understood" review lets the user keep, edit or drop every extracted item before anything is written to docs/plan (D56)
- [ ] Deep planning after an import asks only about what's missing or weak (D57)
- [ ] The project's existing tests and type-check still pass.

## Testing checkpoint
Run the command behind each Done-when item and paste its real output. Tick an item only with that evidence; if one fails, fix it within this stage's scope or report it as open.

STOP after the testing checkpoint. Don't start stage 3: report what you built, the commands you ran and their output, then wait for the user to test it and say "continue".
```
