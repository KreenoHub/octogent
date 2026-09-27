// LIVE v2 gate (D39): real Claude, real git, a real Octogent — all isolated from the user's own.
//
//   pnpm --filter @octogent/octoplan e2e:v2
//
// Builds a throwaway git repo with a small plan, starts a private Octogent (port 9876, temp
// home) and a private Octoplan server (port 8795, temp OCTOPLAN_HOME), then checks:
//   DOD4  digest in the first user turn (≤60 lines)
//   DOD3  kill the server with a round pending -> restart -> round back in the dock -> answer -> Claude continues
//   DOD8  one live round each of Quick align, Brainstorm, Devil's advocate
//   DOD5  a commit citing D1 on main -> drift "implemented"; harvest writes an H-record
//   DOD9  overview tentacle counts == checkboxes in .octogent/tentacles/*/todo.md
//   DOD11 handoff generate -> apply: tentacles + todos under the heading with D-ids, HANDOFF.md
//         applied, OCTOPUS.md, hand notes untouched      DOD6  export keeps hand notes
//   DOD12 a git worktree of the repo resolves to the main checkout's .octogent
// Leaves the fixture on disk (path printed) so screenshots can be taken against it.
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  type Answer,
  type ClientEvent,
  DIGEST_HEADING,
  PLAN_DIR,
  PROTOCOL_VERSION,
  type PlanSnapshot,
  type ServerEvent,
  buildPlanDigest,
  decisionCodec,
  parseServerEvent,
  serializeGoalDoc,
  serializeRecordDoc,
} from "@octogent/octoplan-protocol";
import { WebSocket } from "ws";

const PORT = Number(process.env.E2E_OCTOPLAN_PORT ?? 8795);
const OCTOGENT_PORT = Number(process.env.E2E_OCTOGENT_PORT ?? 9876);
const appDir = resolve(import.meta.dirname, "..");
const isWindows = process.platform === "win32";

const log = (line: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${line}`);
const results: Array<{ check: string; ok: boolean; detail: string }> = [];
const record = (check: string, ok: boolean, detail: string) => {
  results.push({ check, ok, detail });
  log(`${ok ? "PASS" : "FAIL"} ${check}: ${detail}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (check: () => boolean | Promise<boolean>, timeoutMs: number, stepMs = 300) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await check()) return true;
    await sleep(stepMs);
  }
  return false;
};
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

// ---------------------------------------------------------------- fixture

const root = mkdtempSync(join(tmpdir(), "octoplan-e2e-v2-"));
const repo = join(root, "habit");
const octogentHome = join(root, "octogent-home");
const octoplanHome = join(root, "octoplan-home");
const worktree = join(root, "habit-wt");
for (const dir of [repo, octogentHome, octoplanHome]) mkdirSync(dir, { recursive: true });

const today = new Date().toISOString().slice(0, 10);
const decision = (id: string, title: string, body: string) => ({
  id,
  title,
  date: today,
  status: "active" as const,
  source: "e2e fixture",
  questionIds: [],
  dependsOn: [],
  body,
});

