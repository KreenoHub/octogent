// LIVE wave-2 gate against a running Octoplan server with real deps (real Claude, git, gh, PTY).
//
//   pnpm --filter @octogent/octoplan e2e:wave2 -- <gitRepo> <repoWithGoal> <brainstormRepo>
//
// 1. git graph of <gitRepo>          2. staged prompts from <repoWithGoal>'s GOAL.md
// 3. tentacle export wiring (Octogent not running there -> a clear message)
// 4. brainstorm: Claude adds ideas, we star two, converge -> decisions + adopted ideas
// 5. branch the brainstorm session (SDK fork)   6. pop-out terminal output for it
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  type Answer,
  type ClientEvent,
  PROTOCOL_VERSION,
  type PlanSnapshot,
  type ServerEvent,
  parseServerEvent,
  terminalPath,
} from "@octogent/octoplan-protocol";
import { WebSocket } from "ws";

const cliArgs = process.argv.slice(2).filter((arg) => arg !== "--");
const [gitRepoArg, goalRepoArg, brainstormRepoArg] = cliArgs;
if (!gitRepoArg || !goalRepoArg || !brainstormRepoArg) {
  console.error("Usage: e2e:wave2 -- <gitRepo> <repoWithGoal> <brainstormRepo>");
  process.exit(2);
}
const gitRepo = resolve(gitRepoArg);
const goalRepo = resolve(goalRepoArg);
const brainstormRepo = resolve(brainstormRepoArg);
const port = process.env.OCTOPLAN_PORT ?? "8790";

const log = (line: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${line}`);
const events: ServerEvent[] = [];
const results: Array<{ check: string; ok: boolean; detail: string }> = [];
const record = (check: string, ok: boolean, detail: string) => {
  results.push({ check, ok, detail });
  log(`${ok ? "PASS" : "FAIL"} ${check}: ${detail}`);
};

const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
const send = (event: ClientEvent) => socket.send(JSON.stringify(event));
const mySessions = new Set<string>();

const waitFor = async <T extends ServerEvent>(
  predicate: (event: ServerEvent) => event is T,
  timeoutMs: number,
  from = 0,
): Promise<T | null> => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = events.slice(from).find(predicate);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
};

const planFor = (repoPath: string): PlanSnapshot | null => {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event?.type === "plan" && resolve(event.repoPath) === repoPath) return event.plan;
  }
  return null;
};

const until = async (check: () => boolean, timeoutMs: number) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (check()) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
};

// Answer every question round from our sessions with the recommended option, like a patient user.
socket.on("message", (raw) => {
  const event = parseServerEvent(raw.toString());
  if (!event) return;
  events.push(event);
  if (event.type === "error") log(`server error: ${event.message}`);
  if (event.type === "question-round" && mySessions.has(event.round.sessionId)) {
    const answers: Answer[] = event.round.questions.map((q) => {
      const option = q.options.find((o) => o.label.includes("(Recommended)")) ?? q.options[0];
      return {
        questionId: q.id,
        selected: option ? [option.label] : [],
        modifier: "none",
        answeredAt: new Date().toISOString(),
      };
    });
    log(`answering round ${event.round.index} (${answers.length} questions)`);
    setTimeout(
      () =>
        send({
          type: "answer-round",
          sessionId: event.round.sessionId,
          roundId: event.round.id,
          answers,
        }),
      500,
    );
  }
});

const readTerminal = (sessionId: string, ms: number) =>
  new Promise<{ bytes: number; messages: string[] }>((done) => {
    const terminal = new WebSocket(`ws://127.0.0.1:${port}${terminalPath(sessionId)}`);
    let bytes = 0;
    const messages: string[] = [];
    terminal.on("message", (raw) => {
      const message = JSON.parse(raw.toString()) as {
        type: string;
        data?: string;
        message?: string;
      };
      messages.push(message.type);
      if (message.type === "output") bytes += message.data?.length ?? 0;
      if (message.type === "error") log(`terminal error: ${message.message}`);
    });
    terminal.on("open", () =>
      terminal.send(JSON.stringify({ type: "resize", cols: 120, rows: 30 })),
    );
    setTimeout(() => {
      terminal.close();
      done({ bytes, messages });
    }, ms);
  });

