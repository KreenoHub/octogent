# Octoplan UI Shell

The cockpit: three-pane layout, conversation stream as collapsible cards, live plan board, focus mode, and the client-side session state everyone else renders from.

## Owns
- `apps/octoplan/web/src/`, meaning `App.tsx`, `main.tsx`, `app/` (client state, WS connection) and `components/` (layout, conversation stream, plan board, focus mode frame, idea modal, reply-card actions). The exceptions are `web/src/qcards/` (qcards), `web/src/components/coverage/` (modes) and `web/src/integrations/` (integrations).
- `apps/octoplan/web/src/styles/`: shared CSS. The other tentacles keep their CSS inside their own folders.
- `apps/octoplan/tests/ui-shell/`.

## Read first
- `docs/octoplan/SPEC.md` §6 (UI + keyboard map), D5, D6 and D13.
- `packages/octoplan-protocol/src/events.ts` (`ServerEvent`, `ClientEvent`, `PlanSnapshot`) and `domain.ts` (`MessageBlock`, `Session`, `QuestionRound`).
- Octogent's look, to match it (D13):
  - `apps/web/src/styles/foundation.css` and `console-theme-tokens.css`, which are already imported by `web/src/styles.css`
  - `apps/web/src/styles/console-canvas-deck.css`, for Silkscreen pixel headings and card chrome

## What exists
- `web/src/components/CockpitLayout.tsx`: a static three-pane shell (projects/sessions · conversation · plan board + 12-dimension coverage list).
- `web/src/app/useServerConnection.ts`: WS connect + hello and the ONLINE badge.
- `web/src/styles/cockpit.css`: `op-*` classes.
- Tests: `tests/cockpit.test.tsx` (jsdom via `// @vitest-environment jsdom`).
- Dev: `pnpm --filter @octogent/octoplan dev` serves on http://127.0.0.1:5190, with /api and /ws proxied to :8790.

## Contracts
- **Client store first** (todo 1). A reducer over `ServerEvent`s holds sessions, blocks per session, question rounds (+ answered state), and the plan snapshot per repo. It exposes a `sendClientEvent(event: ClientEvent)` that validates with `clientEventSchema` before sending.
  - qcards, modes and integrations READ this store through hooks you export from `web/src/app/`. They never open their own sockets.
- Slots for other tentacles. The layout exposes a mount point for each, and the owning tentacle builds the component:
  - question cards: `web/src/qcards/QuestionRoundCard.tsx` (`{ round, onAnswer }`)
  - coverage map: `web/src/components/coverage/CoverageMap.tsx` (`{ coverage }`)
  - graph: wave 2
  Until those land, render placeholders so the shell works alone.
- Protocol changes go through the octopus.

## Constraints
- AGENTS.md style: pure logic in `app/`, UI in `components/`, CSS split by concern in `styles/`. Containers orchestrate; they don't hold parsers.
- **No walls of text:**
  - Long `section` blocks render collapsed to their heading + first line, with a toggle.
  - Tool blocks are one-line rows.
  - Unanswered question rounds also show in an "Unanswered" tray at the top of the conversation until answered.
- **Keyboard-first:**
  - Global keys are F (focus), I (idea), B (branch), G (graph) and Esc.
  - Keys must not fire while an input or textarea is focused.
- Dark only, using Octogent tokens. Don't add a second palette.
- Local-only app: no analytics, no external requests except the Google Fonts import Octogent already uses.
- **Don't touch** `apps/web`, `apps/api`, `packages/core`, or other tentacles' folders.

## Test
`pnpm --filter @octogent/octoplan test -- tests/ui-shell` · `pnpm --filter @octogent/octoplan build` · `pnpm exec biome check apps/octoplan`. For visual checks, run `pnpm --filter @octogent/octoplan dev` and describe or screenshot what you see.

## Done means
With a fake event feed, the cockpit shows:
- sessions in the sidebar
- a streaming conversation with collapsible sections
- an Unanswered tray
- live plan-board counts
- focus mode toggling on F, with qcards/coverage placeholders replaced by the real components once merged