const writeFixture = () => {
  mkdirSync(join(repo, PLAN_DIR), { recursive: true });
  mkdirSync(join(repo, "src", "cli"), { recursive: true });
  mkdirSync(join(repo, "src", "store"), { recursive: true });
  writeFileSync(join(repo, "package.json"), '{ "name": "habit", "type": "module" }\n');
  writeFileSync(join(repo, "src", "cli", "index.js"), "// habit CLI entry\n");
  writeFileSync(join(repo, "src", "store", "log.js"), "// append-only habit log\n");
  writeFileSync(
    join(repo, PLAN_DIR, "GOAL.md"),
    serializeGoalDoc({
      title: "habit v1 — a tiny CLI habit tracker",
      why: "One person wants to log a habit each day from the terminal and see a weekly streak.",
      goals: [
        "Log a habit for today with `habit log <name>` (D1, D2)",
        "Show a 7-day streak grid with `habit week` (D3)",
      ],
      nonGoals: ["Accounts, sync or reminders (D4)"],
      done: [
        {
          id: "DOD1",
          text: "`habit log read` appends one line to ~/.habits",
          status: "unknown",
          evidence: "",
        },
        {
          id: "DOD2",
          text: "`habit week` prints a 7-day grid for every habit",
          status: "unknown",
          evidence: "",
        },
      ],
    }),
  );
  writeFileSync(
    join(repo, PLAN_DIR, "DECISIONS.md"),
    serializeRecordDoc({
      preamble: "# Decisions\n\nD-numbered decision log. Newest last.",
      records: [
        decision(
          "D1",
          "Store the log as plain text lines",
          "One line per completion: date, habit.",
        ),
        decision("D2", "CLI is three commands: add, log, week", "Everything else is out of v1."),
        decision("D3", "Streak = 7-day grid plus current run", "Shown by `habit week`."),
        decision("D4", "No accounts, sync or reminders", "Single user, single machine."),
      ].map((d) => decisionCodec.toRecord(d)),
    }),
  );
  git(repo, "init", "-b", "main");
  git(repo, "config", "user.email", "e2e@octoplan.local");
  git(repo, "config", "user.name", "Octoplan e2e");
  git(repo, "add", "-A");
  git(repo, "commit", "-m", "chore: habit v1 plan");
  // DOD5: merged work citing D2 (-> implemented), and a build-time choice that contradicts
  // D1 (-> harvested, D1 diverged; a contradiction outranks implemented).
  writeFileSync(
    join(repo, "src", "cli", "index.js"),
    "// habit CLI: add, log, week [D2]\nexport const COMMANDS = ['add', 'log', 'week'];\n",
  );
  git(repo, "commit", "-am", "feat(cli): the three v1 commands [D2]");
  writeFileSync(
    join(repo, "src", "store", "db.js"),
    "// switched to SQLite for fast streak queries\n",
  );
  git(repo, "add", "-A");
  git(
    repo,
    "commit",
    "-m",
    "feat(store): switch the habit log from a text file to SQLite\n\nDecided while building: streak queries over a text file were too slow, so completions now go into ~/.habits.db (SQLite). The text log is dropped.",
  );
};

// ---------------------------------------------------------------- processes

const children: ChildProcess[] = [];
const killTree = (child: ChildProcess | null) => {
  if (!child?.pid || child.exitCode !== null) return;
  if (isWindows) {
    try {
      execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      // Already gone.
    }
  } else child.kill("SIGTERM");
};
const cleanup = () => {
  for (const child of children) killTree(child);
};
process.on("exit", cleanup);

const octogentEnv = {
  ...process.env,
  USERPROFILE: octogentHome,
  HOME: octogentHome,
  OCTOGENT_API_PORT: String(OCTOGENT_PORT),
  OCTOGENT_NO_OPEN: "1",
};

const startOctogent = async () => {
  execFileSync("octogent", ["init", "habit"], {
    cwd: repo,
    env: octogentEnv,
    shell: isWindows,
    stdio: "ignore",
  });
  const child = spawn("octogent", [], {
    cwd: repo,
    env: octogentEnv,
    shell: isWindows,
    stdio: "ignore",
  });
  children.push(child);
  const up = await until(
    async () => {
      try {
        return (await fetch(`http://127.0.0.1:${OCTOGENT_PORT}/api/deck/tentacles`)).ok;
      } catch {
        return false;
      }
    },
    60_000,
    1000,
  );
  if (!up) throw new Error(`Octogent did not start on :${OCTOGENT_PORT}`);
  return child;
};

const octogentCli = (...args: string[]) =>
  execFileSync("octogent", args, {
    cwd: repo,
    env: { ...octogentEnv, OCTOGENT_API_ORIGIN: `http://127.0.0.1:${OCTOGENT_PORT}` },
    shell: isWindows,
    encoding: "utf8",
  });

