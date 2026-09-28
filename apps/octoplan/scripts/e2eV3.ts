// LIVE v3 gate (D68): real Claude, real git, a real Octogent — all isolated from the user's own.
//
//   pnpm --filter @octogent/octoplan e2e:v3
//
// Starts a private Octoplan server (temp OCTOPLAN_HOME; every `octogent` call and Run Octogent
// under a temp home and a private port, headless) plus a Vite web server for screenshots, then:
//   DOD3  New project from an idea -> <parent>/<slug> with git (1 commit), README, docs/plan,
//         and a first question card
//   DOD4  import of a three-maturity fixture (built repo + outside spec + half-plan folder +
//         one-line idea file) -> INGEST.md draft, a maturity per source, a found item with a
//         quote, a "Sources disagree on …" gap
//   DOD5  drop one item, park the disagreements, apply -> kept items written with
//         `source: import`, the dropped one absent, INGEST.md applied, and a first round that
//         asks about what's open rather than a kept decision
//   DOD7  Run Octogent on that repo (no .octogent yet) -> octogent init, a headless launch,
//         "running" with the port from runtime.json; then a handoff apply creates tentacles
//   DOD2  headless screenshots: home, the Understand review, the stepper at all seven steps
// Leaves the fixture on disk (path printed).
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
  type ClientEvent,
  type IngestDraft,
  PLAN_DIR,
  PROTOCOL_VERSION,
  type ServerEvent,
  parseIngestDoc,
  parseServerEvent,
} from "@octogent/octoplan-protocol";
import { WebSocket } from "ws";

const PORT = Number(process.env.E2E_OCTOPLAN_PORT ?? 8796);
const OCTOGENT_PORT = Number(process.env.E2E_OCTOGENT_PORT ?? 9877);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5196);
const appDir = resolve(import.meta.dirname, "..");
const shotsDir = resolve(appDir, "..", "..", "docs", "octoplan", "screenshots", "v3");
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
const words = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4),
  );
const overlap = (a: string, b: string) => [...words(a)].filter((w) => words(b).has(w)).length;

// ---------------------------------------------------------------- fixture

const root = mkdtempSync(join(tmpdir(), "octoplan-e2e-v3-"));
const octogentProfile = join(root, "octogent-home");
const octoplanHome = join(root, "octoplan-home");
const projects = join(root, "projects");
const repo = join(projects, "tally");
const specFile = join(root, "elsewhere", "SPEC.md");
const notesDir = join(root, "notes");
const ideaFile = join(root, "idea.txt");

const writeFixture = () => {
  for (const dir of [
    octogentProfile,
    octoplanHome,
    join(repo, "src"),
    join(root, "elsewhere"),
    notesDir,
  ]) {
    mkdirSync(dir, { recursive: true });
  }
  // Built: a working little CLI that stores counts in a JSON file.
  writeFileSync(
    join(repo, "README.md"),
    "# tally\n\nCount things from the terminal: `tally add coffee`, `tally show`.\nCounts are kept in ~/.tally.json.\n",
  );
  writeFileSync(
    join(repo, "package.json"),
    JSON.stringify({ name: "tally", version: "0.2.0", bin: { tally: "src/cli.js" } }, null, 2),
  );
  writeFileSync(
    join(repo, "src", "cli.js"),
    [
      "#!/usr/bin/env node",
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "const file = path.join(require('node:os').homedir(), '.tally.json');",
      "const counts = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};",
      "const [cmd, name] = process.argv.slice(2);",
      "if (cmd === 'add') { counts[name] = (counts[name] ?? 0) + 1; fs.writeFileSync(file, JSON.stringify(counts)); }",
      "if (cmd === 'show') for (const [k, v] of Object.entries(counts)) console.log(`${k}: ${v}`);",
      "",
    ].join("\n"),
  );
  // Detailed-ish spec kept elsewhere, contradicting the code on storage.
  writeFileSync(
    specFile,
    "# tally spec\n\n## Goals\n- Count named things from the terminal\n- Show totals per day and per week\n\n## Non-goals\n- A mobile app\n\n## Storage\nCounts are stored in a Postgres database so several machines can share them.\n",
  );
  // Half a plan.
  writeFileSync(
    join(notesDir, "PLAN.md"),
    "# Plan (draft)\n\n- v1: add, show, reset\n- Maybe export to CSV?\n- Open: who else would use this? Just me?\n",
  );
  // A raw idea.
  writeFileSync(ideaFile, "Idea: a weekly summary email of the counts.\n");
};

// ---------------------------------------------------------------- processes

