# Coverage

Planning dimensions and how well the conversation has covered them.

<!-- op:id=problem -->
## problem — Problem & why
- status: covered
- confidence: medium
- questions: Q1, Q2

Why: own the habit data locally with no account or cloud (revised Q1). Cost of not doing it: habits silently lapse (tentative).

<!-- op:id=users -->
## users — Users
- status: partial
- confidence: low
- questions: Q4, Q3

Single user tracking a few named habits; one-machine setup is parked as an assumption.

<!-- op:id=scope -->
## scope — Scope & non-goals
- status: covered
- confidence: high
- questions: Q5, Q9

v1 = log (with --date), undo, rm, and the weekly view. Non-goals: reminders, sync, history beyond 7 days, non-daily schedules.

<!-- op:id=flows -->
## flows — Core flows
- status: covered
- confidence: high
- questions: Q6, Q7, Q8, Q10, Q11

Flows: log <name> [--date] (implicit create), undo, rm <name> with confirm, weekly view. The streak counts back from yesterday until today is logged.
