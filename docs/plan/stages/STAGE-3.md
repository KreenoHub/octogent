# Stage 3 — Wave 8 — guidance

## Goal

Wave 8 (guidance): deriveWorkflow, stepper, next-action bar, step views, hotkey buttons, Export in Hand off, the full e2e:v3 gate.

## Decisions

D39, D44, D49, D62, D63, D64, D65, D66, D67, D68

## Prompt

```text
# Octoplan v3 — start anywhere, launch Octogent, see the way — Stage 3 of 4: Wave 8 — guidance

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
Stages 1–2 are done and tested:
1. Wave 6 — launch
2. Wave 7 — entry and import
Build on them; don't redo or refactor them unless this stage needs it.

## Build this stage
Wave 8 (guidance). Build these, and only these:
- deriveWorkflow
- stepper
- next-action bar
- step views
- hotkey buttons
- Export in Hand off
- the full e2e:v3 gate

They serve these goals:
- A seven-step stepper and a next-action bar guide the user from Start to Build, with the centre pane following the step (D62, D63, D64)
- No feature is reachable only by a hotkey, and there's one path to Octogent (D65, D66)

Definition-of-done items this wave makes true:
- DOD6: `deriveWorkflow` unit tests show the expected current step for each of: a new empty project, an imported draft, a pending round, GOAL.md present, stages present, HANDOFF.md applied, and all handed-off todos ticked (D62)
- DOD10: A grep of apps/octoplan/web/src shows every hotkey action (F, I, B, G, E) also bound to a visible button, and the board has no separate Export button (D65, D66)

## Decisions this stage relies on
- D39 — v2 live gate contents
- D44 — Plan → Octogent handoff is a click-through wizard
- D49 — v3 targets three frictions: entry, launch, guidance
- D62 — The workflow has seven steps, derived and never stored
- D63 — Stepper on top, the 3-pane cockpit stays, the centre follows the step
- D64 — A bottom bar always shows the one next action
- D65 — Hotkey-only features get visible buttons
- D66 — The single-tentacle Export folds into the Hand off step
- D67 — v3 is built in three waves after contracts
- D68 — v3 live gate: e2e:v3
Follow these decisions (the rest are in docs/plan/DECISIONS.md). If one turns out to be wrong, stop and say so instead of working around it.

## Done when
- [ ] DOD6: `deriveWorkflow` unit tests show the expected current step for each of: a new empty project, an imported draft, a pending round, GOAL.md present, stages present, HANDOFF.md applied, and all handed-off todos ticked (D62)
- [ ] DOD10: A grep of apps/octoplan/web/src shows every hotkey action (F, I, B, G, E) also bound to a visible button, and the board has no separate Export button (D65, D66)
- [ ] A seven-step stepper and a next-action bar guide the user from Start to Build, with the centre pane following the step (D62, D63, D64)
- [ ] No feature is reachable only by a hotkey, and there's one path to Octogent (D65, D66)
- [ ] The project's existing tests and type-check still pass.

## Testing checkpoint
Run the command behind each Done-when item and paste its real output. Tick an item only with that evidence; if one fails, fix it within this stage's scope or report it as open.

STOP after the testing checkpoint. Don't start stage 4: report what you built, the commands you ran and their output, then wait for the user to test it and say "continue".
```
