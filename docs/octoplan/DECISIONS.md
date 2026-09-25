# Decisions

D-numbered decision log for building Octoplan itself. Newest last. This file uses Octoplan's own record format (see SPEC §5), so the store can read it.

<!-- op:id=D1 -->
## D1 — Separate app in the same repo
- date: 2026-09-25
- status: active
- source: alignment interview

`apps/octoplan` + `packages/octoplan-protocol` in the Octogent fork. Upstream `apps/web`, `apps/api` and `packages/core` stay untouched to keep `git merge upstream/main` painless.

<!-- op:id=D2 -->
## D2 — Real Claude Code sessions, not the raw Messages API
- date: 2026-09-25
- status: active
- source: alignment interview

Keeps skills, tools, repo access and the user's Claude Code login. No separate API key or billing.

<!-- op:id=D3 -->
## D3 — Hybrid transport
- date: 2026-09-25
- status: active
- source: alignment interview
- depends-on: D2

Structured Agent SDK events rendered as cards by default, plus a per-session "pop out terminal" running `claude --resume <id>`.

<!-- op:id=D4 -->
## D4 — Single local user
- date: 2026-09-25
- status: active
- source: alignment interview

No auth. The server binds to 127.0.0.1 only. Everything lives on disk.

<!-- op:id=D5 -->
## D5 — Pain points Octoplan must kill
- date: 2026-09-25
- status: active
- source: alignment interview

Questions get buried; walls of text; decisions forgotten between sessions; no big-picture view.

<!-- op:id=D6 -->
## D6 — Cockpit by default, focus mode on F
- date: 2026-09-25
- status: active
- source: alignment interview

A three-pane cockpit (projects/sessions · conversation cards · plan board + coverage), plus a full-screen one-question-at-a-time focus mode.

<!-- op:id=D7 -->
## D7 — Question-card powers: park, tentative, revise
- date: 2026-09-25
- status: active
- source: alignment interview

"Why is Claude asking" was not chosen as a headline feature; it is kept only as a collapsed detail.

<!-- op:id=D8 -->
## D8 — Four mode presets
- date: 2026-09-25
- status: active
- source: alignment interview

Deep interview, Quick align, Brainstorm / diverge, Devil's advocate / pre-mortem.

<!-- op:id=D9 -->
## D9 — Deep interview runs until coverage is green
- date: 2026-09-25
- status: active
- source: alignment interview
- depends-on: D8

No fixed question budget. The user can stop at any time.

<!-- op:id=D10 -->
## D10 — Markdown in each repo is the source of truth
- date: 2026-09-25
- status: active
- source: alignment interview

It lives in `docs/plan/` of the target repo. The UI is a view and any index is rebuildable.

<!-- op:id=D11 -->
## D11 — Four outputs
- date: 2026-09-25
- status: active
- source: alignment interview

GOAL.md / spec; tasks exported into an Octogent tentacle; staged build prompts; decision log + session summary.

<!-- op:id=D12 -->
## D12 — Standalone from SentiTools
- date: 2026-09-25
- status: active
- source: alignment interview

Octoplan ships its own prompts and mode logic. The Questioneer hook technique is prior art only.

<!-- op:id=D13 -->
## D13 — Match Octogent's retro-pixel look
- date: 2026-09-25
- status: active
- source: alignment interview

Octogent's tokens are imported directly, not copied.

<!-- op:id=D14 -->
## D14 — Extras in scope
- date: 2026-09-25
- status: active
- source: alignment interview

Idea inbox, coverage / gap map, conversation branching, card actions on replies, and a visual git/GitHub branch view.

<!-- op:id=D15 -->
## D15 — Branch view contents
- date: 2026-09-25
- status: active
- source: alignment interview
- depends-on: D14

A git graph including `octogent/*` worktree branches; conversation ↔ git branch mapping; PR + CI status; tentacle swimlanes with ahead/behind.

<!-- op:id=D16 -->
## D16 — MVP is the full deep interview
- date: 2026-09-25
- status: active
- source: alignment interview
- depends-on: D8, D9

Chosen over a thinner "live Q-card loop" first cut. Wave 1 is heavy; if it stalls, split revise + GOAL.md into a wave 1b.

<!-- op:id=D17 -->
## D17 — Six tentacles by layer
- date: 2026-09-25
- status: active
- source: alignment interview

bridge, store, ui-shell, qcards, modes, integrations.

<!-- op:id=D18 -->
## D18 — One app package with server/ and web/
- date: 2026-09-25
- status: active
- source: Prompt 1 implementation
- depends-on: D1

It mirrors apps/api + apps/web but in one package, so one `pnpm --filter @octogent/octoplan dev` runs everything. The halves only share code through `@octogent/octoplan-protocol`.

<!-- op:id=D19 -->
## D19 — AskUserQuestion is answered through the Agent SDK's canUseTool
- date: 2026-09-25
- status: active
- source: Prompt 1 implementation
- depends-on: D2, D3