const run = async () => {
  await new Promise((r) => socket.once("open", r));
  send({ type: "hello", protocolVersion: PROTOCOL_VERSION });

  // 1. Git graph (real git + gh)
  let mark = events.length;
  send({ type: "request-graph", repoPath: gitRepo });
  const graph = await waitFor(
    (e): e is Extract<ServerEvent, { type: "graph" }> => e.type === "graph",
    60_000,
    mark,
  );
  const g = graph?.graph;
  record(
    "git graph",
    Boolean(g && g.commits.length > 0 && g.branches.length > 0),
    g
      ? `${g.commits.length} commits, ${g.branches.length} branches, ${g.lanes.length} tentacle lanes, ${g.prs.length} PRs, gh ${g.ghAvailable ? "available" : `unavailable (${g.hint ?? ""})`}`
      : "no graph event",
  );

  // 2. Staged prompts
  mark = events.length;
  send({ type: "generate-stages", repoPath: goalRepo });
  const stages = await waitFor(
    (e): e is Extract<ServerEvent, { type: "stages" }> => e.type === "stages",
    30_000,
    mark,
  );
  const stageFile = join(goalRepo, "docs", "plan", "stages", "STAGE-1.md");
  record(
    "staged prompts",
    Boolean(stages && stages.stages.length >= 2 && existsSync(stageFile)),
    stages
      ? `${stages.stages.length} stages: ${stages.stages.map((s) => s.title).join(" | ")}`
      : "no stages event",
  );

  // 3. Tentacle export wiring (Octogent is not running in this repo)
  mark = events.length;
  send({
    type: "export-tentacle",
    repoPath: goalRepo,
    tentacleId: "octoplan-e2e",
    tasks: ["Check the export path. Done when this task appears in Deck."],
  });
  const exported = await waitFor(
    (e): e is Extract<ServerEvent, { type: "export-result" }> => e.type === "export-result",
    60_000,
    mark,
  );
  record(
    "tentacle export wiring",
    Boolean(exported && exported.message.length > 0),
    exported ? `ok=${exported.ok}: ${exported.message}` : "no export-result",
  );

  // 4. Brainstorm with real Claude -> star two ideas -> converge
  mark = events.length;
  send({
    type: "start-session",
    repoPath: brainstormRepo,
    mode: "brainstorm",
    topic: "Ideas for a tiny CLI habit tracker for one person. Keep ideas small.",
  });
  const started = await waitFor(
    (e): e is Extract<ServerEvent, { type: "session-updated" }> =>
      e.type === "session-updated" && resolve(e.session.repoPath) === brainstormRepo,
    30_000,
    mark,
  );
  const sessionId = started?.session.id ?? "";
  mySessions.add(sessionId);
  log(`brainstorm session ${sessionId}`);
  const gotIdeas = await until(
    () => (planFor(brainstormRepo)?.ideas.filter((i) => i.status === "inbox").length ?? 0) >= 2,
    6 * 60_000,
  );
  const inbox = planFor(brainstormRepo)?.ideas.filter((i) => i.status === "inbox") ?? [];
  record(
    "brainstorm ideas from Claude",
    gotIdeas,
    `${inbox.length} inbox ideas: ${inbox
      .slice(0, 4)
      .map((i) => `${i.id} ${i.title}`)
      .join("; ")}`,
  );

  const starIds = inbox.slice(0, 2).map((i) => i.id);
  for (const id of starIds)
    send({ type: "update-idea", repoPath: brainstormRepo, ideaId: id, action: "star" });
  const starred = await until(
    () =>
      (planFor(brainstormRepo)?.ideas.filter(
        (i) => starIds.includes(i.id) && i.status === "starred",
      ).length ?? 0) === starIds.length,
    30_000,
  );
  record("star ideas", starred && starIds.length === 2, `starred ${starIds.join(", ")}`);

  const decisionsBefore = planFor(brainstormRepo)?.decisions.length ?? 0;
  // Let any in-flight turn settle before converging.
  await until(() => {
    const last = [...events]
      .reverse()
      .find((e) => e.type === "session-updated" && e.session.id === sessionId);
    return last?.type === "session-updated" && last.session.status === "idle";
  }, 3 * 60_000);
  send({ type: "converge", sessionId });
  const converged = await until(() => {
    const plan = planFor(brainstormRepo);
    if (!plan) return false;
    const adopted = plan.ideas.filter(
      (i) => starIds.includes(i.id) && i.status === "adopted",
    ).length;
    return adopted === starIds.length && plan.decisions.length > decisionsBefore;
  }, 6 * 60_000);
  const plan = planFor(brainstormRepo);
  record(
    "converge -> decisions + adopted",
    converged,
    `decisions ${decisionsBefore} -> ${plan?.decisions.length ?? 0}; adopted: ${
      plan?.ideas
        .filter((i) => i.status === "adopted")
        .map((i) => i.id)
        .join(", ") || "none"
    }`,
  );

  // 5. Branch the brainstorm session (Agent SDK fork)
  mark = events.length;
  send({ type: "branch-session", sessionId, title: "What if it syncs to a phone?" });
  const child = await waitFor(
    (e): e is Extract<ServerEvent, { type: "session-updated" }> =>
      e.type === "session-updated" && e.session.parentSessionId === sessionId,
    30_000,
    mark,
  );
  if (child) mySessions.add(child.session.id);
  const childRan = child
    ? await until(
        () =>
          events
            .slice(mark)
            .some(
              (e) =>
                e.type === "session-updated" &&
                e.session.id === child.session.id &&
                Boolean(e.session.claudeSessionId),
            ),
        3 * 60_000,
      )
    : false;
  const branchNotice = events
    .slice(mark)
    .find((e) => e.type === "notice" && e.message.startsWith("Branched"));
  record(
    "branch session (fork)",
    Boolean(child && childRan && branchNotice),
    child
      ? `child ${child.session.id}; ${branchNotice?.type === "notice" ? branchNotice.message : "no notice"}; forked Claude session ${childRan ? "started" : "did not start"}`
      : "no child session",
  );

  // 6. Pop-out terminal for the brainstorm session
  const terminal = await readTerminal(sessionId, 12_000);
  record(
    "pop-out terminal",
    terminal.bytes > 0,
    `${terminal.bytes} bytes of output; messages: ${[...new Set(terminal.messages)].join(", ") || "none"}`,
  );

  console.log("\n===== WAVE-2 E2E SUMMARY =====");
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.check} — ${r.detail}`);
  const ok = results.every((r) => r.ok);
  console.log(ok ? "WAVE-2 E2E PASS" : "WAVE-2 E2E INCOMPLETE");
  socket.close();
  process.exit(ok ? 0 : 1);
};

socket.on("error", (error) => {
  console.error(`WebSocket error: ${error.message}. Is the Octoplan server running on :${port}?`);
  process.exit(1);
});

setTimeout(() => {
  console.log("timeout");
  process.exit(1);
}, 25 * 60_000);

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
