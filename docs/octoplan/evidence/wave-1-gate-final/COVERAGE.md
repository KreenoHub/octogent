# Coverage

Planning dimensions and how well the conversation has covered them.

<!-- op:id=problem -->
## problem — Problem & why
- status: covered
- confidence: medium
- questions: Q1, Q2

Revised: the motivation is owning habit data in a plain local file (still a CLI with no account); cost of not having it (tentative): streaks quietly break.

<!-- op:id=users -->
## users — Users
- status: partial
- confidence: low
- questions: Q4, Q3

Single user; one machine is a parked assumption; tracks 1–5 named habits.

<!-- op:id=scope -->
## scope — Scope & non-goals
- status: covered
- confidence: high
- questions: Q5, Q6, Q9, Q10

v1 = `add`, `log [--date]` and the weekly view. Non-goals: reminders, remove/rename, undo, history beyond 7 days (hand-edit the file instead).

<!-- op:id=flows -->
## flows — Core flows
- status: partial
- confidence: medium
- questions: Q7, Q8

`add <habit>` must come before `log <habit>`; logging an unknown name errors; a second log on the same day is a no-op with a notice.

<!-- op:id=data -->
## data — Data
- status: partial
- confidence: medium
- questions: Q11, Q12

Append-only text log with one line per entry, at ~/.habits by default with a HABITS_FILE override. Exact line grammar, habit-name rules and malformed-line handling are still open.
