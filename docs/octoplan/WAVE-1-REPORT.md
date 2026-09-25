# Wave 1 report — deep-interview MVP

Date: 2026-09-25 · Branch: `feat/octoplan` · Coordinator: the octopus (D28)

**Result: the MVP loop works live against real Claude.** A deep interview on a scratch repo ran end to end:
- Claude asked 11 questions in 3 rounds, all as cards.
- One answer was parked, one marked tentative, and an earlier answer was revised.
- Claude recorded 10 decisions and 2 risks, and filled in coverage.
- GOAL.md was written with 7 checkable done items.

The full output is in [`evidence/wave-1-live-gate/`](./evidence/wave-1-live-gate/).

## What shipped

| Tentacle | What | Commit | Tests |
|---|---|---|---|
| contracts | `PlanStore`, `ModeDefinition`, `CoverageUpdate` (octopus) | `33d68ad` | — |
| qcards | Keyboard-driven question cards: park, tentative, revise, answered history, "why this question" | `dfef986` | 22 |
| store | Atomic fs PlanStore over `docs/plan`, session logs with revisions, watcher that ignores its own writes, rebuildable index | `11aa318` | 23 |
| modes | Four modes, the interview prompts, forward-only coverage engine, CoverageMap, GOAL.md builder | `ef83016`, `733220a` | 53 |
| ui-shell | Client store + `useOctoplan()`, session dialog and sidebar, collapsing conversation cards, Unanswered tray, plan board, focus mode | `89ccab0` | 34 |
| bridge | Agent SDK sessions, AskUserQuestion → rounds, `octoplan` MCP plan tools, revisions, stop, replay on reconnect | `7a2e5da` | 14 |
| integration | Real card and CoverageMap mounted in the cockpit slots; `e2e:live` gate driver | `09c6e62`, `ffd8c83`, `5b5c3dd` | — |
| protocol fix | An empty GOAL.md Why round-trips (found by the store worker) | `c68755c` | 1 |

The Octogent Deck (octogent project, :8789) shows every wave-1 item ticked: bridge 4/6, modes 5/7, qcards 4/4, store 4/5, ui-shell 5/7. The remaining items are wave 2.

## Gate evidence

These were run for real on 2026-09-25, Windows 11, Node 22.18:
- `biome check apps/octoplan packages/octoplan-protocol scripts/octoplan-tentacles.mjs` → 111 files, no errors
- `pnpm --filter @octogent/octoplan test` → 24 files, **152 passed**
- `pnpm --filter @octogent/octoplan-protocol test` → **27 passed**
- `pnpm --filter @octogent/octoplan build` → tsc clean + vite build OK

`pnpm --filter @octogent/octoplan e2e:live -- C:/Users/kulis/Projects/octoplan-scratch 3` ran against real Claude (log: [`e2e-run.log`](./evidence/wave-1-live-gate/e2e-run.log)):
```
[08:17:03] started deep interview
[08:17:16] round 1: answering Q1=none, Q2=tentative, Q3=parked, Q4=none
[08:17:33] round 2: answering Q5..Q8
[08:17:35] revising Q1 to "Own the data locally"
[08:17:57] round 3: answering Q9..Q11
[08:17:58] asking Claude to wrap up
[08:18:34] session idle
docs/plan files: COVERAGE, DECISIONS, GAPS, GOAL, PARKED, RISKS, sessions/…
coverage: problem=covered users=partial scope=covered flows=covered (8 others unknown: stopped early)
decisions: 10 (stale 1), parked 1, risks 2 · GOAL.md: 38 lines · E2E PASS
```

What that output shows:
- **Park:** Q3 became `PARKED.md` P1, and the session log records `modifier: parked`.
- **Tentative:** Q2 became `RISKS.md` R1. Claude also added a risk of its own, R2.
- **Revise:** Q1's revision is a new entry with `revises: A1`, and decision D1 is now `status: stale`.
- **Goal:** GOAL.md's done items are all checkable ("Running `habit log read` … shows today marked"). They are marked `partial`, with evidence pointing at the open gaps, because the user stopped early. That is exactly the spec's rule.

## Status of the MVP definition of done (SPEC §9)

| Item | Status |
|---|---|
| Lint, tests, builds green | ✅ scoped to Octoplan. Repo-wide `pnpm lint` still shows upstream's CRLF noise on Windows, and `apps/api` has 2 upstream failures on Windows. |
| Dev serves :5190 + health on :8790 | ✅ health verified live. The dev UI wasn't re-opened after the bridge merge, but the production build passes. |
| First round arrives as cards within 60 s | ✅ 13 s, at protocol level (the e2e drives the same WebSocket as the UI) |
| Answering resumes Claude, and answers land in `sessions/` | ✅ |
| Parking writes PARKED with the assumption | ✅ Claude restating the assumption in its next reply wasn't checked. |
| Tentative writes RISKS | ✅ |
| Revision → REVISION turn, stale decisions, Claude re-checks | ✅ turn + stale. Claude's `## Revision` reply wasn't asserted. |
| Coverage updates live, and COVERAGE.md matches | ✅ |
| Hand edit appears within 2 s, and unknown keys survive | ✅ store tests (~325 ms), not a manual UI check |
| GOAL.md + session summary | ✅ GOAL.md. ⚠️ Nothing writes the session `## Summary` automatically yet. |
| Focus mode by keyboard only | ✅ component tests |
| Screenshots in `docs/octoplan/screenshots/` | ❌ not taken, because no browser tooling was used in this run |

## Known bugs and gaps

1. **Session summary isn't written.** `writeSessionSummary` exists in the store, but nothing calls it at the end of a session.
2. **Q ids are unique per session only.** Two sessions in the same repo can both have a Q1 (D30).
3. **Section cards render markdown as plain text** (ui-shell). This is readable, but not formatted.
4. **The Goals count on the plan board** comes from `goal.goals`, because `PlanSnapshot` has no goal ids (ui-shell note).
5. **Unwired hotkeys:** I, B and G are wave-2 features. The hotkey bar shows them, but they do nothing yet.
6. **Leftover worktrees.** `.claude/worktrees/w1-*` and branches `octoplan/w1-*` hold only `node_modules`: no commits, and a few empty folders. Remove them with `git worktree remove --force .claude/worktrees/w1-<name>` and `git branch -D octoplan/w1-<name>`.

## Process notes (for wave 2)

- **Octogent's own octopus terminal** stopped at Claude Code's folder-trust dialog, which only the user may accept. Octogent then pasted the prompt and "No, exit" was selected. Before spawning terminals in a new folder, accept trust there once.
- **Subagents inherit the parent's worktree isolation.** Workers can't write to separate worktrees, and switching worktrees was denied as a bypass. They built in the octopus worktree instead, in disjoint folders with no git, and the octopus reviewed and committed each tentacle. It worked, but two workers lost their shells after an early switch attempt, so the octopus had to run their checks.
- The bridge was built by the octopus at the user's request, after the classifier denied resuming its worker.

## Wave-2 risks

- **Brainstorm idea statuses:** there's no plan tool to change an idea's status. Brainstorm needs one, possibly with a protocol change.
- **Pop-out terminal** reuses `node-pty`. On Windows, `node-pty`'s build scripts are currently ignored by pnpm (`pnpm approve-builds`). Verify before building on it.
- **Git graph and `gh`:** these must degrade cleanly on the fork, where Actions hasn't been enabled yet.
- **Prompt drift:** only the deep-interview prompt has been exercised live. Quick align, brainstorm and devil's advocate need at least one live run each.
