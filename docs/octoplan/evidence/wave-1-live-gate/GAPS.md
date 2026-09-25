# Gaps

Things the plan does not answer yet.

<!-- op:id=G1 -->
## G1 — Single vs multi-machine use unconfirmed
- dimension: users
- status: open

Q3 was parked, so we're assuming one machine. If the user actually works on several machines, the sync non-goal (D8) needs revisiting.

<!-- op:id=G2 -->
## G2 — Data file format and location undecided
- dimension: data
- status: open

Undecided: the format (JSON / CSV / SQLite), the path (e.g. %APPDATA% or ~/.habits), and the schema for habits and dated log entries. D7 favors a human-readable plain file.

<!-- op:id=G3 -->
## G3 — Language, runtime and packaging not chosen
- dimension: architecture
- status: open

The repo is empty. Undecided: the language (e.g. Python, Node or Go), the arg parser, the test framework, and whether it ships as a single binary. It must run on Windows (the user's platform).

<!-- op:id=G4 -->
## G4 — Integrations: presumably none
- dimension: integrations
- status: open

This follows from D7/D8 (local-only, no sync) but was never confirmed, e.g. shell prompt integration or exporting data.

<!-- op:id=G5 -->
## G5 — CLI UX details open
- dimension: ux
- status: open

Open: the command name, the default command when run with no arguments (show the week?), the grid glyphs and color, the --date format, and exactly what `undo` targets (last log vs. a given habit/date).

<!-- op:id=G6 -->
## G6 — Risk review not done
- dimension: risks
- status: open

Only R2 has been logged. Not yet reviewed: data loss with no backup (D8), timezone/midnight edge cases for "today", and data file corruption.

<!-- op:id=G7 -->
## G7 — Success metrics and test command undefined
- dimension: success
- status: open

There is no agreed usage metric (e.g. used daily for 2 weeks) and no concrete test command yet, because the stack is still open.

<!-- op:id=G8 -->
## G8 — Install/distribution method undecided
- dimension: ops
- status: open

Undecided: how the CLI gets onto PATH (package manager, pipx/npm global, or a copied binary) and whether there's a backup recommendation for the data file.

<!-- op:id=G9 -->
## G9 — Timeline and effort budget not set
- dimension: timeline
- status: open

The only guidance is "keep it small". No time box has been agreed.
