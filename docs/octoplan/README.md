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

## Layout

```
packages/octoplan-protocol/   domain types, wire events, answer encoding, docs/plan markdown codecs (zod 4)
apps/octoplan/server/         Node + ws server (bridge/, store/, modes/, integrations/ arrive in wave 1–2)
apps/octoplan/web/            React 19 + Vite cockpit, imports Octogent's CSS tokens
docs/octoplan/                spec, decisions, tentacle mirror, wave reports
```
