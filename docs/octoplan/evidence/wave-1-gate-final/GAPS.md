# Gaps

Things the plan does not answer yet.

<!-- op:id=G1 -->
## G1 — Language/stack and packaging not chosen
- dimension: architecture
- status: open

No language, runtime or install method has been decided; the repo is empty. The choice must work on Windows (the user's platform) and resolve `~` correctly there.

<!-- op:id=G2 -->
## G2 — Exact log-line grammar and parse rules
- dimension: data
- status: open

Still open: how habits are declared (e.g. a `+read` line), which characters are allowed in habit names (spaces?), and what to do with malformed hand-edited lines (skip with a warning, or fail).

<!-- op:id=G3 -->
## G3 — Command names and weekly-view layout
- dimension: ux
- status: open

Still open: the binary and subcommand names (e.g. `habit add/log/week`), whether running with no arguments shows the week, which day the grid starts on (last 7 days or Monday–Sunday), and whether a streak counts today before it is logged.

<!-- op:id=G4 -->
## G4 — Flow edge cases: future dates, midnight, timezone
- dimension: flows
- status: open

Still open: whether `--date` rejects future dates, and whether "today" means local time (assumed). The step-by-step first-run flow (when the file doesn't exist yet) is also unspecified.

<!-- op:id=G5 -->
## G5 — Success metrics, ops, timeline, integrations not discussed
- dimension: success
- status: open

The interview stopped early. No measure of personal success (e.g. used daily for 4 weeks), no install/release process, no time budget, and integrations (presumably none) were never confirmed.

<!-- op:id=G6 -->
## G6 — Multi-machine use unconfirmed (parked Q3)
- dimension: users
- status: open

Single-machine use is a parked assumption. If the user syncs ~/.habits across machines, append-only lines make merges easy, but duplicate lines must be tolerated when reading.
