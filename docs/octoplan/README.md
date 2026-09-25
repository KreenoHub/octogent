# Octoplan

A visual planning cockpit for Claude Code, built around AskUserQuestion. See [SPEC.md](./SPEC.md) for what it is and [DECISIONS.md](./DECISIONS.md) for why.

## Status

The foundation is in place: the shared protocol (`packages/octoplan-protocol`) and a booting app shell (`apps/octoplan`). Claude sessions, question cards and the plan board arrive in wave 1.

## Run it

```bash
pnpm install
pnpm --filter @octogent/octoplan dev
```

- Web UI: http://127.0.0.1:5190
- Server: http://127.0.0.1:8790/api/health (WebSocket at `/ws`)
- To change the ports, set `OCTOPLAN_PORT` and `OCTOPLAN_WEB_PORT`.

The server binds to 127.0.0.1 only. There is no auth by design (single local user).

## Check it

```bash
pnpm --filter @octogent/octoplan-protocol test    # markdown round-trips, answer encoding, wire events
pnpm --filter @octogent/octoplan test             # server health/ws + cockpit render
pnpm --filter @octogent/octoplan build            # type-check + production web build
pnpm --filter @octogent/octoplan probe:ask        # LIVE: proves the SDK lets us answer AskUserQuestion
```

`probe:ask` uses your Claude Code login and makes one short real request.

## Tentacles (how Octoplan gets built)

Six Octogent tentacles, one per layer (D17). Each owns specific directories and its own `apps/octoplan/tests/<tentacle>/` folder, so parallel workers don't collide. Shared wiring (`server/createServer.ts` routes from other tentacles) and `packages/octoplan-protocol` go through the octopus.

| Tentacle | Owns | Wave 1 | Wave 2 |
|---|---|---|---|
| `bridge` | `server/bridge/`, session WS handling in `server/createServer.ts` | 4 | 2 |
| `store` | `server/store/` | 4 | 1 |
| `ui-shell` | `web/src/` (except the three folders below) | 5 | 2 |
| `qcards` | `web/src/qcards/` | 4 | 0 |
| `modes` | `server/modes/`, `web/src/components/coverage/` | 5 | 2 |
| `integrations` | `server/integrations/`, `web/src/integrations/` | 0 | 5 |

`.octogent/` is gitignored, so the committed copy of each tentacle's `CONTEXT.md` + `todo.md` lives in [`tentacles/`](./tentacles/). Sync it with:

```bash
node scripts/octoplan-tentacles.mjs push [--workspace <checkout>]   # docs -> .octogent (after editing the mirror)
node scripts/octoplan-tentacles.mjs pull [--workspace <checkout>]   # .octogent -> docs (after agents/UI tick todos)
```

`push` needs the tentacle folders to exist first (`octogent tentacle create <id>`, with Octogent running in that checkout). It preserves Octogent's managed suggested-skills block, and `pull` keeps that block out of git.

## Layout

```
packages/octoplan-protocol/   domain types, wire events, answer encoding, docs/plan markdown codecs (zod 4)
apps/octoplan/server/         Node + ws server (bridge/, store/, modes/, integrations/ arrive in wave 1–2)
apps/octoplan/web/            React 19 + Vite cockpit, imports Octogent's CSS tokens
docs/octoplan/                spec, decisions, tentacle mirror, wave reports
```
