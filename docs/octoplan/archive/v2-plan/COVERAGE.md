# Coverage

Planning dimensions and how well the conversation has covered them.

<!-- op:id=problem -->
## problem — Problem & why
- status: covered
- confidence: high
- questions: Q1, Q2, Q3, Q5, Q6, Q7

Each D5 pain now has concrete causes: re-explaining (new session, same-session drift, build→plan gap, cross-repo), text walls (prose, option descs, tool rows, end outputs), big picture (in-flight tentacles, undecided, evolution, drift).

<!-- op:id=users -->
## users — Users
- status: covered
- confidence: high
- questions: Q4, Q11

One local human planner; Octogent tentacle workers consume only exported CONTEXT.md + todo.md, not docs/plan directly.

<!-- op:id=scope -->
## scope — Scope & non-goals
- status: covered
- confidence: high
- questions: Q8, Q9, Q10, Q12, Q13, Q14

Order: buried Qs + text walls, then memory, then big picture. Non-goals: upstream edits, multi-user, driving builds, mobile. Build decisions come back through Octoplan's harvest; board is scoped to this repo.

<!-- op:id=flows -->
## flows — Core flows
- status: covered
- confidence: high
- questions: Q15, Q16, Q17, Q18, Q19, Q20, Q21, Q22, Q23, Q24

Answer via dock → answered round collapses to chips; session start digest + recap every ~3 rounds; harvest → needs-attention accept/reject; G → tentacle cards → graph drill-down.

<!-- op:id=integrations -->
## integrations — Integrations
- status: covered
- confidence: high
- questions: Q25, Q12, Q39, Q40

Octogent todo.md read from disk; managed-block export with D-id stamps; fork-PR fix; live export verified against a running Octogent; harvest reads git on octogent/* branches.

<!-- op:id=ux -->
## ux — UX
- status: covered
- confidence: high
- questions: Q26, Q27, Q28, Q48, Q49

Dock, chips, prose digest, grouped tool rows, clamped descriptions, Tentacles header button, pixel tentacle cards, drift badges, History tab.

<!-- op:id=data -->
## data — Data
- status: covered
- confidence: high
- questions: Q29, Q30, Q31, Q32, Q33, Q34, Q35

HARVEST.md H-records filled by a headless Claude pass; CONVENTIONS.md C-records; D-ids stamped in todos and commits; session replay with orphaned rounds answered as a user turn; capped title digest.

<!-- op:id=architecture -->
## architecture — Architecture & stack
- status: covered
- confidence: high
- questions: Q36, Q37, Q38

Same stack and six tentacles; contracts-first octopus commit; pure digest builder in protocol; harvest runs as a headless locked-down SDK query; persistence via the session log + SDK resume.

<!-- op:id=risks -->
## risks — Risks
- status: covered
- confidence: medium
- questions: Q41, Q44

R1–R4 have mitigations; mode prompt drift is closed by gate runs. R4 has no automated gate check (the user didn't pick it). macOS PTY stays out (Windows only).

<!-- op:id=success -->
## success — Success metrics & DoD
- status: covered
- confidence: high
- questions: Q42, Q43, Q44

e2e:v2 gate (screenshots, restart recovery, harvest+drift, 3 mode runs, live export) plus one week of real use without terminal fallback.

<!-- op:id=ops -->
## ops — Ops & deploy
- status: covered
- confidence: high
- questions: Q45

Local pnpm dev, 127.0.0.1, no deploy; ~/.octoplan for user-level files; persistence survives reloads.

<!-- op:id=timeline -->
## timeline — Timeline & budget
- status: covered
- confidence: medium
- questions: Q46, Q47

Waves 3/4/5 (focus, memory, overview) within ~1 week, then a week of real use. The one-week pace is ambitious for harvest + drift.
