# Decisions

D-numbered decision log. Newest last.

<!-- op:id=D1 -->
## D1 — v2 targets all four D5 pain points again
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q1, Q3

Real use showed buried questions, walls of text, re-explained decisions and no big picture all persist. v2 must address each; the failure cost is drifting back to terminal chat, which makes Octoplan shelfware.

<!-- op:id=D2 -->
## D2 — Live question round must never scroll away under reply text
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q2

The concrete burial was the live round card sliding under long reply sections. v2 keeps the active round visible regardless of conversation length (e.g. a fixed dock).

<!-- op:id=D3 -->
## D3 — Octogent agents are first-class consumers of the plan
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q4

Still single local user, no auth (D4). But tentacle workers read docs/plan and exported todos directly, so output formats must be agent-readable without chat history.

<!-- op:id=D4 -->
## D4 — Decision memory must hold in every context
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q5
- depends-on: D1

User wants all four re-explain causes fixed: (a) new sessions start with a decision digest from docs/plan, not just a "skim" instruction; (b) long sessions get a running recap; (c) decisions made while building in Octogent flow back into docs/plan; (d) cross-repo personal conventions are remembered. (d) bends D10 (per-repo markdown) and needs its own storage decision.

<!-- op:id=D5 -->
## D5 — Anti-wall-of-text applies to all four surfaces
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q6
- depends-on: D1

Between-round prose, option descriptions, tool-call rows and end outputs (summary/GOAL.md) were all too long. Each needs its own compaction: length caps + collapsed sections, truncated descriptions with expand, one grouped tool row per turn, and a one-screen digest of end outputs.

<!-- op:id=D6 -->
## D6 — Big picture must answer four questions at a glance
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q7
- depends-on: D1

What's in flight across tentacles; what's still undecided across sessions; how the plan evolved; where plan and reality drift. All four are wanted.

<!-- op:id=D7 -->
## D7 — First slice: buried questions + wall of text
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q8
- depends-on: D2, D5

v2 ships D2 and D5 first: they are UI/prompt fixes inside the session the user is already in, and they most directly stop the drift back to terminal chat. Decision memory (D4) and big picture (D6) follow.

<!-- op:id=D8 -->
## D8 — Non-goal: editing upstream Octogent apps
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q9

apps/web, apps/api and packages/core stay untouched (reaffirms v1 D1). Octogent state is read via its CLI and files only. Multi-user, build-driving and mobile were not marked non-goals and are clarified separately.

<!-- op:id=D9 -->
## D9 — Plan board additions
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q10
- depends-on: D6

Board gains: a needs-attention list (stale decisions, unanswered rounds, tentative risks); sections for ideas, stages and conversation branches; and a cross-session view aggregating every session in the repo. Goal/DoD progress was not selected.

<!-- op:id=D10 -->
## D10 — Agents consume exported CONTEXT.md + todo.md only
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q11
- depends-on: D3

Tentacle workers don't read docs/plan; the existing export path (v1 D24) stays the contract. Every exported todo must carry its decision context in its one line.

<!-- op:id=D11 -->
## D11 — Octoplan harvests build-time decisions; agents stay read-only
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q12
- depends-on: D4, D10

