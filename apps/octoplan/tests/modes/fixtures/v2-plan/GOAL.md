# Goal — Octoplan v2 — fix the friction found in real use

## Why

In real use, all four v1 pain points came back: questions buried under reply prose, walls of text (prose, option descriptions, tool rows, the branch view), decisions re-explained across sessions, and no at-a-glance picture of what's happening across tentacles. If v2 doesn't fix them, the user drifts back to terminal chat and the plan→Octogent handoff goes unused.

## Goals

- The pending question round is always visible in a docked answer panel and survives server restarts (D14, D29, D30)
- Conversation stream is compact: one-line prose digests, answer chips, grouped tool rows, clamped option descriptions (D15, D19, D25, D43)
- Claude never needs decisions re-explained: capped plan digest at session start and every ~3 rounds, plus user-level conventions (D16, D18, D28, D32)
- Build-time decisions flow back through a headless harvest into HARVEST.md candidates you accept or reject (D11, D17, D27, D31)
- The G overlay answers 'what's going on across my tentacles' with pixel tentacle cards and opens from a visible header button (D21, D22, D23, D42)
- The plan board shows a needs-attention list, ideas/stages/branches, a cross-session view, drift badges and a History tab (D9, D13, D24, D26)
- Export preserves hand notes and stamps D-ids into todos; fork-PR badges are correct (D36, D37)
- One click-through handoff turns the plan into Octogent tentacles, todos and an octopus prompt (D44, D45, D46, D47, D48)

## Non-goals

- Editing upstream apps/web, apps/api or packages/core (D8)
- Multi-user, sharing or auth (D12)
- Starting or steering tentacle workers from Octoplan (D12)
- Mobile layout (D12)
- Tentacle workers reading or writing docs/plan directly (D10, D11)
- Cross-repo board aggregation (D13)
- Live worker running/idle status from the Octogent API (D22)

## Definition of done

- [ ] `pnpm --filter @octogent/octoplan test` and `pnpm --filter @octogent/octoplan-protocol test` pass, and `pnpm --filter @octogent/octoplan build` type-checks clean <!-- op:id=DOD1 status=unknown -->
- [ ] Running `pnpm --filter @octogent/octoplan e2e:v2` passes and saves headless screenshots of the dock, answer chips, G tentacle cards and History tab to docs/octoplan/screenshots/ <!-- op:id=DOD2 status=unknown -->
- [ ] In the e2e:v2 run, killing the server while a round is pending and restarting it shows the round again in the dock, and answering it produces Claude's next round <!-- op:id=DOD3 status=unknown -->
- [ ] Starting a session on a repo with an existing DECISIONS.md shows a digest of at most 60 lines in the session log's first user turn <!-- op:id=DOD4 status=unknown -->
- [ ] In the e2e:v2 run, a commit citing a D-id on an octogent/* branch flips that decision's drift badge to implemented, and a harvest run writes an H-record to docs/plan/HARVEST.md <!-- op:id=DOD5 status=unknown -->
- [ ] Exporting to a running Octogent creates the tentacle, writes todo lines stamped with D-ids, and leaves hand-written text outside the octoplan markers in CONTEXT.md unchanged <!-- op:id=DOD6 status=unknown -->
- [ ] `gh pr list` output with a fork PR headed at main shows no PR badge on local main in the G overlay <!-- op:id=DOD7 status=unknown -->
- [ ] e2e:v2 completes one live run each of Quick align, Brainstorm and Devil's advocate with every question arriving as a card <!-- op:id=DOD8 status=unknown -->
- [ ] The cockpit header shows a 'Tentacles n/m' button whose counts match the checkboxes in .octogent/tentacles/*/todo.md, and clicking it opens G <!-- op:id=DOD9 status=unknown -->
- [ ] After one week of real planning in Octoplan, the session files in docs/plan/sessions/ show the user's next project was planned there without falling back to terminal chat <!-- op:id=DOD10 status=unknown -->
- [ ] In e2e:v2, Generate → Apply in the handoff wizard creates the proposed tentacles in the Octogent workspace, writes todos under the chosen heading with D-id stamps, writes docs/plan/HANDOFF.md and OCTOPUS.md, and leaves existing CONTEXT.md hand notes unchanged <!-- op:id=DOD11 status=unknown -->
- [ ] Opening the wizard on a git worktree of a repo whose main checkout runs Octogent targets the main checkout's .octogent <!-- op:id=DOD12 status=unknown -->