Verified live with `@anthropic-ai/claude-agent-sdk@0.3.282` on Windows 11. `server/probe/askUserQuestionProbe.ts` intercepted the call, answered "Blue", and Claude replied "Blue" (`PROBE PASS`). The PreToolUse-hook fallback is documented but not built.

<!-- op:id=D20 -->
## D20 — zod 4 for all contracts
- date: 2026-09-25
- status: active
- source: Prompt 1 implementation

The Agent SDK's peer dependency is `zod ^4`, and SDK MCP tools take zod schemas, so the protocol uses the same library. It is the first validation library in the repo.

<!-- op:id=D21 -->
## D21 — One generic record format for every docs/plan list file
- date: 2026-09-25
- status: active
- source: Prompt 1 implementation
- depends-on: D10

The `<!-- op:id=X -->` anchor + `## X — Title` + `- key: value` meta + free body. Unknown keys, preambles and bodies survive rewrites. GOAL.md, session logs and stages have small dedicated codecs.

<!-- op:id=D22 -->
## D22 — Ports 8790 (server) and 5190 (web dev)
- date: 2026-09-25
- status: active
- source: Prompt 1 implementation

This avoids Octogent's 8787 range. They're overridable with `OCTOPLAN_PORT` / `OCTOPLAN_WEB_PORT`.

<!-- op:id=D23 -->
## D23 — Revisions are appended, never overwritten
- date: 2026-09-25
- status: active
- source: Prompt 1 implementation
- depends-on: D7, D10

A revised answer is a new session-log entry with `revises: A<n>`, so git history and the file itself both show how the thinking changed.

<!-- op:id=D24 -->
## D24 — Every todo item is one self-contained line
- date: 2026-09-25
- status: active
- source: Prompt 2 implementation
- depends-on: D17

Octogent's `parseTodoProgress` (`apps/api/src/deck/readDeckTentacles.ts`) passes only the `- [ ] …` line to worker prompts. Indented sub-bullets never reach a worker, so each item carries its full scope and ends with "Done when …".

<!-- op:id=D25 -->
## D25 — Directory ownership per tentacle, shared files via the octopus
- date: 2026-09-25
- status: active
- source: Prompt 2 implementation
- depends-on: D17

Each tentacle owns named directories plus `apps/octoplan/tests/<tentacle>/`. Cross-tentacle seams are interfaces owned by one side: `PlanStore` (store), `ModeDefinition` (modes), `useOctoplan()` (ui-shell) and `QuestionRoundCard` (qcards). The consumer codes against a fake until the interface merges. `packages/octoplan-protocol` and route wiring in `server/createServer.ts` belong to the octopus.

<!-- op:id=D26 -->
## D26 — Octogent runs for this repo from the main checkout
- date: 2026-09-25
- status: active
- source: Prompt 2 implementation

The project is initialized at `C:\Users\kulis\Projects\octogent` (display name "octogent", its own port, separate from the "Projects" workspace). Worktree-mode workers need the project root to be a git repo, which the Projects folder isn't. The tentacle mirror in `docs/octoplan/tentacles/` is the durable copy.

<!-- op:id=D27 -->
## D27 — Octoplan paths always check out with LF
- date: 2026-09-25
- status: active
- source: wave 1 octopus

With `core.autocrlf=true`, fresh Windows checkouts got CRLF and Biome failed every Octoplan file. `.gitattributes` forces `eol=lf` only for `apps/octoplan`, `packages/octoplan-protocol`, `docs/octoplan` and the tentacle sync script. Upstream files are left alone.

<!-- op:id=D28 -->
## D28 — Wave 1 octopus runs from a trusted Claude Code session
- date: 2026-09-25
- status: active
- source: wave 1 octopus
- depends-on: D17, D25

The Octogent-spawned octopus terminal stopped at Claude Code's folder-trust dialog, which only the user may accept. So the octopus runs from the main Claude Code session, with one subagent worker per tentacle in its own git worktree (`.claude/worktrees/w1-<tentacle>`, branch `octoplan/w1-<tentacle>`), all branched from the contract commit on `octoplan/octopus`. Octogent still tracks progress: ticked todos are pushed into `.octogent/tentacles` with the sync script, so the Deck shows n/m done. The `PlanStore` and `ModeDefinition` contracts were seeded by the octopus before the workers started.

<!-- op:id=D29 -->
## D29 — Re-include the CoverageMap folder in .gitignore
- date: 2026-09-25
- status: active
- source: wave 1 octopus

Upstream ignores `**/coverage/` (test-coverage output), which silently dropped `apps/octoplan/web/src/components/coverage/` from the modes commit. A single `!apps/octoplan/web/src/components/coverage/` line re-includes it. That's clearer than `git add -f`, which every future file in the folder would also need.
