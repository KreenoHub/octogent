# Decisions

D-numbered decision log. Newest last.

<!-- op:id=D1 -->
## D1 — Terminal-native habit logging
- date: 2026-09-25
- status: stale
- source: octoplan session
- questions: Q1, Q2

The tool is a CLI so logging a habit costs no more than one command where the user already works. The main value is a visible streak that keeps habits from lapsing unnoticed (tentative).

<!-- op:id=D2 -->
## D2 — Single user, a few named habits, one machine
- date: 2026-09-25
- status: active
- source: octoplan session
- questions: Q3, Q4

One person tracks several named habits (e.g. `habit log read`). Assumes one machine with a local data file and no sync (parked Q3).

<!-- op:id=D3 -->
## D3 — No reminders in v1
- date: 2026-09-25
- status: active
- source: octoplan session
- questions: Q5

No notifications or scheduler. The user runs the command themselves, which keeps OS integration out of v1.

<!-- op:id=D4 -->
## D4 — Weekly view = 7-day grid + current streak
- date: 2026-09-25
- status: active
- source: octoplan session
- questions: Q6
- depends-on: D1, D2

The status output shows each habit's last 7 days as a grid, plus its current consecutive-day streak count.

<!-- op:id=D5 -->
## D5 — Habits created implicitly on first log
- date: 2026-09-25
- status: active
- source: octoplan session
- questions: Q7
- depends-on: D2

`habit log <name>` creates the habit if it doesn't exist yet, so there's no setup step. A typo creates a stray habit, so there needs to be a way to remove or rename one.

<!-- op:id=D6 -->
## D6 — Backdating via --date, plus undo
- date: 2026-09-25
- status: active
- source: octoplan session
- questions: Q8

Logging accepts `--date` for past days, and an undo removes a logged day, so a forgotten or mistaken log doesn't permanently break a streak.

<!-- op:id=D7 -->
## D7 — Local-first habit tracking the user owns
- date: 2026-09-25
- status: active
- source: octoplan session
- questions: Q1, Q2
- depends-on: D1

Replaces D1. The main reason for building this is data ownership: habit data lives in a local, plain file with no account or cloud service. It's still a CLI, but that is now how it's built rather than why. The visible streak remains the main user-facing value (tentative, Q2).

<!-- op:id=D8 -->
## D8 — v1 non-goals: sync, long history, non-daily schedules
- date: 2026-09-25
- status: active
- source: octoplan session
- questions: Q9
- depends-on: D3, D7

In addition to no reminders (D3), v1 has no sync, no history beyond 7 days, and daily habits only. This keeps the tool tiny and consistent with local-only ownership (D7).

<!-- op:id=D9 -->
## D9 — `habit rm <name>` with confirmation
- date: 2026-09-25
- status: active
- source: octoplan session
- questions: Q10
- depends-on: D5

Removes a habit and all of its history after a y/N prompt. This is how stray habits from implicit creation (D5) get cleaned up.

<!-- op:id=D10 -->
## D10 — Streak rule: an unlogged today doesn't break it
- date: 2026-09-25
- status: active
- source: octoplan session
- questions: Q11
- depends-on: D4

The current streak counts consecutive logged days back from today if today is logged, otherwise back from yesterday. The streak is 0 only once a full day has been missed.
