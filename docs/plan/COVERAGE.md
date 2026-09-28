# Coverage

Planning dimensions and how well the conversation has covered them.

<!-- op:id=problem -->
## problem — Problem & why
- status: covered
- confidence: high

Three frictions left after v2: rigid entry (existing repo and topic only, outside material ignored), a manual Octogent start after handoff, and a cockpit that hides the workflow (D49).

<!-- op:id=users -->
## users — Users
- status: covered
- confidence: high

Still one local human planner. Tentacle workers still consume only exported CONTEXT.md and todo.md (D10).

<!-- op:id=scope -->
## scope — Scope & non-goals
- status: covered
- confidence: medium

In scope: two entry paths, import with a review, Run Octogent, the stepper and next-action bar, and visible buttons. Out: git URLs (G2), steering workers, process supervision, upstream edits.

<!-- op:id=flows -->
## flows — Core flows
- status: covered
- confidence: medium

Home → new (create folder → Interview) or import (sources → ingest pass → Understand review → Apply → gap-focused Interview) → Goal → Stages → Hand off → Run Octogent → Build. When Interview counts as done is open (G3).

<!-- op:id=integrations -->
## integrations — Integrations
- status: covered
- confidence: high

The Octogent CLI (`octogent init`, `octogent`), runtime.json under ~/.octogent/projects/<id>/state/, and OS terminals (wt/cmd, osascript, x-terminal-emulator) (D59–D61).

<!-- op:id=ux -->
## ux — UX
- status: covered
- confidence: medium

Stepper on top, the 3-pane cockpit kept, the centre following the step, one next action at the bottom, and hotkey features on buttons (D62–D65). Screen-level layout is settled in wave 8.

<!-- op:id=data -->
## data — Data
- status: partial
- confidence: medium

New file docs/plan/INGEST.md and pasted sources in docs/plan/sources/. Which file kinds ingest reads is open (G4).

<!-- op:id=architecture -->
## architecture — Architecture
- status: covered
- confidence: medium

deriveWorkflow is a pure function in octoplan-protocol; ingest reuses the headless runner with `additionalDirectories`; the launcher is an injected module. Ingest caps are open (G5).

<!-- op:id=risks -->
## risks — Risks
- status: covered
- confidence: medium

R6–R10.

<!-- op:id=success -->
## success — Success criteria
- status: covered
- confidence: high

The e2e:v3 gate, plus a live Windows launch, plus the next real project started from the home screen (DOD1–DOD11).

<!-- op:id=ops -->
## ops — Ops
- status: covered
- confidence: high

Unchanged: local pnpm dev. The octogent CLI must be on PATH for Run Octogent (D59).

<!-- op:id=timeline -->
## timeline — Timeline
- status: partial
- confidence: low

Contracts, then waves 6, 7 and 8 (D67). No date set; wave 7 (import) is the largest.
