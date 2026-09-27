# Idea inbox

Captured ideas, waiting for a brainstorm.

<!-- op:id=I1 -->
## I1 — `hb <habit>` toggles today
- date: 2026-09-27
- tags: cheap, core, flow
- status: adopted

One verb-less command: `hb read` marks today done (running it again undoes it). Unknown habit names get auto-created. This is the smallest thing that meets the one-command rule, and takes about an evening to build.

<!-- op:id=I2 -->
## I2 — Append-only plain-text log
- date: 2026-09-27
- tags: cheap, data
- status: adopted

Store `2026-09-27 read` lines in ~/.habits.log. Streaks are computed on read, so you can hand-edit the file or grep it. There's no schema and no migrations, so the cost is tiny.

<!-- op:id=I3 -->
## I3 — Shell-prompt streak badge
- date: 2026-09-27
- tags: ambient, ux
- status: inbox

A `hb prompt` command prints a compact status like `📚3 🏃0` for PS1/Starship. The user always has a terminal open, so this acts as an ambient reminder at no extra cost. It needs to run in under 10ms.

<!-- op:id=I4 -->
## I4 — Week grid with no args
- date: 2026-09-27
- tags: view, cheap
- status: inbox

Bare `hb` prints the habits as rows against the last 7 days as columns (■/·), with the streak on the right. This one view replaces a separate stats command. The cost is small, just formatting.

<!-- op:id=I5 -->
## I5 — Git-commit as habit log (challenges framing)
- date: 2026-09-27
- tags: reframe, bold
- status: inbox

There's no app at all: the habit log is empty commits in a private repo (`git commit --allow-empty -m read`), and a git alias renders the streaks. Sync and history come for free. It stretches the idea of a "tool", and the output looks ugly.

<!-- op:id=I6 -->
## I6 — Streak freeze / grace day
- date: 2026-09-27
- tags: motivation
- status: inbox

Allow one missed day per week without breaking the streak. This cuts down on the rage-quit after a single miss, at the cost of a little extra streak logic.

<!-- op:id=I7 -->
## I7 — Auto-detect habits from shell history
- date: 2026-09-27
- tags: bold, ambient
- status: inbox

Rules like `git push` → "code" or `obsidian daily` → "journal" mark habits done automatically. That gives zero-command logging for terminal-native habits. It's a bold idea with fragile heuristics.

<!-- op:id=I8 -->
## I8 — Backfill yesterday with `hb read -1`
- date: 2026-09-27
- tags: flow, cheap
- status: inbox

A day offset lets you log a habit you forgot last night without editing any files. It's a one-flag cost and protects streaks from late-night forgetfulness.
