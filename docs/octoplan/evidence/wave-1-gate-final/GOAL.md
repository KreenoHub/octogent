# Goal — Tiny CLI habit tracker

## Why

One person wants to track a handful of daily habits from the terminal and own that data in a plain file they can read and edit without the tool. Without a quick weekly view, streaks quietly break without being noticed. The tool stays deliberately tiny: three commands and one append-only text file.

## Goals

- `add <habit>` declares one of 1–5 named habits
- `log <habit> [--date YYYY-MM-DD]` records one completion per habit per day (a second log on the same day is a no-op with a notice)
- The weekly view shows each habit's last 7 days as ✓/· plus its current consecutive-day streak
- Data is an append-only plain-text log at ~/.habits, overridable by HABITS_FILE

## Non-goals

- Reminders or notifications
- Remove, rename or undo commands (edit the file instead)
- History beyond 7 days, charts
- Accounts, sync or multi-user support
- Rep counts per day

## Definition of done

- [ ] Running `log` on a habit name that was never added exits non-zero and prints a message that suggests `add` <!-- op:id=DOD1 status=partial -->
- [ ] Running `log read` twice on the same day appends exactly one line to the data file and prints a notice the second time <!-- op:id=DOD2 status=partial -->
- [ ] `log read --date 2026-09-25` appends a line dated 2026-09-25, and the weekly view then shows ✓ for that day <!-- op:id=DOD3 status=partial -->
- [ ] The weekly view, run against a fixture file, shows the correct 7-day ✓/· grid and current streak for each habit <!-- op:id=DOD4 status=partial -->
- [ ] With HABITS_FILE set to a temp path, commands write to that file and ~/.habits is not created <!-- op:id=DOD5 status=partial -->
- [ ] After a run, the data file opens in a text editor and shows one readable `YYYY-MM-DD habit` line per log <!-- op:id=DOD6 status=partial -->
- [ ] The automated test suite passes on Windows (the test command depends on G1's stack choice) <!-- op:id=DOD7 status=partial -->
