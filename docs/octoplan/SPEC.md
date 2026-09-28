# Octoplan — specification

Octoplan is a visual, calmer way to plan, brainstorm and manage projects with Claude Code than the terminal chat. It is built around **AskUserQuestion**: many question rounds for alignment, gap-finding and deep interviews. Every question is a card you can answer, park, mark "not sure", or revise later, while a live plan board shows what has been decided and what is still open.

It is a companion to Octogent (the multi-agent dashboard), not a replacement. Octogent runs the agents that *build*; Octoplan is where you *decide what to build*, and it hands the result to Octogent as tentacles and todos.

Status: foundation only (protocol + scaffold). The build plan is in [`docs/octoplan/tentacles/`](./tentacles/) once the tentacles are created, and the decision log is [`DECISIONS.md`](./DECISIONS.md).

## 1. Aligned decisions

These come from the alignment interview on 2026-09-25 and are recorded as D1–D17 in `DECISIONS.md`.

| Topic | Decision |
|---|---|
| Placement | Separate app in the same repo: `apps/octoplan` (+ `packages/octoplan-protocol`). Do not modify upstream apps/web or apps/api unless unavoidable, to keep upstream merges clean. |
| Engine | Real Claude Code sessions, not the raw Messages API. |
| Transport | Hybrid: structured by default (Claude Agent SDK / stream-json events rendered as cards), with a "pop out terminal" per session that opens `claude --resume <sessionId>` in a PTY/xterm. |
| Users | Just me, locally. No auth. localhost only. |
| Pain points to kill | Questions get buried; walls of text; decisions forgotten between sessions; no big-picture view. |
| Layout | Both: a three-pane cockpit by default (left: projects/sessions; center: conversation as collapsible cards; right: live plan board with Goals/Decisions/Gaps/Parked/Risks plus a coverage meter), and a full-screen one-question-at-a-time focus mode toggled with F. |
| Question-card powers | Park / answer later (Claude proceeds on a stated assumption and the question goes to PARKED); confidence / "not sure" (answer marked tentative, so Claude logs a risk and may re-ask); revise past answers (edit an old answer, and Claude re-checks the decisions that depended on it). "Why is Claude asking" is an optional collapsed detail, not a headline feature. |
| Modes (presets) | Deep interview (rounds of up to 4 questions until every coverage dimension is green; I can stop any time); Quick align (1–2 rounds, then a short plan); Brainstorm / diverge (Claude generates ideas, I star/merge/kill/park, then it converges); Devil's advocate / pre-mortem (attacks the plan with "what breaks?" questions to find gaps and risks). |
| Deep-interview stop rule | Until coverage is green: no fixed count. |
| Storage | Markdown files in each target repo under `docs/plan/` are the source of truth (git- and Claude-readable). The UI is a view over them, and any index is rebuildable. |
| Outputs | GOAL.md / spec (goals, non-goals, checkable definition of done); tasks exported into an Octogent tentacle (CONTEXT.md + todo.md checkbox items); staged build prompts; decision log + session summary. |
| SentiTools | Standalone: Octoplan ships its own system prompts and mode logic, with no runtime dependency on SentiTools skills. |
| Visual style | Match Octogent's retro-pixel look: reuse the tokens in apps/web/src/styles/console-theme-tokens.css and foundation.css (amber on near-black, PP Neue Machina / JetBrains Mono, Silkscreen for pixel headings, dark only). |
| Extras | Idea inbox / parking lot (hotkey I from anywhere, tagged to a project); coverage / gap map; branch a conversation (fork from any card, explore, merge back what's worth keeping); card actions on replies (pin, collapse, → task, → decision, ask follow-up, park); visual GitHub/git branch view. |
| Branch view shows | Git graph of local branches including Octogent worktree branches `octogent/<terminal-id>`; conversation branches mapped to the git branches that implemented them; PRs + CI status from `gh`; tentacle → branch swimlanes with ahead/behind main. |
| MVP (v1 must work end-to-end) | A full deep interview: start a session on any repo → Claude asks via AskUserQuestion → cards with park/tentative/revise → coverage map fills → docs/plan/ files written → GOAL.md produced. |
| Tentacles | 6 by layer: bridge, store, ui-shell, qcards, modes, integrations. |

## 2. Architecture

```
            browser (React 19 + Vite, apps/octoplan/web)
              │  WebSocket /ws  (ServerEvent / ClientEvent, zod-validated)
              ▼
  Octoplan server (Node 22 + ws, apps/octoplan/server)  :8790, 127.0.0.1 only
   ├─ bridge/        one Agent SDK query() per session
   │    ├─ canUseTool ─► AskUserQuestion → QuestionRound → UI → answers
   │    └─ in-process MCP server "octoplan" ─► plan_* tools
   ├─ modes/         system prompts, coverage dimensions, stop rules
   ├─ store/         docs/plan/*.md read/write + watcher + rebuildable index
   └─ integrations/  octogent CLI, git, gh
              │
              ▼
     target repo: docs/plan/  (source of truth, committed with the repo)
```

- **One package, two halves.** `apps/octoplan` holds `server/` and `web/` (D18). One `pnpm --filter @octogent/octoplan dev` starts both: the server on **8790** (`OCTOPLAN_PORT`) and Vite on **5190** (`OCTOPLAN_WEB_PORT`), with Vite proxying `/api` and `/ws`.
- **Contracts live in `packages/octoplan-protocol`.** It holds the domain types, wire events, answer encoding and markdown codecs, all framework-free. It follows the same rules as `packages/core` (no React, HTTP, fs or processes). Changes to it go through the octopus (see the tentacle CONTEXT files).
- **Upstream stays untouched.** Octoplan imports Octogent's CSS and public assets by relative path and never edits `apps/web`, `apps/api` or `packages/core`.
- **Security boundary.** The server binds to `127.0.0.1` by default and has no auth, which is acceptable only because it is single-user and local (D4). The bridge runs Claude in the target repo's cwd, so tool permissions follow that repo's Claude Code settings. Planning modes restrict tools to read-only exploration plus AskUserQuestion and the `plan_*` tools (§3.4).

## 3. Bridge (Claude Code sessions)

Verified live on 2026-09-25 with `@anthropic-ai/claude-agent-sdk@0.3.282` on Windows 11 (`pnpm --filter @octogent/octoplan probe:ask` → `PROBE PASS`).

### 3.1 Sessions
- `query({ prompt: AsyncIterable<SDKUserMessage>, options })`. Streaming-input mode is used so follow-up user turns, including revisions, can be pushed into a live session.
- Options used:
  - `cwd` = the target repo
  - `systemPrompt: { type: "preset", preset: "claude_code", append: <mode prompt> }`
  - `canUseTool`
  - `mcpServers: { octoplan: createSdkMcpServer(...) }`
  - `allowedTools` / `disallowedTools` per mode
  - `abortController`
  - `includePartialMessages` for live typing
- The session id comes from the `system`/`init` message (`session_id`) and is stored in `Session.claudeSessionId` and in the session log header.
- Messages map to `MessageBlock`s:
  - Assistant text is split into **sections** at markdown headings. This is the anti-wall-of-text rule: long sections render collapsed with a first-line summary.
  - `tool_use` blocks become compact tool rows.
  - AskUserQuestion becomes a `question-round` block.

### 3.2 AskUserQuestion interception (the core loop)
1. Claude calls `AskUserQuestion` with `{ questions: [{ question, header, options: [{label, description, preview?}], multiSelect }] }` (1–4 questions, 2–4 options each).
2. `canUseTool("AskUserQuestion", input)` does not resolve yet. The bridge assigns `Q<n>` ids, emits `question-round`, and sets the session status to `waiting-for-answer`.
3. The UI sends `answer-round` with `Answer[]`.
4. The bridge resolves `{ behavior: "allow", updatedInput: { ...input, answers: encodeAnswersForTool(questions, answers) } }`. The answers map is keyed by question text, and multi-select answers are comma-joined.
5. The store appends the answers to the session log. Parked answers also create a `PARKED.md` item, and tentative answers create a `RISKS.md` item.

Fallback (not needed today, kept for SDK regressions): a PreToolUse command hook with a long timeout that long-polls the server and returns `hookSpecificOutput { permissionDecision: "allow", updatedInput: {..., answers} }`.

### 3.3 Answer modifiers → Claude
Answers are plain strings, so the modifiers are spelled out. These are implemented in `packages/octoplan-protocol/src/answerEncoding.ts`:

| Modifier | String sent to Claude |
|---|---|
| none | `Magic link` (multi-select and Other text are comma-joined) |
| tentative | `Magic link (TENTATIVE — log as a risk, re-ask if it matters)` |
| parked | `PARKED — proceed assuming "<assumption>"; this is logged in PARKED.md.` |
| revision | a new user turn: `REVISION of Q4: was "A", now "B". Re-check decisions D2, D5 that depended on it and report what changes.` |

The UI marks every decision whose `questions`/`depends-on` includes the revised question as `stale` until Claude re-confirms or supersedes it.

### 3.4 Plan tools (in-process MCP server `octoplan`)
`createSdkMcpServer({ name: "octoplan", tools: [...] })`, exposed to Claude as `mcp__octoplan__<tool>`, with zod 4 schemas:

| Tool | Effect |
|---|---|
| `plan_record_decision` | upsert D-record (title, body, questionIds, dependsOn) |
| `plan_update_coverage` | set a dimension's status/confidence/note, link questions |
| `plan_add_gap` / `plan_add_risk` | new G/R record |
| `plan_park` | new P record with assumption |
| `plan_add_idea` | new I record in the inbox |
| `plan_write_goal` | write GOAL.md (goals, non-goals, DoD items with status) |

Tool allowlist in planning modes: `Read`, `Glob`, `Grep`, `AskUserQuestion`, `mcp__octoplan__*`. Anything else is denied by `canUseTool` with a message telling Claude it is in a planning session.

### 3.5 Branching and pop-out
- **Branch a conversation:** `query({ options: { resume: claudeSessionId, forkSession: true } })`, or the SDK's `forkSession()` function. The branch is recorded in `branches.md` (B-records: session, parent-session, forked-from, git-branch, status).
- **Pop out terminal:** open `claude --resume <claudeSessionId>` in a node-pty + xterm panel, the same terminal stack Octogent uses.

## 4. Modes and coverage

The 12 coverage dimensions are defined in `COVERAGE_DIMENSION_LABELS`: problem & why, users, scope & non-goals, core flows, data, architecture & stack, integrations, UX, risks, success metrics & DoD, ops & deploy, timeline & budget. Each has a status (`unknown` / `partial` / `covered`), a confidence (`low` / `medium` / `high`), linked question ids and a note.

| Mode | Dimensions | Round size | Stop rule | Output |
|---|---|---|---|---|
| Deep interview | all 12 | ≤4 questions | every dimension `covered`, or user stops | GOAL.md + decision log + session summary |
| Quick align | problem, scope, flows, success | ≤4 | after 1–2 rounds | short plan in the session summary |
| Brainstorm / diverge | problem, users, flows | ideas board, then ≤4 | user converges | starred ideas → decisions / IDEAS.md |
| Devil's advocate | risks, ops, data, integrations, success | ≤4 "what breaks?" | user stops | RISKS.md + GAPS.md |

Every mode prompt requires Claude to:
- ask every question through AskUserQuestion, never as plain text
- give 2–4 concrete options with the recommended one first, labelled "(Recommended)"
- call `plan_update_coverage` and `plan_record_decision` after each answered round
- honor the PARKED / TENTATIVE / REVISION markers

## 5. Storage: `docs/plan/` in the target repo

Markdown is the source of truth (D10). Any in-memory index is rebuilt from these files, and a file watcher shows your hand edits in the UI live.

| File | Content | IDs |
|---|---|---|
| `DECISIONS.md` | decision log | D1… |
| `PARKED.md` | parked questions and their assumptions | P1… |
| `IDEAS.md` | idea inbox | I1… |
| `GAPS.md` | open questions the plan doesn't answer | G1… |
| `RISKS.md` | risks, including every tentative answer | R1… |
| `COVERAGE.md` | one record per dimension | dimension id |
| `GOAL.md` | goal doc: Why / Goals / Non-goals / Definition of done | DOD1… |
| `branches.md` | conversation branch ↔ git branch | B1… |
| `sessions/YYYY-MM-DD-<slug>.md` | session header, summary, chronological answer log | A1… (a revision is a new entry with `revises: A3`) |
| `stages/STAGE-n.md` | staged build prompt (Goal + fenced Prompt) | n |

List files share one record format, implemented in `packages/octoplan-protocol/src/markdown/records.ts`:

```md
# Decisions

Any intro text you like — preserved.

<!-- op:id=D1 -->
## D1 — Use the Agent SDK
- date: 2026-09-25
- status: active
- questions: Q3
- depends-on: D2
- owner: alex            ← unknown keys you add survive every rewrite

Free-form body, preserved.
```

The `<!-- op:id=… -->` comment is the only hard anchor. Titles, bodies and extra keys are yours to edit. A record a human breaks is skipped with a warning, never crashes a read. Round-trips are pinned by tests (`parse(serialize(x))` deep-equals `x`; CRLF input accepted).

## 6. UI

- **Cockpit (default).**
  - Left: projects (repos) and their sessions.
  - Center: the conversation as collapsible cards. Question rounds are pinned inline and also in an "Unanswered" tray until answered.
  - Right: the plan board (Goals / Decisions / Gaps / Parked / Risks with counts) and the coverage map (12 bars coloured unknown / partial / covered).
- **Focus mode (F).** Full screen, one question at a time, with progress `n / ~m` and the coverage bar. Back, skip, park and confirm are all on the keyboard.
- **Question card.** Options with descriptions, previews rendered monospace side by side, the "(Recommended)" option highlighted, and an Other free-text field. Once answered, the card shows the chosen answer plus its modifier badge and revision chain, and "why this question" (dimension + what changes) is available as a collapsed detail.
- **Card actions on reply sections:** pin, collapse, → task, → decision, ask follow-up, park.
- **Idea capture (I)** is a modal available from anywhere. It writes to `IDEAS.md` of the current project.
- **Branch graph (G):**
  - an SVG lane graph from `git log --all --format=%H|%P|%D|%s|%at`
  - `octogent/<terminal-id>` branches grouped into tentacle swimlanes with ahead/behind main (`git rev-list --left-right --count main...<branch>`)
  - PR + CI badges from `gh pr list --json` / `gh pr checks`
  - conversation branches from `branches.md` drawn next to their git branch
- **Style:** Octogent tokens imported directly (`foundation.css` then `console-theme-tokens.css`), Silkscreen for pixel headings, red hotkey bar as in Octogent's nav, dark only.

### Keyboard map

| Key | Action |
|---|---|
| 1–9 | pick option |
| Space | toggle option (multi-select) |
| O | Other (free text) |
| T | mark tentative |
| P | park |
| R | revise the selected past answer |
| Enter | confirm round |
| F | focus mode |
| I | idea capture |
| B | branch conversation from the selected card |
| G | branch graph |
| Esc | back / close |

## 7. Outputs

1. **GOAL.md** via `plan_write_goal` at the end of a deep interview. Every DoD item must be checkable by running something.
2. **Tentacle export:**
   - `octogent tentacle create <id> --description …` if the tentacle is missing (Octogent must be running)
   - then write `CONTEXT.md` (first heading + first paragraph are what Deck shows) from GOAL.md + decisions
   - append tasks to `todo.md` as `- [ ] …` items, each runnable by one agent without chat history and ending in "Done when …"
3. **Staged build prompts:** `stages/STAGE-n.md`, each a self-contained prompt that builds one stage and stops at a testing checkpoint.
4. **Decision log + session summary:** `DECISIONS.md` and the session file's `## Summary`.

## 8. Non-goals for v1

- Multi-user, auth, sharing, cloud hosting.
- Mobile layout.
- Replacing Octogent's terminals or tabs; Octoplan never edits `apps/web` / `apps/api`.
- Talking to the raw Messages API.
- A runtime dependency on SentiTools skills.

## 9. Definition of done for the MVP

Each item is checked by running something. The octopus pastes the output in `WAVE-1-REPORT.md`.

- [ ] `pnpm lint && pnpm test` are green, and `pnpm --filter @octogent/octoplan build` + `pnpm --filter @octogent/octoplan-protocol build` type-check clean.
- [ ] `pnpm --filter @octogent/octoplan dev` serves the cockpit on :5190 and `GET /api/health` on :8790 returns `{"ok":true}`.
- [ ] Starting a **Deep interview** on a scratch repo (`git init` + README) shows Claude's first round as question cards within 60 s. No question ever appears as plain text in the conversation.
- [ ] Answering a round resumes Claude, and the next round arrives. The answers appear in `docs/plan/sessions/<date>-<slug>.md`.
- [ ] Parking a question writes a `PARKED.md` record with the assumption, and Claude's next reply states that assumption.
- [ ] Marking an answer tentative writes a `RISKS.md` record.
- [ ] Revising an earlier answer sends a REVISION turn, marks the dependent decisions `stale` in the UI, and Claude replies with what changes.
- [ ] The coverage map updates live from `plan_update_coverage`, and `COVERAGE.md` matches the UI after a reload.
- [ ] Hand-editing `DECISIONS.md` while a session runs shows the edit in the UI within 2 s, and unknown keys survive the next write.
- [ ] Ending the interview (all green or "stop") writes `GOAL.md` with at least one DoD item, and a session `## Summary`.
- [ ] Focus mode (F) answers a full round with the keyboard only.
- [ ] Screenshots of the cockpit and focus mode are in `docs/octoplan/screenshots/`.
