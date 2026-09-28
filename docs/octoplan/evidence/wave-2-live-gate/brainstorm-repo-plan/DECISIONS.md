# Decisions

D-numbered decision log. Newest last.

<!-- op:id=D1 -->
## D1 — Core loop is daily check-off with streaks
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q1

The tracker's first job is marking habits done each day and showing streaks. Analytics and reminders are out of the initial scope.

<!-- op:id=D2 -->
## D2 — Logging a habit is a single command
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q2, Q3

Marking a habit done must take exactly one command with no prompts. The user has a terminal open all day, so near-zero friction is the main design constraint.

<!-- op:id=D3 -->
## D3 — Logging is a single `hb <habit>` command that toggles today's check-off
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q4, Q12
- depends-on: D1, D2, D4

From I1. There's no subcommand and no prompts, which meets the one-command rule (D2) with the least typing. Running it again undoes the check-off by appending a `-habit` line (D8), so it relies on the storage format in D4. Rough cost: about an evening, meaning argument parsing, a lookup of today's state, and one appended line.

<!-- op:id=D4 -->
## D4 — Store check-offs as `YYYY-MM-DD habit` lines appended to one plain-text file
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q5, Q12

From I2. A single append-only text file is the smallest possible storage: no schema, no migrations, and you can grep it or fix it in an editor. Streaks are computed each time the file is read, which is fast enough for one person's history. Rough cost: under an hour, meaning a line writer plus a line parser.

<!-- op:id=D5 -->
## D5 — `hb prompt` prints a compact streak badge
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q6, Q12
- depends-on: D4

From I3: a short status line meant for PS1/Starship, which acts as an ambient reminder for a user whose terminal is always open. It must be fast enough to run on every prompt.

<!-- op:id=D6 -->
## D6 — Bare `hb` shows a 7-day grid with streaks
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q7, Q12
- depends-on: D4

From I4: habits as rows, the last 7 days as columns (■/·), and the current streak on the right. This is the only view.

<!-- op:id=D7 -->
## D7 — Day offset for backfill: `hb <habit> -1`
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q11, Q12
- depends-on: D3

From I8: an optional negative day offset toggles a past day, so you can log a missed day without editing the file.

<!-- op:id=D8 -->
## D8 — Toggle-off appends an undo line
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q13
- depends-on: D3, D4

Toggling off writes a `YYYY-MM-DD -habit` line and the file is never rewritten. The reader replays the lines in order to work out the done-state for each day.

<!-- op:id=D9 -->
## D9 — Habits auto-create on first log
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q14
- depends-on: D3, D4

There's no `add` command. The set of habits is every name that appears in the log, and typos get cleaned up by hand-editing the file (D4).

<!-- op:id=D10 -->
## D10 — Prompt badge lists only habits not done today
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q15
- depends-on: D5, D9

`hb prompt` prints the habits still pending today and prints nothing once all are done. It works as a to-do nag, and streaks stay in the `hb` grid.

<!-- op:id=D11 -->
## D11 — Phone can check off habits, not just view
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q16
- depends-on: D1

In the phone-sync branch, the phone is a write client. It covers habits done away from the terminal. Reminders and notifications stay out of scope to keep the tool tiny. Builds on the check-off core (D1).

<!-- op:id=D12 -->
## D12 — Sync the plain-text log via a synced folder
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q17
- depends-on: D4, D11

The log lives in a Syncthing, Dropbox or iCloud folder, so there's no server and no git on the phone. This works only because storage is plain text (D4). The cost is near zero, but it depends on a third-party sync app.

<!-- op:id=D13 -->
## D13 — Phone logs through a shortcut that appends a line
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q18
- depends-on: D2, D12

A phone shortcut (iOS Shortcuts or an Android automation widget) appends a line in the same `YYYY-MM-DD habit` format to the synced log. There's no app to build, and one tap keeps D2's one-action rule on mobile. The cost is about an hour of shortcut setup.
