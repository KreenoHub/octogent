# Stage 5 — Integrate and verify end to end

## Goal

Every definition-of-done item in GOAL.md passes, checked end to end.

## Prompt

```text
# Tiny CLI habit tracker — Stage 5 of 5: Integrate and verify end to end

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
Stages 1–4 are done and tested:
1. Running `log` on a habit name that was never added exits no…
2. `log read --date 2026-09-25` appends a line dated 2026-09-2…
3. With HABITS_FILE set to a temp path, commands write to that…
4. The automated test suite passes on Windows (the test comman…
Build on them; don't redo or refactor them unless this stage needs it.

## Build this stage
Wire the stages together and close the gaps between them. Don't add features beyond GOAL.md; anything new goes in a note for the user, not in code.

## Decisions this stage relies on
- D2 — Weekly streak view is the core feature
- D3 — Single user, single machine, local data
- D4 — Support 1–5 named habits
- D5 — Streak = 7-day grid plus current consecutive-day run
- D6 — No reminders or notifications
- D7 — Habits must be added before logging
- D8 — One completion per habit per day
- D9 — Own the data: plain human-readable local file (CLI, no account)
- D10 — Backfill via `log <habit> --date YYYY-MM-DD`
- D11 — v1 is three commands; everything else is a file edit
- D12 — Append-only plain-text log file
- D13 — Data file at ~/.habits, overridable by HABITS_FILE
Follow these decisions. If one turns out to be wrong, stop and say so instead of working around it.

## Done when
- [ ] DOD1: Running `log` on a habit name that was never added exits non-zero and prints a message that suggests `add`
- [ ] DOD2: Running `log read` twice on the same day appends exactly one line to the data file and prints a notice the second time
- [ ] DOD3: `log read --date 2026-09-25` appends a line dated 2026-09-25, and the weekly view then shows ✓ for that day
- [ ] DOD4: The weekly view, run against a fixture file, shows the correct 7-day ✓/· grid and current streak for each habit
- [ ] DOD5: With HABITS_FILE set to a temp path, commands write to that file and ~/.habits is not created
- [ ] DOD6: After a run, the data file opens in a text editor and shows one readable `YYYY-MM-DD habit` line per log
- [ ] DOD7: The automated test suite passes on Windows (the test command depends on G1's stack choice)
- [ ] The full test suite and type-check pass from a clean checkout.

## Testing checkpoint
Re-run every Done-when check from scratch, in order, and paste the output of each. Report any item that fails with what you tried.

STOP after the testing checkpoint. This is the last stage: report each Done-when item with its evidence, then wait for the user to sign off.
```
