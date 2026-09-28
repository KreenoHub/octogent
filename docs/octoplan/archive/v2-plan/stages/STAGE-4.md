# Stage 4 — The cockpit header shows a 'Tentacles n/m' button whose cou…

## Goal

Make DOD9, DOD10 true.

## Prompt

```text
# Octoplan v2 — fix the friction found in real use — Stage 4 of 5: The cockpit header shows a 'Tentacles n/m' button whose cou…

You are building one stage of "Octoplan v2 — fix the friction found in real use". Build only this stage, then stop at its testing checkpoint. This prompt is self-contained: you don't need any earlier chat.

## Project context
In real use, all four v1 pain points came back: questions buried under reply prose, walls of text (prose, option descriptions, tool rows, the branch view), decisions re-explained across sessions, and no at-a-glance picture of what's happening across tentacles. If v2 doesn't fix them, the user drifts back to terminal chat and the plan→Octogent handoff goes unused.

Goals:
- The pending question round is always visible in a docked answer panel and survives server restarts (D14, D29, D30)
- Conversation stream is compact: one-line prose digests, answer chips, grouped tool rows, clamped option descriptions (D15, D19, D25, D43)
- Claude never needs decisions re-explained: capped plan digest at session start and every ~3 rounds, plus user-level conventions (D16, D18, D28, D32)
- Build-time decisions flow back through a headless harvest into HARVEST.md candidates you accept or reject (D11, D17, D27, D31)
- The G overlay answers 'what's going on across my tentacles' with pixel tentacle cards and opens from a visible header button (D21, D22, D23, D42)
- The plan board shows a needs-attention list, ideas/stages/branches, a cross-session view, drift badges and a History tab (D9, D13, D24, D26)
- Export preserves hand notes and stamps D-ids into todos; fork-PR badges are correct (D36, D37)

Non-goals (don't build these):
- Editing upstream apps/web, apps/api or packages/core (D8)
- Multi-user, sharing or auth (D12)
- Starting or steering tentacle workers from Octoplan (D12)
- Mobile layout (D12)
- Tentacle workers reading or writing docs/plan directly (D10, D11)
- Cross-repo board aggregation (D13)
- Live worker running/idle status from the Octogent API (D22)

## Where you are
Stages 1–3 are done and tested:
1. `pnpm --filter @octogent/octoplan test` and `pnpm --filter…
2. Starting a session on a repo with an existing DECISIONS.md…
3. `gh pr list` output with a fork PR headed at main shows no…
Build on them; don't redo or refactor them unless this stage needs it.

## Build this stage
Make these definition-of-done items true, and only these:
- DOD9: The cockpit header shows a 'Tentacles n/m' button whose counts match the checkboxes in .octogent/tentacles/*/todo.md, and clicking it opens G
- DOD10: After one week of real planning in Octoplan, the session files in docs/plan/sessions/ show the user's next project was planned there without falling back to terminal chat

## Decisions this stage relies on
- D1 — v2 targets all four D5 pain points again
- D3 — Octogent agents are first-class consumers of the plan
- D4 — Decision memory must hold in every context
- D6 — Big picture must answer four questions at a glance
- D7 — First slice: buried questions + wall of text
- D8 — Non-goal: editing upstream Octogent apps
- D9 — Plan board additions
- D10 — Agents consume exported CONTEXT.md + todo.md only
- D11 — Octoplan harvests build-time decisions; agents stay read-only
- D12 — Non-goals: multi-user, driving builds, mobile
- D13 — Cross-session board = all sessions in the current repo
- D14 — Pending round lives in a docked answer panel
- D15 — Between-round prose collapses to a one-line digest
- D16 — Server injects a plan digest into every session's first turn
- D17 — Harvest candidates appear in the needs-attention list
- D18 — Decision recap injected every ~3 rounds
- D19 — Tool calls collapse to one grouped row per turn
- D20 — Tentacle overview lives in the G overlay
- D21 — G overlay: tentacle summary first, commit graph as drill-down
- D22 — Tentacle progress read from .octogent/tentacles/*/todo.md on disk
- D23 — Tentacle cards: progress bar + status lights
- D24 — Drift badges on decisions + a History tab on the board
- D25 — Answered rounds collapse to answer chips
- D26 — Drift is computed from decision ids in todos and commits
- D27 — Harvest candidates stored in docs/plan/HARVEST.md
- D28 — User-level conventions in ~/.octoplan/CONVENTIONS.md
- D29 — Sessions persist and replay across server restarts
- D30 — Orphaned rounds are restored in the dock and answered as a user turn
- D31 — Harvest uses a short headless read-only Claude pass
- D32 — Digest = ids + titles + status, capped ~60 lines
- D33 — v2 reuses the six v1 tentacles
- D34 — Digest builder is a pure function in octoplan-protocol
- D35 — v2 contracts seeded first by the octopus
- D36 — Export rewrites only an Octoplan-managed block in CONTEXT.md
- D37 — Fix fork-PR badges; live-verify export against a running Octogent
- D38 — Success = v2 live gate passes + a week of real use
- D40 — Ops unchanged: local pnpm dev
- D41 — Three waves by pain point, all within ~1 week
- D42 — "Tentacles n/m" header button opens G
- D43 — Option descriptions clamp to one line
Follow these decisions. If one turns out to be wrong, stop and say so instead of working around it.

## Done when
- [ ] DOD9: The cockpit header shows a 'Tentacles n/m' button whose counts match the checkboxes in .octogent/tentacles/*/todo.md, and clicking it opens G
- [ ] DOD10: After one week of real planning in Octoplan, the session files in docs/plan/sessions/ show the user's next project was planned there without falling back to terminal chat
- [ ] The project's existing tests and type-check still pass.

## Testing checkpoint
Run the command behind each Done-when item and paste its real output. Tick an item only with that evidence; if one fails, fix it within this stage's scope or report it as open.

STOP after the testing checkpoint. Don't start stage 5: report what you built, the commands you ran and their output, then wait for the user to test it and say "continue".
```