Resolves the D4(c) vs D10 conflict. Octoplan reads tentacle todo.md/CONTEXT.md changes and commit messages on octogent/* branches and proposes candidate decisions. The user accepts or rejects them into DECISIONS.md. Workers never write to docs/plan.

<!-- op:id=D12 -->
## D12 — Non-goals: multi-user, driving builds, mobile
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q13
- depends-on: D8

Together with D8 (no upstream edits), v2 excludes multi-user/sharing, starting or steering tentacle workers from Octoplan, and mobile layout. This keeps v2 on the four pain points.

<!-- op:id=D13 -->
## D13 — Cross-session board = all sessions in the current repo
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q14
- depends-on: D9

The board aggregates docs/plan of the open repo, sessions/ included. No cross-repo aggregation and no new storage (fits v1 D10).

<!-- op:id=D14 -->
## D14 — Pending round lives in a docked answer panel
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q15
- depends-on: D2, D7

The pending round renders in a fixed dock above the composer, so it's always visible without scrolling. The stream keeps only a compact stub that expands to the answered card afterwards. This replaces the jump-only UnansweredTray behaviour.

<!-- op:id=D15 -->
## D15 — Between-round prose collapses to a one-line digest
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q16
- depends-on: D5

Each assistant turn's prose shows as one line (the first line or a list of headings) and expands on click. UI-only: Claude's text is stored intact and prompts aren't relied on for length.

<!-- op:id=D16 -->
## D16 — Server injects a plan digest into every session's first turn
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q17
- depends-on: D4

At session start the bridge reads active DECISIONS, PARKED, GAPS, stale items and COVERAGE from docs/plan and prepends a compact digest to the first user turn. This is deterministic, so Claude can't skip it the way it skipped the prompt's "skim docs/plan" instruction.

<!-- op:id=D17 -->
## D17 — Harvest candidates appear in the needs-attention list
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q18
- depends-on: D11, D9

Harvest runs when a repo is opened or refreshed. Each candidate decision shows its source (commit or todo change) with accept and reject; accepting writes a D-record.

<!-- op:id=D18 -->
## D18 — Decision recap injected every ~3 rounds
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q21
- depends-on: D4, D16

Roughly every third answer turn, the bridge appends the current decision digest (the same builder as D16) so long sessions don't drift from earlier answers. It's deterministic, at a small token cost.

<!-- op:id=D19 -->
## D19 — Tool calls collapse to one grouped row per turn
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q22
- depends-on: D5

Each turn's tool calls render as one summary row (e.g. "Read 4 files, recorded 3 decisions") that expands. Plan-tool effects also flash on the board.

<!-- op:id=D20 -->
## D20 — Tentacle overview lives in the G overlay
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q19, Q20
- depends-on: D6

The big-picture tentacle view stays inside the G overlay; the board doesn't get a tentacle strip. The user has never actually seen the branch view, so its discoverability is an open issue that must be fixed for this to work.

<!-- op:id=D21 -->
## D21 — G overlay: tentacle summary first, commit graph as drill-down
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q23, Q24
- depends-on: D20, D5

Supersedes the "has never seen it" framing in D20. The user did open G, but it read as a text wall rather than a visual. The overlay now opens to a per-tentacle summary (todo n/m, ahead/behind main, PR/CI, last activity); the commit graph sits below as drill-down. It must be visual first (bars, colour, icons), not rows of text.

<!-- op:id=D22 -->
## D22 — Tentacle progress read from .octogent/tentacles/*/todo.md on disk
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q25
- depends-on: D8

Counts come from parsing checkbox todos, the same format as v1 D24. No Octogent API dependency, so it works while Octogent is down. Live worker running/idle status is out of scope.

<!-- op:id=D23 -->
## D23 — Tentacle cards: progress bar + status lights
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q26
- depends-on: D21, D22

In the G overlay, each tentacle is a pixel card showing its name, a todo n/m progress bar, CI and PR status dots, and ahead/behind arrows. It must be scannable in about 2 seconds and match the retro look (v1 D13).

<!-- op:id=D24 -->
## D24 — Drift badges on decisions + a History tab on the board
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q27
- depends-on: D6, D9

Each decision shows an implemented / untouched / diverged badge. A board History tab shows a timeline of decisions, revisions and branches from the session logs. Covers the "evolved" and "drift" parts of D6.

<!-- op:id=D25 -->
## D25 — Answered rounds collapse to answer chips
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q28
- depends-on: D5, D14

Once answered, a round renders one line per question ("header → answer" plus a modifier badge) and expands to revise.

<!-- op:id=D26 -->
## D26 — Drift is computed from decision ids in todos and commits
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q29
- depends-on: D24, D10

Tentacle export stamps the source decision ids (e.g. "[D14]") into each todo line. Workers cite them in commit messages, and Octoplan greps git log on the tentacle branches:
- untouched: no commits cite the decision
- implemented: its todo is ticked, or cited commits are merged
- diverged: a harvested candidate contradicts it
This relies on convention, so uncited work shows as untouched.

<!-- op:id=D27 -->
## D27 — Harvest candidates stored in docs/plan/HARVEST.md
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q30
- depends-on: D17

Candidates are H-records in the shared record format (v1 D21), with source (commit sha or todo diff), status (pending/accepted/rejected) and, once accepted, the resulting D id. They survive restarts, and rejected candidates don't reappear.

