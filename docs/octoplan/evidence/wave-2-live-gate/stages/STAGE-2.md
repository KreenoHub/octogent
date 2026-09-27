# Stage 2 — `log read --date 2026-09-25` appends a line dated 2026-09-2…

## Goal

Make DOD3, DOD4 true.

## Prompt

```text
# Tiny CLI habit tracker — Stage 2 of 5: `log read --date 2026-09-25` appends a line dated 2026-09-2…

You are building one stage of "Tiny CLI habit tracker". Build only this stage, then stop at its testing checkpoint. This prompt is self-contained: you don't need any earlier chat.

## Project context
One person wants to track a handful of daily habits from the terminal and own that data in a plain file they can read and edit without the tool. Without a quick weekly view, streaks quietly break without being noticed. The tool stays deliberately tiny: three commands and one append-only text file.

Goals:
- `add <habit>` declares one of 1–5 named habits
- `log <habit> [--date YYYY-MM-DD]` records one completion per habit per day (a second log on the same day is a no-op with a notice)
- The weekly view shows each habit's last 7 days as ✓/· plus its current consecutive-day streak
- Data is an append-only plain-text log at ~/.habits, overridable by HABITS_FILE

Non-goals (don't build these):
- Reminders or notifications
- Remove, rename or undo commands (edit the file instead)
- History beyond 7 days, charts
- Accounts, sync or multi-user support
- Rep counts per day

## Where you are
Stages 1–1 are done and tested:
1. Running `log` on a habit name that was never added exits no…
Build on them; don't redo or refactor them unless this stage needs it.

## Build this stage
Make these definition-of-done items true, and only these:
- DOD3: `log read --date 2026-09-25` appends a line dated 2026-09-25, and the weekly view then shows ✓ for that day
- DOD4: The weekly view, run against a fixture file, shows the correct 7-day ✓/· grid and current streak for each habit

## Decisions this stage relies on
- D2 — Weekly streak view is the core feature
- D3 — Single user, single machine, local data
- D4 — Support 1–5 named habits
- D5 — Streak = 7-day grid plus current consecutive-day run
- D7 — Habits must be added before logging
- D8 — One completion per habit per day
- D9 — Own the data: plain human-readable local file (CLI, no account)
- D10 — Backfill via `log <habit> --date YYYY-MM-DD`
- D11 — v1 is three commands; everything else is a file edit
- D12 — Append-only plain-text log file
- D13 — Data file at ~/.habits, overridable by HABITS_FILE
Follow these decisions. If one turns out to be wrong, stop and say so instead of working around it.

## Done when
- [ ] DOD3: `log read --date 2026-09-25` appends a line dated 2026-09-25, and the weekly view then shows ✓ for that day
- [ ] DOD4: The weekly view, run against a fixture file, shows the correct 7-day ✓/· grid and current streak for each habit
- [ ] The project's existing tests and type-check still pass.

## Testing checkpoint
Run the command behind each Done-when item and paste its real output. Tick an item only with that evidence; if one fails, fix it within this stage's scope or report it as open.

STOP after the testing checkpoint. Don't start stage 3: report what you built, the commands you ran and their output, then wait for the user to test it and say "continue".
```
