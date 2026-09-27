# Session — A tiny CLI habit tracker for one person: log a habit each da

- mode: deep-interview
- repo: C:\Users\kulis\Projects\octoplan-scratch-4
- started: 2026-09-27T11:44:04.542Z
- claude-session: a4209f74-7c46-46b2-aa58-3b92d449dae7
- octoplan-session: dd7ffc4e-2ae3-4f07-9868-6740e4979537

## Summary

I stopped the interview as you asked and wrote GOAL.md from what we have. All 7 done items are marked `partial`, because nothing has been built yet and the stack isn't chosen.

**Goal:** a tiny CLI habit tracker with three commands (`add`, `log [--date]`, weekly view) that keeps its data in a plain, append-only text file you own.

**Key decisions**
- **D9** replaced D1 after you changed your Q1 answer: owning the data in a plain file is now the main reason for the tool.
- **D2 and D5:** the core output is a weekly 7-day ✓/· grid plus the current consecutive-day streak.
- **D3:** one user on one machine. **D4:** 1–5 named habits.
- **D7:** a habit must be added with `add` before it can be logged. **D8:** one completion per habit per day.
- **D10:** a missed day can be logged later with `--date`. **D6 and D11:** no reminders, and no commands beyond the three; other fixes are done by editing the file.
- **D12 and D13:** the data is an append-only text log at `~/.habits`, which the `HABITS_FILE` environment variable can override.

**Open gaps**
- **G1:** no language or packaging chosen yet.
- **G2:** exact line format and parsing rules for the data file.
- **G3:** command names and the weekly-view layout.
- **G4:** edge cases such as future dates, midnight and timezone.
- **G5:** success measure, deploy, timeline and integrations were never discussed.
- **G6:** whether you'll use it on more than one machine.

**Risks and parked items**
- **R2:** it's still tentative that broken streaks are the core pain (your Q2 answer).
- **Q3 (parked):** assumes one user on one machine.

**Dimensions not covered**
- Only partial: users, flows and data.
- Never discussed: architecture, integrations, UX, risks, success, ops and timeline.
- Problem and scope are covered.

The Gmail, Google Calendar and Google Drive connectors on claude.ai aren't authorized and won't work until you connect them in your claude.ai connector settings. This session didn't need them.

## Answers

<!-- op:id=A1 -->
## A1 — Why build this now instead of using an existing habit app?
- question: Q1
- round: 1
- dimension: problem
- answer: Terminal-native, no account (Recommended)
- modifier: none
- answered-at: 2026-09-27T11:44:20.318Z

<!-- op:id=A2 -->
## A2 — What goes wrong if this doesn't exist?
- question: Q2
- round: 1
- dimension: problem
- answer: Streaks quietly break (Recommended)
- modifier: tentative
- answered-at: 2026-09-27T11:44:20.318Z

<!-- op:id=A3 -->
## A3 — Who uses it?
- question: Q3
- round: 1
- dimension: users
- answer: (parked)
- modifier: parked
- assumption: Just me, on one machine (Recommended)
- answered-at: 2026-09-27T11:44:20.318Z

<!-- op:id=A4 -->
## A4 — How many habits will you track at once?
- question: Q4
- round: 1
- dimension: users
- answer: A few named habits, 1–5 (Recommended)
- modifier: none
- answered-at: 2026-09-27T11:44:20.318Z

<!-- op:id=A5 -->
## A5 — What does "weekly streak" mean?
- question: Q5
- round: 2
- dimension: scope
- answer: 7-day grid + current run (Recommended)
- modifier: none
- answered-at: 2026-09-27T11:44:40.160Z

<!-- op:id=A6 -->
## A6 — Which of these are explicitly out of scope for v1?
- question: Q6
- round: 2
- dimension: scope
- answer: Reminders / notifications (Recommended)
- modifier: none
- answered-at: 2026-09-27T11:44:40.160Z

<!-- op:id=A7 -->
## A7 — What happens when you log a habit name that doesn't exist yet?
- question: Q7
- round: 2
- dimension: flows
- answer: Error; require `add` first (Recommended)
- modifier: none
- answered-at: 2026-09-27T11:44:40.160Z

<!-- op:id=A8 -->
## A8 — What does logging the same habit twice on one day do?
- question: Q8
- round: 2
- dimension: flows
- answer: No-op with a notice (Recommended)
- modifier: none
- answered-at: 2026-09-27T11:44:40.160Z

<!-- op:id=A9 -->
## A9 — Why build this now instead of using an existing habit app?
- question: Q1
- round: 1
- dimension: problem
- answer: Own my data in a plain file
- modifier: none
- revises: A1
- answered-at: 2026-09-27T11:44:41.164Z

<!-- op:id=A10 -->
## A10 — How do you fix a day you forgot to log?
- question: Q9
- round: 3
- dimension: scope
- answer: `log <habit> --date YYYY-MM-DD` (Recommended)
- modifier: none
- answered-at: 2026-09-27T11:45:11.539Z

<!-- op:id=A11 -->
## A11 — What else is in v1 beyond `add`, `log` and the weekly view?
- question: Q10
- round: 3
- dimension: scope
- answer: Nothing else; keep it tiny (Recommended)
- modifier: none
- answered-at: 2026-09-27T11:45:11.539Z

<!-- op:id=A12 -->
## A12 — What format is the data file?
- question: Q11
- round: 3
- dimension: data
- answer: Append-only text log, one line per entry (Recommended)
- modifier: none
- answered-at: 2026-09-27T11:45:11.539Z

<!-- op:id=A13 -->
## A13 — Where does the data file live?
- question: Q12
- round: 3
- dimension: data
- answer: Home dir default, env var override (Recommended)
- modifier: none
- answered-at: 2026-09-27T11:45:11.539Z