<!-- op:id=D28 -->
## D28 — User-level conventions in ~/.octoplan/CONVENTIONS.md
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q31
- depends-on: D4, D16

Cross-repo personal conventions (D4d) are C-records in ~/.octoplan/CONVENTIONS.md, next to projects.json. The D16/D18 digest includes them. This is an explicit, narrow exception to per-repo markdown storage (v1 D10).

<!-- op:id=D29 -->
## D29 — Sessions persist and replay across server restarts
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q32
- depends-on: D14

Closes wave-1 gap 4. After a restart, conversation cards and pending rounds are rebuilt from the session log (plus a stored block log if needed), and the Claude session resumes through SDK `resume`. A pending round must come back in the dock (D14).

<!-- op:id=D30 -->
## D30 — Orphaned rounds are restored in the dock and answered as a user turn
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q33
- depends-on: D29

After a restart, a round that was pending is rebuilt from the session log into the dock. Its answers go to the resumed Claude session as a plain user turn ("Answers to your last round: [Q7] …") with the same modifier encoding, because the original canUseTool promise is gone.

<!-- op:id=D31 -->
## D31 — Harvest uses a short headless read-only Claude pass
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q34
- depends-on: D27, D17

Each harvest runs one Agent SDK query, with the planning-mode lockdown (v1 D30), over commits and todo diffs since the last harvest mark. It outputs H-records through a plan tool. Runs on repo open/refresh (D17), only when there are new commits, to bound token cost.

<!-- op:id=D32 -->
## D32 — Digest = ids + titles + status, capped ~60 lines
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q35
- depends-on: D16, D18, D28

Holds active and stale decisions (id, title, status), open gaps, parked assumptions, coverage and conventions, capped at about 60 lines with newest first. Claude reads full bodies from docs/plan with Read when it needs them.

<!-- op:id=D33 -->
## D33 — v2 reuses the six v1 tentacles
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q36

bridge, store, ui-shell, qcards, modes and integrations keep their folder ownership (v1 D17/D25). v2 todos are appended to their todo.md files, and there are no new seams.

<!-- op:id=D34 -->
## D34 — Digest builder is a pure function in octoplan-protocol
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q37
- depends-on: D16, D18, D32

`buildPlanDigest(snapshot, conventions)` in packages/octoplan-protocol has no fs access. The bridge calls it for the session-start digest and the recap, and the web can preview it. The octopus owns it.

<!-- op:id=D35 -->
## D35 — v2 contracts seeded first by the octopus
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q38
- depends-on: D33

Before any worker starts, one octopus commit adds (with throwing stubs, as in v1 D33):
- H and C record types
- the plan_add_harvest tool
- drift fields on decisions
- the digest function signature
- session-replay and dock events
- tentacle-summary data in the git graph
- the History timeline type

<!-- op:id=D36 -->
## D36 — Export rewrites only an Octoplan-managed block in CONTEXT.md
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q39
- depends-on: D26, D10

Export writes between `<!-- octoplan:start -->` / `<!-- octoplan:end -->` markers and leaves hand notes and Octogent's managed block untouched. Todo lines carry D-id stamps (D26) and dedupe by text.

<!-- op:id=D37 -->
## D37 — Fix fork-PR badges; live-verify export against a running Octogent
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q40
- depends-on: D23

`gh pr list` adds `headRepositoryOwner`, so fork PRs no longer badge local `main`. The v2 live gate creates a real test tentacle through a running Octogent and checks CONTEXT.md, todo.md and the tentacle card.

<!-- op:id=D38 -->
## D38 — Success = v2 live gate passes + a week of real use
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q42
- depends-on: D1

v2 is done when an automated `e2e:v2` gate passes, and the user then plans their next real project in Octoplan for a week without falling back to terminal chat.

<!-- op:id=D39 -->
## D39 — v2 live gate contents
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q43, Q44
- depends-on: D29, D30, D26, D31, D37

The gate includes:
- headless screenshots of the dock, answer chips, G tentacle cards and History tab
- a server restart while a round is pending, which recovers in the dock and resumes Claude
- harvest + drift end to end: a commit citing a D-id flips the badge, and harvest writes an H-record
- one live run each of Quick align, Brainstorm and Devil's advocate
- a live tentacle export (D37)

"No settled decision re-asked" was not selected, so R4 has no automated check.