const children: ChildProcess[] = [];
const killTree = (pid: number | undefined) => {
  if (!pid) return;
  if (isWindows) {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      // Already gone.
    }
  } else {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
};
/** The Octogent Run Octogent started (detached, so not our child): found through runtime.json. */
const privateOctogentPids = () => {
  const dir = join(octogentProfile, ".octogent", "projects");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((id) => {
    const file = join(dir, id, "state", "runtime.json");
    if (!existsSync(file)) return [];
    try {
      return [JSON.parse(readFileSync(file, "utf8")).pid as number];
    } catch {
      return [];
    }
  });
};
const cleanup = () => {
  for (const child of children) killTree(child.pid);
  for (const pid of privateOctogentPids()) killTree(pid);
};
process.on("exit", cleanup);

const startServer = async () => {
  const server = spawn(isWindows ? "pnpm.cmd" : "pnpm", ["exec", "tsx", "server/main.ts"], {
    cwd: appDir,
    shell: isWindows,
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      ...process.env,
      OCTOPLAN_PORT: String(PORT),
      OCTOPLAN_HOME: octoplanHome,
      // Test-only switches (server/main.ts): private Octogent home, headless Run Octogent.
      OCTOPLAN_OCTOGENT_USERPROFILE: octogentProfile,
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

const startWeb = async () => {
  const web = spawn(isWindows ? "pnpm.cmd" : "pnpm", ["exec", "vite"], {
    cwd: appDir,
    shell: isWindows,
    stdio: "ignore",
    env: { ...process.env, OCTOPLAN_PORT: String(PORT), OCTOPLAN_WEB_PORT: String(WEB_PORT) },
  });
  children.push(web);
  return until(
    async () => {
      try {
        return (await fetch(`http://127.0.0.1:${WEB_PORT}/`)).ok;
      } catch {
        return false;
      }
    },
    60_000,
    500,
  );
};

const capture = (name: string, shots: unknown[]) => {
  const file = join(root, `${name}.json`);
  writeFileSync(file, JSON.stringify(shots, null, 2));
  try {
    const out = execFileSync(
      process.execPath,
      [join(appDir, "scripts", "captureUi.mjs"), file, shotsDir],
      {
        encoding: "utf8",
        timeout: 180_000,
      },
    );
    log(out.trim().replace(/\n/g, " | "));
    return !/FAILED/.test(out);
  } catch (error) {
    log(`capture failed: ${String(error)}`);
    return false;
  }
};

// ---------------------------------------------------------------- client

let socket: WebSocket;
const events: ServerEvent[] = [];
const send = (event: ClientEvent) => socket.send(JSON.stringify(event));

const connect = async () => {
  socket = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  socket.on("message", (raw) => {
    const event = parseServerEvent(raw.toString());
    if (!event) return;
    events.push(event);
    if (event.type === "error") log(`server error: ${event.message}`);
    if (event.type === "plan-job") log(`job ${event.job} ${event.state}: ${event.message}`);
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

const samePath = (a: string, b: string) => resolve(a).toLowerCase() === resolve(b).toLowerCase();
const planFile = (dir: string, name: string) => {
  const file = join(dir, PLAN_DIR, name);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
};

// ---------------------------------------------------------------- checks

const run = async () => {
  writeFixture();
  log(`fixture at ${root}`);
  await startServer();
  await connect();
  const webUp = await startWeb();
  log(`web ${webUp ? "up" : "DOWN"} on :${WEB_PORT}`);

  // ---- DOD3: new project from an idea
  let mark = events.length;
  send({
    type: "create-project",
    parentDir: projects,
    name: "Sprout Journal",
    idea: "A tiny journal for tracking how my plants are doing, one line a day.",
  });
  const created = await waitFor("focus-session", () => true, 120_000, mark);
  const sprout = join(projects, "sprout-journal");
  let commits = "0";
  try {
    commits = git(sprout, "rev-list", "--count", "HEAD");
  } catch {
    // No git: reported below.
  }
  const firstCard = created
    ? await waitFor("question-round", (e) => e.round.sessionId === created.sessionId, 300_000, mark)
    : null;
  const readme = existsSync(join(sprout, "README.md"))
    ? readFileSync(join(sprout, "README.md"), "utf8")
    : "";
  record(
    "DOD3 new project from an idea",
    Boolean(created) &&
      commits === "1" &&
      readme.includes("one line a day") &&
      existsSync(join(sprout, "docs", "plan")) &&
      Boolean(firstCard),
    `folder ${existsSync(sprout) ? "created" : "missing"}, ${commits} commit(s), README ${readme ? "has the idea" : "missing"}, first card: ${firstCard ? `"${firstCard.round.questions[0]?.question}"` : "none"}`,
  );
  if (created) send({ type: "stop-session", sessionId: created.sessionId });

  // ---- DOD4: import the three-maturity fixture
  mark = events.length;
  send({
    type: "start-import",
    mainPath: repo,
    extraPaths: [specFile, notesDir, ideaFile],
    pastes: [],
    gitInit: true,
  });
  const ingestDone = await waitFor(
    "plan-job",
    (e) => e.job === "ingest" && e.state !== "running" && samePath(e.repoPath, repo),
    15 * 60_000,
    mark,
  );
  const draft: IngestDraft | null = parseIngestDoc(planFile(repo, "INGEST.md"));
  const found = draft?.items.find((i) => i.evidence === "found" && i.quote && i.source);
  const disagreement = draft?.items.find((i) => /^sources disagree on/i.test(i.title));
  const maturities = draft?.sources.map((s) => `${s.id}=${s.maturity ?? "?"}`).join(", ") ?? "";
  record(
    "DOD4 import draft",
    ingestDone?.state === "done" &&
      draft?.status === "draft" &&
      draft.sources.length === 4 &&
      draft.sources.every((s) => s.maturity) &&
      Boolean(found) &&
      Boolean(disagreement),
    `overall ${draft?.maturity ?? "?"}; sources ${maturities}; ${draft?.items.length ?? 0} items; found: "${found?.title}" (${found?.source}: “${found?.quote}”); disagreement: "${disagreement?.title ?? "none"}"`,
  );

  // ---- DOD2 (part 1): home screen and the Understand review, before apply
  let shotsOk = webUp;
  if (webUp) {
    shotsOk =
      capture("shots-1", [
        {
          name: "01-home",
          url: `http://127.0.0.1:${WEB_PORT}/`,
          steps: [
            { waitFor: ".op-header" },
            { clickText: "home" },
            { waitFor: "[data-testid=home-screen]" },
          ],
        },
        {
          name: "02-understand-review",
          url: `http://127.0.0.1:${WEB_PORT}/`,
          steps: [
            { waitFor: ".op-header" },
            { clickText: "home" },
            { waitFor: "[data-testid=home-screen]" },
            { clickText: "tally" },
            { waitFor: "[data-testid=ingest-review]" },
          ],
        },
      ]) && shotsOk;
  }

  // ---- DOD5: review (drop one, park disagreements) and apply
  let dropped = "";
  const reviewed: IngestDraft | null = draft
    ? {
        ...draft,
        items: draft.items.map((item) => {
          if (item.disagreement) return { ...item, resolution: "parked" as const };
          // Drop a goal or gap, never a decision: the fixture may have only one decision, and
          // DOD5 needs at least one kept item written with its import evidence.
          if (
            !dropped &&
            item.keep &&
            !item.inPlan &&
            (item.kind === "goal" || item.kind === "gap")
          ) {
            dropped = item.title;
            return { ...item, keep: false };
          }
          return item;
        }),
      }
    : null;
  mark = events.length;
  if (reviewed) send({ type: "apply-ingest", repoPath: repo, draft: reviewed });
  const importSession = await waitFor("focus-session", () => true, 120_000, mark);
  const firstRound = importSession
    ? await waitFor(
        "question-round",
        (e) => e.round.sessionId === importSession.sessionId,
        300_000,
        mark,
      )
    : null;
  const decisionsMd = planFile(repo, "DECISIONS.md");
  const everything = ["DECISIONS.md", "GOAL.md", "GAPS.md", "RISKS.md"]
    .map((f) => planFile(repo, f))
    .join("\n");
  const applied = parseIngestDoc(planFile(repo, "INGEST.md"));
  const kept = (reviewed?.items ?? []).filter((i) => i.keep && !i.inPlan && i.kind === "decision");
  const open = [
    ...(reviewed?.items ?? [])
      .filter((i) => i.kind === "gap" || i.disagreement)
      .map((i) => i.title),
  ];
  const questions = firstRound?.round.questions.map((q) => q.question) ?? [];
  const reAsked = questions.filter((q) =>
    kept.some((d) => q.toLowerCase().includes(d.title.toLowerCase())),
  );
  const aboutOpen = questions.filter((q) => open.some((title) => overlap(q, title) >= 1));
  // Every kept item (not already in the plan, not a parked disagreement) is written somewhere;
  // decisions carry `source: import (…)`; the dropped item is neither a goal line nor a record.
  const lines = everything.split(/\r?\n/).map((l) => l.trim().toLowerCase());
  const written = (title: string) =>
    lines.some((l) => l === `- ${title.toLowerCase()}` || l.endsWith(`— ${title.toLowerCase()}`));
  const keptItems = (reviewed?.items ?? []).filter(
    (i) => i.keep && !i.inPlan && !i.disagreement && i.kind !== "risk",
  );
  const missing = keptItems.filter((i) => !written(i.title)).map((i) => i.title);
  const decisionSources = kept.length === 0 || /- source: import \(/.test(decisionsMd);
  record(
    "DOD5 apply and gap-focused first round",
    Boolean(importSession) &&
      missing.length === 0 &&
      decisionSources &&
      dropped !== "" &&
      !written(dropped) &&
      applied?.status === "applied" &&
      Boolean(firstRound) &&
      reAsked.length === 0 &&
      aboutOpen.length > 0,
    `dropped "${dropped}" (${written(dropped) ? "STILL WRITTEN" : "absent"}); ${keptItems.length} kept items written${missing.length ? `, missing: ${missing.join(" | ")}` : ""}; ${kept.length} kept decisions${kept.length ? ` with source: import ${decisionSources ? "yes" : "NO"}` : ""}; INGEST ${applied?.status}; first round: ${questions.map((q) => `"${q}"`).join(" / ")}; about open items: ${aboutOpen.length}; re-asked kept decisions: ${reAsked.length}`,
  );
  if (importSession) send({ type: "stop-session", sessionId: importSession.sessionId });

  // ---- DOD7: Run Octogent on a workspace without .octogent, then a handoff apply
  const hadProject = existsSync(join(repo, ".octogent", "project.json"));
  mark = events.length;
  send({ type: "launch-octogent", repoPath: repo });
  const starting = await waitFor(
    "octogent-status",
    (e) => samePath(e.status.repoPath, repo) && e.status.state === "starting",
    120_000,
    mark,
  );
  const running = await waitFor(
    "octogent-status",
    (e) => samePath(e.status.repoPath, repo) && e.status.state === "running",
    120_000,
    mark,
  );
  mark = events.length;
  send({ type: "generate-handoff", repoPath: repo, heading: "v1" });
  const generated = await waitFor(
    "plan-job",
    (e) => e.job === "handoff-generate" && e.state !== "running",
    10 * 60_000,
    mark,
  );
  mark = events.length;
  send({ type: "apply-handoff", repoPath: repo });
  const handoff = await waitFor(
    "handoff-result",
    (e) => samePath(e.repoPath, repo),
    5 * 60_000,
    mark,
  );
  const createdTentacles = handoff?.result.tentacles.filter((t) => t.ok && t.created).length ?? 0;
  record(
    "DOD7 Run Octogent then handoff",
    !hadProject &&
      existsSync(join(repo, ".octogent", "project.json")) &&
      Boolean(starting) &&
      running?.status.port === OCTOGENT_PORT &&
      generated?.state === "done" &&
      Boolean(handoff?.result.ok) &&
      createdTentacles > 0,
    `init ${existsSync(join(repo, ".octogent", "project.json")) ? "done" : "missing"}; status ${starting ? "starting" : "-"} -> ${running ? `running :${running.status.port}` : "never running"}; handoff: ${handoff?.result.message ?? "no result"}`,
  );

  // ---- DOD2 (part 2): the stepper at each of the seven steps
  if (webUp && importSession) {
    const base = `http://127.0.0.1:${WEB_PORT}/?session=${importSession.sessionId}`;
    const labels = ["start", "understand", "interview", "goal", "stages", "handoff", "build"];
    shotsOk =
      capture(
        "shots-2",
        labels.map((label, i) => ({
          name: `${String(i + 3).padStart(2, "0")}-step-${i + 1}-${label}`,
          url: base,
          steps: [
            { waitFor: ".op-wf-steps" },
            { click: `.op-wf-steps li:nth-child(${i + 1}) button` },
            { wait: 600 },
          ],
        })),
      ) && shotsOk;
  }
  const pngs = existsSync(shotsDir) ? readdirSync(shotsDir).filter((f) => f.endsWith(".png")) : [];
  record(
    "DOD2 screenshots",
    shotsOk && pngs.length >= 9,
    `${pngs.length} screenshots in docs/octoplan/screenshots/v3/: ${pngs.join(", ")}`,
  );

  console.log("\n===== v3 E2E SUMMARY =====");
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.check} — ${r.detail}`);
  const ok = results.every((r) => r.ok);
  console.log(ok ? "v3 E2E PASS" : "v3 E2E INCOMPLETE");
  console.log(`fixture kept at ${root}`);
  socket.close();
  cleanup();
  process.exit(ok ? 0 : 1);
};

setTimeout(() => {
  console.log("timeout");
  cleanup();
  process.exit(1);
}, 60 * 60_000).unref();

run().catch((error) => {
  console.error(error);
  cleanup();
  process.exit(1);
});
