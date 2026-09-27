# Todo

- [x] **Client session store** — in `apps/octoplan/web/src/app/`, write a pure reducer `planClientReducer(state, ServerEvent)` plus a `useOctoplan()` hook built on it and on the existing socket. The hook exposes `sessions`, `blocksBySession`, `rounds` (with answered/pending), `planByRepo`, `activeSessionId`, `setActiveSession` and `sendClientEvent`, which validates with `clientEventSchema` and drops + logs invalid events. Replace `useServerConnection` usage in `App.tsx` with it (keep the ONLINE badge). Done when `tests/ui-shell/reducer.test.ts` covers every ServerEvent type, including out-of-order `round-answered` and duplicate `block` ids (dedupe by id).
- [x] **Session start + sidebar** — a "New session" dialog: repo folder path text input (Windows path, trimmed; show an inline error for empty), mode picker (Deep interview / Quick align / Brainstorm / Devil's advocate, from `modeIdSchema`) and a topic field. Submitting sends `start-session`. The sidebar groups sessions by repo with status dots (running / waiting-for-answer / idle / ended / error). Done when a test fills the dialog, asserts the exact `start-session` event sent, and the sidebar renders grouped sessions from a fake feed.
- [x] **Conversation stream as cards** — render `MessageBlock`s: `section` blocks collapse to heading + first line when longer than about 12 lines, with a toggle. `tool` blocks are compact one-line rows, and `user` blocks are right-aligned bubbles. A `question-round` block mounts the qcards slot (placeholder until `web/src/qcards/QuestionRoundCard.tsx` exists). An "Unanswered" tray pins pending rounds at the top. A composer at the bottom sends `send-message` with Enter, and Shift+Enter makes a newline. Done when tests assert collapse/expand, tray membership changes when `round-answered` arrives, and composer sends.
- [x] **Live plan board** — the right pane shows Goals / Decisions / Gaps / Parked / Risks with counts from `planByRepo[activeRepo]`. Each section expands to its records (id, title, status badge; stale decisions in the warning colour), and the coverage slot shows a placeholder until modes ships `CoverageMap`. Done when a test feeds two `plan` events and asserts counts and a stale badge update.
- [x] **Focus mode (F)** — a full-screen overlay showing the first pending round's questions one at a time: progress `n / ~m` (m = questions answered + pending), a coverage bar (share of dimensions `covered`) and the qcards slot. Esc exits. It must not trigger while typing in inputs. Done when a test toggles F on and off, asserts it ignores F inside the composer, and shows the progress text for a fake round.

## Wave 2

- [x] **Card actions on reply sections** — a hover/focus toolbar on each `section` card: **pin** keeps it in a pinned strip at the top. **collapse** toggles it. **→ task** sends `send-message` asking Claude to turn the section into a todo item, and **→ decision** does the same for a decision via `plan_record_decision`. **ask follow-up** prefills the composer with a quote. **park** sends a message asking Claude to park it with an assumption. Done when tests assert each action's resulting client event or local state.
- [x] **Idea capture (I)** — a global hotkey opens a small modal (title + optional tags) that sends `capture-idea` for the active repo. It closes on Enter/Esc, doesn't fire while typing, and a toast confirms the id. Done when a test presses I, submits, and asserts the event.

## v2

Planned in Octoplan (docs/plan/GOAL.md, DECISIONS.md D1–D43). Ids in brackets are the decisions each task implements; cite them in commit messages (D26).

### Wave 3 — focus (D41)

- [ ] [D14, D2] **Docked answer panel** — the pending round renders in a fixed dock above the composer (showing the latest prose digest line, R3); the stream keeps a compact stub that expands to the answered card. Replaces the jump-only UnansweredTray. Done when a component test with a long stream shows the pending round in the dock and a headless screenshot shows it visible without scrolling.
- [ ] [D15] **One-line prose digest** — each assistant turn's prose shows its first line (or its headings) and expands on click; stored text is untouched. Done when a component test renders a 40-line reply as one line and the full text after a click.
- [ ] [D19] **Grouped tool rows** — a turn's tool calls render as one summary row ("Read 4 files, recorded 3 decisions") that expands; plan-tool effects flash on the board. Done when a component test turns 7 tool calls into one row with the right counts.
- [ ] [R3] **Expand-all hotkey** — one key expands every collapsed digest, chip and tool row in the stream, and again collapses them. Done when a component test toggles all three kinds with the key.

### Wave 4 — memory (D41)

- [ ] [D17, D9] **Needs-attention list** — the board lists stale decisions, unanswered rounds, tentative risks and pending harvest candidates (source + accept/reject). Done when a component test shows each kind and accept sends the accept event.

### Wave 5 — overview (D41)

- [ ] [D42, D22] **Tentacles n/m header button** — the cockpit header shows aggregate todo progress, opens G on click, and pulses when the count changes. Done when a component test shows the counts from a fixture summary and a click opens the G overlay.
- [ ] [D9, D13] **Board sections** — ideas, stages and conversation branches sections, plus a cross-session view of every session in the repo. Done when a component test with the store aggregate fixture renders all four.
- [ ] [D24] **Drift badges + History tab** — each decision shows implemented / untouched / diverged; a History tab shows the timeline. Done when a component test renders all three badges and the timeline in date order.