<!-- op:id=D40 -->
## D40 — Ops unchanged: local pnpm dev
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q45
- depends-on: D29

v2 runs with `pnpm --filter @octogent/octoplan dev` on 8790/5190, bound to 127.0.0.1. Harvest runs in-process, and ~/.octoplan holds projects.json and CONVENTIONS.md. D29 persistence covers tsx-watch reloads.

<!-- op:id=D41 -->
## D41 — Three waves by pain point, all within ~1 week
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q46, Q47
- depends-on: D7, D35, D38

Wave 3 (focus): dock, answer chips, prose digest, grouped tool rows, clamped option descriptions, session persistence.
Wave 4 (memory): digest builder, session-start digest, recap, CONVENTIONS.md, harvest + HARVEST.md, managed-block export with D-ids.
Wave 5 (overview): Tentacles header button, G tentacle cards, drift badges, History tab, fork-PR fix, the full e2e:v2 gate.
Each wave starts with its contracts commit (D35), and all three should land within about a week, matching v1's pace. The week of real use (D38) comes after.

<!-- op:id=D42 -->
## D42 — "Tentacles n/m" header button opens G
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q48
- depends-on: D20, D22

The cockpit header shows aggregate tentacle todo progress (from D22), opens the G overlay on click, and pulses when progress changes. This fixes the discoverability gap behind D20.

<!-- op:id=D43 -->
## D43 — Option descriptions clamp to one line
- date: 2026-09-27
- status: active
- source: octoplan session
- questions: Q49
- depends-on: D5

On question cards, each option's description is clamped to one line; the full text shows on hover or keyboard focus. UI-only, the prompt is unchanged.

<!-- op:id=D44 -->
## D44 — Plan → Octogent handoff is a click-through wizard
- date: 2026-09-27
- status: active
- source: user request after the v2 interview
- depends-on: D10, D33, D36

A "Hand off to Octogent" button on the plan board opens four steps: Generate (Claude proposes the tentacles), Review (rename, add, remove tentacles; edit owned folders; edit, move or delete todos), Apply (create missing tentacles, write CONTEXT.md managed blocks and todos), Done (open Octogent's Deck, copy the octopus prompt). Regenerating replaces the draft; nothing is written to Octogent until Apply.

<!-- op:id=D45 -->
## D45 — Claude proposes the tentacle split in a headless pass
- date: 2026-09-27
- status: active
- source: user request after the v2 interview
- depends-on: D31, D44

The proposal comes from one read-only Agent SDK query (the same runner as harvest, D31) that reads the repo layout, GOAL.md, DECISIONS.md, stages and any existing tentacles, and returns a handoff plan through a `plan_propose_handoff` tool: tentacles (id, name, description, owned folders, reuse-existing flag) and one-line todos with "Done when…" and D-id stamps, grouped by wave. Existing tentacles are reused when their folders match (D33). Without Claude, a fallback proposal splits the stages' tasks into one tentacle per stage.

<!-- op:id=D46 -->
## D46 — The handoff plan lives in docs/plan/HANDOFF.md
- date: 2026-09-27
- status: active
- source: user request after the v2 interview
- depends-on: D44

The reviewed plan is saved as markdown (T-records per tentacle, with todos as checkbox lines) so it survives restarts, can be hand-edited and shows up in git. It records its status (draft/applied), the target Octogent workspace and the todo heading.

<!-- op:id=D47 -->
## D47 — The handoff includes an octopus coordinator prompt
- date: 2026-09-27
- status: active
- source: user request after the v2 interview
- depends-on: D12, D35, D44

Apply writes docs/plan/OCTOPUS.md: a self-contained prompt for the coordinating Claude session (tentacles and their folders, waves in order, contracts-first, workers in disjoint folders, cite D-ids in commits). The Done step shows it with a copy button. Octoplan still doesn't start or steer workers (D12); spawning stays one click in Octogent.

<!-- op:id=D48 -->
## D48 — Export and handoff target the checkout Octogent runs in
- date: 2026-09-27
- status: active
- source: dogfooding the v2 plan
- depends-on: D36

For a repo opened from a git worktree, the Octogent workspace is the main worktree (from `git rev-parse --git-common-dir`) when its `.octogent/` exists, otherwise the repo itself. Todos go under a heading chosen in the wizard (default: the plan title), with `### Wave n` subheadings.
