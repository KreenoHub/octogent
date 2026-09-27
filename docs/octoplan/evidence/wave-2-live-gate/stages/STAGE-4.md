# Stage 4 — The automated test suite passes on Windows (the test comman…

## Goal

Make DOD7 true.

## Prompt

```text
# Tiny CLI habit tracker — Stage 4 of 5: The automated test suite passes on Windows (the test comman…

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
Stages 1–3 are done and tested:
1. Running `log` on a habit name that was never added exits no…
2. `log read --date 2026-09-25` appends a line dated 2026-09-2…
3. With HABITS_FILE set to a temp path, commands write to that…
Build on them; don't redo or refactor them unless this stage needs it.

## Build this stage
Make these definition-of-done items true, and only these:
- DOD7: The automated test suite passes on Windows (the test command depends on G1's stack choice)

## Decisions this stage relies on
- D6 — No reminders or notifications
- D13 — Data file at ~/.habits, overridable by HABITS_FILE
Follow these decisions. If one turns out to be wrong, stop and say so instead of working around it.

## Done when
- [ ] DOD7: The automated test suite passes on Windows (the test command depends on G1's stack choice)
- [ ] The project's existing tests and type-check still pass.

## Testing checkpoint
Run the command behind each Done-when item and paste its real output. Tick an item only with that evidence; if one fails, fix it within this stage's scope or report it as open.

STOP after the testing checkpoint. Don't start stage 5: report what you built, the commands you ran and their output, then wait for the user to test it and say "continue".
```
