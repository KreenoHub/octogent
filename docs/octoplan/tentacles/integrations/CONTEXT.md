# Octoplan Integrations

Connects Octoplan to the outside: exports plans into Octogent tentacles, and draws the git branch graph with PR/CI status and tentacle swimlanes.

## Owns
- `apps/octoplan/server/integrations/`: the Octogent export, git log/branch readers, `gh` readers, and the conversation↔git branch mapping.
- `apps/octoplan/web/src/integrations/`: the branch graph view (G), PR/CI badges, swimlanes, and their CSS.
- `apps/octoplan/tests/integrations/`.

## Read first
- `docs/octoplan/SPEC.md` §6 (branch graph), §7 (tentacle export), D14 and D15.
- Octogent's own rules for what you export into:
  - `docs/concepts/tentacles.md`: the first `# Heading` of CONTEXT.md is the Deck name and the first paragraph is the description; only `- [ ] ` / `- [x] ` lines in todo.md count
  - `docs/guides/working-with-todos.md`: one item = one agent assignment, and the order matters
  - `docs/reference/cli.md`: `octogent tentacle create <name> --description "..."`, which needs Octogent running in that repo
- `apps/web/src/styles/console-canvas-github.css`: Octogent's existing GitHub styling, for visual consistency. Read it; don't import upstream components.
- `packages/octoplan-protocol/src/domain.ts`: `GitBranchNode`, `PrStatus`, `TentacleLane`, `ConversationBranch`.

## What exists
Nothing here yet. All work is wave 2, and it starts after the MVP gate passes.

## Contracts
- Server readers are pure-ish functions that take an injected `exec(cmd, args, cwd)`, so tests never shell out. HTTP routes are exported as `registerIntegrationRoutes(router)`, and the octopus wires them into `server/createServer.ts`.
- The UI reads data through the ui-shell's `useOctoplan()` hook (plus any new events agreed with the octopus). No private sockets.
- Protocol changes go through the octopus.

## Constraints
- Spawn processes with an argument array, never a shell string. Branch names come from git and can contain odd characters.
- Everything degrades gracefully:
  - without `gh` or without auth, the graph shows no PR badges and a one-line hint
  - outside a git repo, it shows an empty state
- Poll `gh` with backoff (start 60 s, max 10 min) and only while the graph view is open.
- `octogent/<terminal-id>` worktree branches map to tentacles by the id prefix before `-swarm-` / `-todo-` (see `docs/guides/orchestrating-child-agents.md`).
- **Don't touch** `apps/web`, `apps/api`, `packages/core`, or other tentacles' folders.

## Test
`pnpm --filter @octogent/octoplan test -- tests/integrations` · `pnpm --filter @octogent/octoplan build` · `pnpm exec biome check apps/octoplan`. Use recorded `git log` / `gh --json` fixtures under `tests/integrations/fixtures/`.

## Done means
Run against this repo:
- the graph shows `main`, `feat/octoplan`, the upstream branches and the `octogent/*` worker branches in tentacle swimlanes with ahead/behind
- PR badges match `gh pr list --repo KreenoHub/octogent`
- exporting a plan creates or updates a tentacle that appears in Octogent's Deck with the right n/m done
