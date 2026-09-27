# Decisions

D-numbered decision log. Newest last.

<!-- op:id=D1 -->
## D1 — Terminal-native, account-free tool
- date: 2026-09-27
- status: stale
- source: octoplan session
- questions: Q1

The tool runs entirely in the terminal with no account or service. Why: logging should happen where the user already works, with nothing to sign up for.

<!-- op:id=D2 -->
## D2 — Weekly streak view is the core feature
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q2

The main pain is that streaks quietly break, so the weekly streak view is the core output and logging exists to feed it. Tentative (Q2).

<!-- op:id=D3 -->
## D3 — Single user, single machine, local data
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q3
- depends-on: D9

One person on one computer, with one local data file and no sync. Assumes "Just me, on one machine" (parked, Q3). Consistent with D9.

<!-- op:id=D4 -->
## D4 — Support 1–5 named habits
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q4

Commands take a habit name, and the tool supports a handful of habits at once. Why: covers real use without much extra complexity.

<!-- op:id=D5 -->
## D5 — Streak = 7-day grid plus current consecutive-day run
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q5
- depends-on: D2, D4

The weekly view shows each habit's last 7 days as ✓/· plus its current consecutive-day count. Why: gives both the weekly picture and the streak number, and both are cheap to compute.

<!-- op:id=D6 -->
## D6 — No reminders or notifications
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q6
- depends-on: D9

v1 has no schedulers, background processes or notifications; the user runs the command themselves. Still holds after the Q1 revision.

<!-- op:id=D7 -->
## D7 — Habits must be added before logging
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q7
- depends-on: D4

Logging an unknown habit name exits with an error that suggests `add`. Why: stops typos from creating junk habits and splitting streaks.

<!-- op:id=D8 -->
## D8 — One completion per habit per day
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q8

A day is either done or not done. Logging again on the same day is a no-op that prints a notice, and there are no rep counts.

<!-- op:id=D9 -->
## D9 — Own the data: plain human-readable local file (CLI, no account)
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q1
- depends-on: D1

Replaces D1. The main reason for the tool is data ownership: all history lives in one plain-text file the user can read, hand-edit, back up or move. It stays a terminal CLI with no account or service. Consequence: the file format must be readable without the tool, so no binary formats and no SQLite.

<!-- op:id=D10 -->
## D10 — Backfill via `log <habit> --date YYYY-MM-DD`
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q9
- depends-on: D8

`log` takes an optional `--date` so a forgotten day can be recorded. Why: keeps streaks accurate after a missed evening. The same-day no-op rule (D8) applies to the given date.

<!-- op:id=D11 -->
## D11 — v1 is three commands; everything else is a file edit
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q10
- depends-on: D9, D6

v1 has only `add`, `log` and the weekly view. There is no remove, rename, undo or longer history; the user edits the plain file for those (D9). Why: keeps the tool tiny.

<!-- op:id=D12 -->
## D12 — Append-only plain-text log file
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q11
- depends-on: D9

Data is one text file with one line per event, for example `2026-09-27 read`. Commands only append; reads parse the whole file. Why: easy to grep and hand-edit (D9), and file size is trivial at this scale.

<!-- op:id=D13 -->
## D13 — Data file at ~/.habits, overridable by HABITS_FILE
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q12
- depends-on: D3, D9

The default path is `~/.habits`, resolved from the home directory on Windows too. If the `HABITS_FILE` environment variable is set, it wins. Why: zero config, but the file can be moved into a backup folder.
