# Octoplan Bridge

Runs Claude Code sessions through the Agent SDK and turns AskUserQuestion calls into question rounds the UI can answer.

## Owns
- `apps/octoplan/server/bridge/`: session runner, AskUserQuestion interception, the `octoplan` in-process MCP server, the revision flow, pop-out terminal, session forking.
- `apps/octoplan/server/createServer.ts`: the WebSocket handling for session events (`start-session`, `send-message`, `answer-round`, `revise-answer`, `stop-session`). Other tentacles never edit this file; they export registration functions and the octopus wires them in.
- `apps/octoplan/tests/bridge/`: this tentacle's tests.

## Read first
- `docs/octoplan/SPEC.md` §3 (bridge), §3.3 (answer modifiers), §3.4 (plan tools), §9 (MVP definition of done).
- `packages/octoplan-protocol/src/events.ts` for the wire events you emit and consume.
- `packages/octoplan-protocol/src/answerEncoding.ts`: `encodeAnswersForTool` and `encodeRevisionTurn` are the ONLY way answers reach Claude. Don't hand-build answer strings.
- `apps/octoplan/server/probe/askUserQuestionProbe.ts`: the working, live-verified canUseTool pattern (D19).

## What exists
- `@anthropic-ai/claude-agent-sdk@^0.3.282` and `zod@^4` are installed in `apps/octoplan`.
- `startOctoplanServer()` (server/createServer.ts) sends `hello`, answers client `hello` with an empty `sessions` list, and replies `error` "Not implemented yet" to everything else. That is where your handlers go.
- The SDK APIs were verified against the typings (sdk.d.ts):
  - `query({ prompt: AsyncIterable<SDKUserMessage>, options })`
  - `options.systemPrompt: { type: "preset", preset: "claude_code", append }`
  - `canUseTool(toolName, input, { signal })` → `{ behavior: "allow", updatedInput } | { behavior: "deny", message }`
  - `createSdkMcpServer({ name, tools })` + `tool(name, description, zodShape, handler)`
  - `options.resume` + `options.forkSession`, or the standalone `forkSession()`
  - the `system`/`init` message carries `session_id`

## Contracts
- Bridge → store: code against the `PlanStore` interface exported by `apps/octoplan/server/store/types.ts`, which the store tentacle defines first. Until it lands, use an in-memory fake in your tests; never import store internals.
- Bridge → modes: code against `ModeDefinition` from `apps/octoplan/server/modes/types.ts` (system prompt append, allowed tools, dimensions, round size, stop rule). Until it lands, use a stub mode in tests.
- If you need a new field or event in `packages/octoplan-protocol`, message the octopus (`octogent channel send <parent> "..."`). Don't edit the protocol yourself.

## Constraints
- **The SDK uses the user's Claude Code login.** Unit tests must never call the real SDK. Inject `query` (a factory parameter) and feed scripted SDKMessage streams. Only `pnpm --filter @octogent/octoplan probe:ask` and the octopus's integration gate talk to real Claude.
- **Planning-mode tool allowlist:** `Read`, `Glob`, `Grep`, `AskUserQuestion`, `mcp__octoplan__*`. `canUseTool` denies everything else with a message saying this is a planning session.
- **Waiting for an answer can take hours.** Honor the abort `signal`, and clean up pending rounds on `stop-session` and on socket close (keep the session; drop the socket binding).
- **Windows first.** Paths come from the UI as Windows paths. Use `node:path`, never string concatenation.
- **Don't touch** `apps/web`, `apps/api`, `packages/core`, or other tentacles' directories.

## Test
`pnpm --filter @octogent/octoplan test -- tests/bridge` · `pnpm --filter @octogent/octoplan build` · `pnpm exec biome check apps/octoplan`

## Done means
A scripted-SDK test drives a full loop:
1. start-session
2. assistant text streams as `section` blocks
3. AskUserQuestion becomes a `question-round` event and the session status is `waiting-for-answer`
4. answer-round resolves canUseTool with the encoded answers
5. the next assistant turn streams

A live run against real Claude shows the same in the octopus's gate.
