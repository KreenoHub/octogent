# Stage 1 — Wave 6 — launch

## Goal

Wave 6 (launch): octogent init, runtime.json lookup, terminal launcher, Run Octogent button, Retry apply.

## Decisions

D12, D48, D58, D59, D60, D61

## Prompt

```text
# Octoplan v3 — start anywhere, launch Octogent, see the way — Stage 1 of 4: Wave 6 — launch

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
This is the first stage. Start from the current state of the repository.

## Build this stage
Wave 6 (launch). Build these, and only these:
- octogent init
- runtime.json lookup
- terminal launcher
- Run Octogent button
- Retry apply

They serve these goals:
- A "Run Octogent" button starts Octogent in a visible terminal in the handoff folder and finds its real port (D58, D59, D60, D61)

Definition-of-done items this wave makes true:
- DOD8: With Octogent already running for the workspace, the button shows "Open Octogent" and clicking it starts no second process (checked in a unit test of the launcher) (D61)
- DOD9: On the user's Windows machine, clicking Run Octogent opens a visible terminal window running octogent in the handoff folder, and Octogent's dashboard opens in the browser (D59)

## Decisions this stage relies on
- D12 — Non-goals: multi-user, driving builds, mobile
- D48 — Export and handoff target the checkout Octogent runs in
- D58 — "Run Octogent" button launches it in the handoff folder
- D59 — Launch opens a visible terminal that Octoplan doesn't own
- D60 — Octoplan runs `octogent init` first when needed
- D61 — Octoplan finds a running Octogent through its runtime.json
Follow these decisions (the rest are in docs/plan/DECISIONS.md). If one turns out to be wrong, stop and say so instead of working around it.

## Done when
- [ ] DOD8: With Octogent already running for the workspace, the button shows "Open Octogent" and clicking it starts no second process (checked in a unit test of the launcher) (D61)
- [ ] DOD9: On the user's Windows machine, clicking Run Octogent opens a visible terminal window running octogent in the handoff folder, and Octogent's dashboard opens in the browser (D59)
- [ ] A "Run Octogent" button starts Octogent in a visible terminal in the handoff folder and finds its real port (D58, D59, D60, D61)
- [ ] The project's existing tests and type-check still pass.

## Testing checkpoint
Run the command behind each Done-when item and paste its real output. Tick an item only with that evidence; if one fails, fix it within this stage's scope or report it as open.

STOP after the testing checkpoint. Don't start stage 2: report what you built, the commands you ran and their output, then wait for the user to test it and say "continue".
```
