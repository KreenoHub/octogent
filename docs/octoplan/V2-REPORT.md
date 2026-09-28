# Octoplan v2 — report

v2 was planned in Octoplan itself: a deep interview recorded decisions D1–D43 in `docs/plan/`. Right after the interview, the user asked for one more feature, which added D44–D48: an Octoplan plan becomes Octogent tentacles, todos and an octopus prompt in a few clicks. It was built in one pass, by one worker per tentacle, against contracts the octopus committed first (D35).

## What changed for the user

| Pain point (D1) | v2 |
|---|---|
| Questions buried under reply text | The pending round sits in a **dock** above the composer (D14), and answered rounds shrink to **answer chips** (D25). |
| Walls of text | Replies fold to **one line** (D15), a turn's tool calls fold to **one row** (D19), and option descriptions **clamp to one line** (D43). **E** expands everything (R3). |
| Re-explaining decisions | A **plan digest** (≤60 lines) opens every session (D16) and repeats every 3 rounds (D18). It includes **your conventions** from `~/.octoplan/CONVENTIONS.md` (D28). Build-time decisions are **harvested** from commits into `HARVEST.md` for you to accept or reject (D27, D31). |
| No big picture | A **Tentacles n/m** header button (D42) opens **G** with pixel **tentacle cards** first (D21–D23). Decisions carry **drift badges** (implemented / untouched / diverged, D24, D26). The board adds a **History** tab, **needs-attention**, ideas, stages, branches and a sessions view (D9, D13). |
| Server restarts | Sessions **come back** after a restart, and an unanswered round comes back in the dock, answerable (D29, D30). |
| Plan → build | **Hand off to Octogent** (D44–D48): Claude proposes the tentacles, you review and edit them, Apply writes them into Octogent, and you get an octopus prompt to paste. |

### Hand off to Octogent (new)

On the plan board, click **Hand off to Octogent** (it appears once GOAL.md exists).

1. **Generate:** choose the todo heading. Claude reads the plan, stages, folders and existing tentacles, then proposes 3–8 tentacles. Each gets owned folders, plus one-line todos that have a "Done when…" and D-id stamps, grouped by wave. Without Claude, the fallback makes one tentacle per stage.
2. **Review:** rename, add or remove tentacles. Edit owned folders, and edit, move or delete todos. Edits autosave to `docs/plan/HANDOFF.md`.
3. **Apply:** writes into the checkout Octogent runs in, even from a git worktree (D48):
   - creates missing tentacles;
   - rewrites only the `<!-- octoplan:start/end -->` block of each CONTEXT.md, leaving hand notes and Octogent's block untouched;
   - appends todos under `## <heading>` / `### <wave>`.

   Applying twice adds nothing.
4. **Done:** shows per-tentacle results, an **Open Octogent** link and the octopus prompt (also in `docs/plan/OCTOPUS.md`) with a copy button. Spawning the agents stays one click in Octogent's Deck (D12).

Safety: `octogent tentacle create` is only called when the workspace has `.octogent/project.json`. Otherwise the CLI would fall back to port 8787, which could be a different project's Octogent.

## Gates

**Unit and component tests:**
- `pnpm --filter @octogent/octoplan test`: 474/474 (61 files)
- `pnpm --filter @octogent/octoplan-protocol test`: 44/44
- `pnpm --filter @octogent/octoplan build`: tsc and vite clean
- `biome check apps/octoplan packages/octoplan-protocol`: clean

**Live gate:** `pnpm --filter @octogent/octoplan e2e:v2` runs against real Claude, git and a *private* Octogent.
- It builds a throwaway repo with a plan.
- It starts Octogent on :9876 with a temp home, and Octoplan on :8795 with a temp `OCTOPLAN_HOME`.
- It pins `OCTOGENT_API_ORIGIN`, so it never touches your own Octogent or `~/.octoplan`.

```
PASS  DOD4 digest in the first user turn — starts with the digest: true; cites D1: true; 14 digest lines
PASS  DOD3 restart with a pending round — restored=true, status=waiting-for-answer, round back pending=true; Claude continued after the answer: true
PASS  DOD8 live quick-align — 4 questions as a card
PASS  DOD8 live brainstorm — 3 questions as a card
PASS  DOD8 live devils-advocate — 4 questions as a card
PASS  DOD9 header counts match todo.md checkboxes — overview 1/1 vs files 1/1
PASS  DOD5 drift badges + harvest H-record — D2 drift=implemented (f4be34f feat(cli): the three v1 commands [D2]); D1 drift=diverged; H1 Store the habit log in SQLite (~/.habits.db) instead of plain text contradicts [D1]
PASS  DOD11 handoff generate -> apply — Proposed 3 tentacles; 3/3 tentacles written (2 created, 10 todos added); heading in every todo.md; D-id stamps; HANDOFF.md applied; OCTOPUS.md
PASS  DOD6 hand notes outside the octoplan block unchanged — Owns/Rules lines intact
PASS  DOD12 worktree resolves to the main checkout
v2 E2E PASS
```

The remaining done-checks:

| Check | Where it's covered |
|---|---|
| DOD1 | The unit-test gates above. |
| DOD2 | Screenshots below, captured from a live gate run. |
| DOD7 (fork-PR badge) | `tests/integrations/forkPr.test.ts`. The gate's repo has no GitHub remote. |
| DOD10 (a week of real use) | Starts now. |

## Screenshots (`docs/octoplan/screenshots/`)

- `v2-dock-pending.png`: a pending round in the dock, with one-line option descriptions and the digest above.
- `v2-cockpit-dock.png`:
  - the digest opening a session;
  - "6 tools · Listed 1 pattern, read 5 files" folded into one row;
  - Round 1 as answer chips;
  - answers delivered after a server restart;
  - Needs attention showing unanswered rounds and the H1 harvest.
- `v2-expand-all.png`: the same stream after **E**.
- `v2-g-tentacle-cards.png`: G opens on tentacle cards, with the commit graph below.
- `v2-history-tab.png`: the History timeline.
- `v2-handoff-done.png`: the handoff Done step, with the octopus prompt and copy button.

## Notes

- `docs/plan/stages/` now follows the plan's waves: "Wave 3 — focus", "Wave 4 — memory", "Wave 5 — overview", then remaining goals, then integrate. Titles aren't truncated, and each stage lists at most 12 decisions, each with its `decisionIds`.
- The harvest runs automatically when a repo is opened, if there are new commits. "Harvest now" is on the board.
- OCTOPUS.md is written from Generate onward, not only at Apply, so a draft's prompt is never lost.
- `tests/bridge/branchConverge.test.ts` had a race: it branched from a block before that block was recorded. It now waits for the block, and four full runs in a row pass.
- `node scripts/captureUi.mjs <shots.json> <outDir>` re-captures screenshots, via headless Edge over the DevTools protocol.