let server: ChildProcess | null = null;
const startServer = async () => {
  server = spawn(isWindows ? "pnpm.cmd" : "pnpm", ["exec", "tsx", "server/main.ts"], {
    cwd: appDir,
    shell: isWindows,
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      ...process.env,
      OCTOPLAN_PORT: String(PORT),
      OCTOPLAN_HOME: octoplanHome,
      OCTOGENT_URL: `http://127.0.0.1:${OCTOGENT_PORT}`,
      // Every `octogent` CLI call from this server goes to the private Octogent, never the user's.
      OCTOGENT_API_ORIGIN: `http://127.0.0.1:${OCTOGENT_PORT}`,
      OCTOGENT_API_PORT: String(OCTOGENT_PORT),
    },
  });
  children.push(server);
  const up = await until(
    async () => {
      try {
        return (await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok;
      } catch {
        return false;
      }
    },
    60_000,
    500,
  );
  if (!up) throw new Error(`Octoplan did not start on :${PORT}`);
};

// ---------------------------------------------------------------- client

let socket: WebSocket;
const events: ServerEvent[] = [];
/** Sessions whose rounds the client answers automatically (recommended option). */
const autoAnswer = new Set<string>();
/** Sessions whose rounds are left pending (the restart check). */
const holdRounds = new Set<string>();

const send = (event: ClientEvent) => socket.send(JSON.stringify(event));

const answerAll = (round: Extract<ServerEvent, { type: "question-round" }>["round"]): Answer[] =>
  round.questions.map((q) => {
    const option = q.options.find((o) => o.label.includes("(Recommended)")) ?? q.options[0];
    return {
      questionId: q.id,
      selected: option ? [option.label] : [],
      modifier: "none",
      answeredAt: new Date().toISOString(),
    };
  });

const connect = async () => {
  socket = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  socket.on("message", (raw) => {
    const event = parseServerEvent(raw.toString());
    if (!event) return;
    events.push(event);
    if (event.type === "error") log(`server error: ${event.message}`);
    if (event.type === "plan-job") log(`job ${event.job} ${event.state}: ${event.message}`);
    if (event.type === "question-round" && autoAnswer.has(event.round.sessionId)) {
      const answers = answerAll(event.round);
      setTimeout(
        () =>
          send({
            type: "answer-round",
            sessionId: event.round.sessionId,
            roundId: event.round.id,
            answers,
          }),
        400,
      );
    }
  });
  await new Promise((r, j) => {
    socket.once("open", r);
    socket.once("error", j);
  });
  send({ type: "hello", protocolVersion: PROTOCOL_VERSION });
};

const find = <T extends ServerEvent["type"]>(
  type: T,
  predicate: (event: Extract<ServerEvent, { type: T }>) => boolean,
  from = 0,
) =>
  events
    .slice(from)
    .find((e): e is Extract<ServerEvent, { type: T }> => e.type === type && predicate(e as never));

const waitFor = async <T extends ServerEvent["type"]>(
  type: T,
  predicate: (event: Extract<ServerEvent, { type: T }>) => boolean,
  timeoutMs: number,
  from = 0,
) => {
  let found: Extract<ServerEvent, { type: T }> | undefined;
  await until(() => {
    found = find(type, predicate, from);
    return Boolean(found);
  }, timeoutMs);
  return found ?? null;
};

const planFor = (repoPath: string): PlanSnapshot | null => {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e?.type === "plan" && resolve(e.repoPath).toLowerCase() === resolve(repoPath).toLowerCase())
      return e.plan;
  }
  return null;
};

const startSession = async (mode: ClientEvent & { type: "start-session" }) => {
  const mark = events.length;
  send(mode);
  const started = await waitFor(
    "session-updated",
    (e) => e.session.mode === mode.mode && resolve(e.session.repoPath) === resolve(mode.repoPath),
    60_000,
    mark,
  );
  if (!started) throw new Error(`no session for ${mode.mode}`);
  return started.session.id;
};

const checkboxes = (workspace: string) => {
  const dir = join(workspace, ".octogent", "tentacles");
  let done = 0;
  let total = 0;
  for (const id of existsSync(dir) ? readdirSync(dir) : []) {
    const file = join(dir, id, "todo.md");
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      if (/^- \[[ xX]\] /.test(line.trim())) total += 1;
      if (/^- \[[xX]\] /.test(line.trim())) done += 1;
    }
  }
  return { done, total };
};

// ---------------------------------------------------------------- checks

const run = async () => {
  log(`fixture: ${root}`);
  writeFixture();
  log("starting a private Octogent…");
  await startOctogent();
  // A hand-written v1-style tentacle the handoff must reuse without touching its notes (DOD6/DOD11).
  octogentCli("tentacle", "create", "store", "--description", "Owns the habit log.");
  const handContext = join(repo, ".octogent", "tentacles", "store", "CONTEXT.md");
  writeFileSync(
    handContext,
    "# Store\n\nOwns the habit log.\n\n## Owns\n\n- `src/store/`: the log file format and its reader.\n\n## Rules\n\n- Hand-written notes: the handoff must never change these lines.\n",
  );
  writeFileSync(
    join(repo, ".octogent", "tentacles", "store", "todo.md"),
    "# Todo\n\n- [x] Sketch the log format. Done when it is written down.\n",
  );
  const handBefore = readFileSync(handContext, "utf8");

  log("starting a private Octoplan server…");
  await startServer();
  await connect();

  // --- DOD4 + DOD3: digest, then a restart with a pending round
  const interview = await startSession({
    type: "start-session",
    repoPath: repo,
    mode: "deep-interview",
    topic: "habit v1: settle how the weekly grid looks.",
  });
  holdRounds.add(interview);
  const firstUser = await waitFor(
    "block",
    (e) => e.sessionId === interview && e.block.kind === "user",
    30_000,
  );
  const kickoff = firstUser?.block.kind === "user" ? firstUser.block.text : "";
  const plan = planFor(repo);
  const expected = plan ? buildPlanDigest(plan) : "";
  const digestLines = expected.split("\n").length;
  record(
    "DOD4 digest in the first user turn",
    Boolean(expected) &&
      kickoff.startsWith(DIGEST_HEADING) &&
      kickoff.startsWith(expected) &&
      kickoff.includes("D1 [active]") &&
      digestLines <= 60,
    `starts with the digest: ${Boolean(expected) && kickoff.startsWith(expected)}; cites D1: ${kickoff.includes("D1 [active]")}; ${digestLines} digest lines`,
  );

  const pending = await waitFor(
    "question-round",
    (e) => e.round.sessionId === interview,
    6 * 60_000,
  );
  if (!pending) {
    record("DOD3 restart with a pending round", false, "Claude never asked a round");
  } else {
    log(`round ${pending.round.index} pending; killing the server…`);
    await sleep(1500); // let the transcript append land
    socket.close();
    killTree(server);
    await sleep(1500);
    events.length = 0;
    await startServer();
    await connect();
    // A reconnect replays sessions as one `sessions` list, not per-session updates.
    const listed = await waitFor(
      "sessions",
      (e) => e.sessions.some((s) => s.id === interview),
      20_000,
    );
    const restored = listed ? { session: listed.sessions.find((s) => s.id === interview) } : null;
    const back = await waitFor("question-round", (e) => e.round.id === pending.round.id, 20_000);
    const answeredAlready = find("round-answered", (e) => e.roundId === pending.round.id);
    const inDock = Boolean(restored?.session?.restored && back && !answeredAlready);
    const mark = events.length;
    send({
      type: "answer-round",
      sessionId: interview,
      roundId: pending.round.id,
      answers: answerAll(pending.round),
    });
    const continued = await waitFor(
      "block",
      (e) =>
        e.sessionId === interview &&
        (e.block.kind === "section" || e.block.kind === "question-round"),
      5 * 60_000,
      mark,
    );
    record(
      "DOD3 restart with a pending round",
      inDock && Boolean(continued),
      `restored=${restored?.session?.restored ?? false}, status=${restored?.session?.status ?? "?"}, round back pending=${Boolean(back && !answeredAlready)}; Claude continued after the answer: ${Boolean(continued)}`,
    );
  }
  send({ type: "stop-session", sessionId: interview });

  // --- DOD8: one live round per mode, in parallel
  const modeChecks = await Promise.all(
    (["quick-align", "brainstorm", "devils-advocate"] as const).map(async (mode) => {
      const topic =
        mode === "devils-advocate"
          ? "Challenge the plan in docs/plan: is a plain text log the right store?"
          : mode === "brainstorm"
            ? "Small ideas that would make habit more fun to use."
            : "Align quickly on how `habit week` prints its grid.";
      const id = await startSession({ type: "start-session", repoPath: repo, mode, topic });
      const round = await waitFor("question-round", (e) => e.round.sessionId === id, 6 * 60_000);
      send({ type: "stop-session", sessionId: id });
      return {
        mode,
        ok: Boolean(round),
        detail: round ? `${round.round.questions.length} questions as a card` : "no round",
      };
    }),
  );
  for (const m of modeChecks) record(`DOD8 live ${m.mode}`, m.ok, m.detail);

  // --- DOD5 + DOD9: drift, harvest, header counts
  let mark = events.length;
  send({ type: "request-overview", repoPath: repo });
  const overview = await waitFor(
    "overview",
    (e) => resolve(e.overview.repoPath) === resolve(repo),
    60_000,
    mark,
  );
  const d1 = overview?.overview.drift.find((d) => d.decisionId === "D1");
  const counts = checkboxes(repo);
  const shown = overview?.overview.tentacles.reduce(
    (sum, t) => ({ done: sum.done + t.done, total: sum.total + t.total }),
    { done: 0, total: 0 },
  );
  record(
    "DOD9 header counts match todo.md checkboxes",
    Boolean(shown && shown.done === counts.done && shown.total === counts.total),
    `overview ${shown?.done ?? "?"}/${shown?.total ?? "?"} vs files ${counts.done}/${counts.total}`,
  );

  // The harvest already ran on repo open (D17); a manual run after it has nothing new.
  send({ type: "run-harvest", repoPath: repo });
  await until(() => (planFor(repo)?.harvest?.length ?? 0) > 0, 8 * 60_000, 1000);
  const harvest = planFor(repo)?.harvest ?? [];
  const harvestFile = join(repo, PLAN_DIR, "HARVEST.md");
  mark = events.length;
  send({ type: "request-overview", repoPath: repo });
  const afterHarvest = await waitFor(
    "overview",
    (e) => resolve(e.overview.repoPath) === resolve(repo),
    60_000,
    mark,
  );
  const driftOf = (id: string) => afterHarvest?.overview.drift.find((d) => d.decisionId === id);
  const d2 = driftOf("D2");
  const d1After = driftOf("D1");
  const contradictsD1 = harvest.some((h) => h.contradicts.includes("D1"));
  record(
    "DOD5 drift badges + harvest H-record",
    d2?.status === "implemented" &&
      harvest.length > 0 &&
      existsSync(harvestFile) &&
      (!contradictsD1 || d1After?.status === "diverged"),
    `D2 drift=${d2?.status ?? "none"} (${d2?.evidence.join("; ") ?? ""}); D1 drift=${d1After?.status ?? "none"} before harvest=${d1?.status ?? "none"}; H-records: ${harvest.map((h) => `${h.id} ${h.title} contradicts [${h.contradicts.join(",")}]`).join(" | ") || "none"}`,
  );

  // --- DOD11 + DOD6: handoff generate -> apply
  mark = events.length;
  send({ type: "generate-handoff", repoPath: repo, heading: "habit v1" });
  const generated = await waitFor(
    "plan-job",
    (e) => e.job === "handoff-generate" && e.state !== "running",
    8 * 60_000,
    mark,
  );
  await until(() => Boolean(planFor(repo)?.handoff), 10_000);
  const draft = planFor(repo)?.handoff;
  log(
    `handoff draft (${draft?.source}): ${draft?.tentacles.map((t) => `${t.id}${t.existing ? "*" : ""}(${t.todos.length})`).join(", ")}`,
  );
  mark = events.length;
  send({ type: "apply-handoff", repoPath: repo });
  const applied = await waitFor(
    "handoff-result",
    (e) => resolve(e.repoPath) === resolve(repo),
    3 * 60_000,
    mark,
  );
  const result = applied?.result;
  const tentacleDirs = (draft?.tentacles ?? []).map((t) =>
    join(repo, ".octogent", "tentacles", t.id),
  );
  const todosOk = tentacleDirs.every((dir) => {
    const todo = existsSync(join(dir, "todo.md")) ? readFileSync(join(dir, "todo.md"), "utf8") : "";
    return todo.includes("## habit v1");
  });
  const stamped = tentacleDirs.some((dir) =>
    /- \[ \] \[D\d+/.test(
      existsSync(join(dir, "todo.md")) ? readFileSync(join(dir, "todo.md"), "utf8") : "",
    ),
  );
  const handoffMd = existsSync(join(repo, PLAN_DIR, "HANDOFF.md"))
    ? readFileSync(join(repo, PLAN_DIR, "HANDOFF.md"), "utf8")
    : "";
  const handAfter = readFileSync(handContext, "utf8");
  const handKept = handBefore
    .split("\n")
    .filter((line) => line.startsWith("- ") || line.startsWith("## "))
    .every((line) => handAfter.includes(line));
  record(
    "DOD11 handoff generate -> apply",
    Boolean(
      draft &&
        draft.tentacles.length > 0 &&
        result?.ok &&
        tentacleDirs.every((dir) => existsSync(dir)) &&
        todosOk &&
        stamped &&
        /applied/i.test(handoffMd) &&
        existsSync(join(repo, PLAN_DIR, "OCTOPUS.md")),
    ),
    `generate: ${generated?.message ?? "no result"}; apply: ${result?.message ?? "no result"}; tentacles ${tentacleDirs.filter((d) => existsSync(d)).length}/${tentacleDirs.length} on disk; heading in every todo.md: ${todosOk}; D-id stamps: ${stamped}; HANDOFF.md applied: ${/applied/i.test(handoffMd)}; OCTOPUS.md: ${existsSync(join(repo, PLAN_DIR, "OCTOPUS.md"))}`,
  );
  record(
    "DOD6 hand notes outside the octoplan block unchanged",
    handKept,
    handKept ? "Owns/Rules lines intact" : `CONTEXT.md now:\n${handAfter}`,
  );

  // --- DOD12: a worktree targets the main checkout's .octogent
  git(repo, "worktree", "add", worktree, "-b", "octogent/e2e/wt");
  mark = events.length;
  send({ type: "request-overview", repoPath: worktree });
  const wtOverview = await waitFor(
    "overview",
    (e) => resolve(e.overview.repoPath) === resolve(worktree),
    60_000,
    mark,
  );
  record(
    "DOD12 worktree resolves to the main checkout",
    resolve(wtOverview?.overview.workspace ?? "").toLowerCase() === resolve(repo).toLowerCase(),
    `workspace for the worktree: ${wtOverview?.overview.workspace ?? "none"}`,
  );

  console.log("\n===== v2 E2E SUMMARY =====");
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.check} — ${r.detail}`);
  const ok = results.every((r) => r.ok);
  console.log(ok ? "v2 E2E PASS" : "v2 E2E INCOMPLETE");
  console.log(`fixture kept at ${root}`);
  if (process.env.E2E_KEEP_RUNNING) {
    log(
      `servers left running for screenshots: Octoplan :${PORT}, Octogent :${OCTOGENT_PORT}. Ctrl+C to stop.`,
    );
    writeFileSync(
      join(root, "e2e-state.json"),
      JSON.stringify({ repo, worktree, interview, port: PORT }, null, 2),
    );
    return;
  }
  socket.close();
  cleanup();
  process.exit(ok ? 0 : 1);
};

setTimeout(() => {
  console.log("timeout");
  cleanup();
  process.exit(1);
}, 45 * 60_000).unref();

run().catch((error) => {
  console.error(error);
  cleanup();
  process.exit(1);
});
