// Films the v3 tutorial footage: a private Octoplan + Octogent on a demo project, driven through
// the whole workflow with real Claude, with real UI screenshots (and element boxes) at each step.
//
//   node tools/footageV3.mjs            (from apps/octoplan-video)
//
// Isolation: Octoplan gets a temp OCTOPLAN_HOME; every `octogent` call and Run Octogent get a
// temp home (OCTOPLAN_OCTOGENT_USERPROFILE) and a private port. CLAUDE_CONFIG_DIR points at the
// real ~/.claude so Octogent's agents are logged in; they only ever work in the temp demo repo.
// Servers stay up at the end (state in <root>/footage-state.json) so shots can be retaken.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import WebSocket from "ws";

const PORT = 8797;
const WEB_PORT = 5197;
const OCTOGENT_PORT = 9878;
const here = resolve(import.meta.dirname, "..");
const octoplanDir = resolve(here, "..", "octoplan");
const outDir = join(here, "public", "shots", "v3");
const isWindows = process.platform === "win32";
mkdirSync(outDir, { recursive: true });

const log = (line) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${line}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (check, timeoutMs, stepMs = 400) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await check()) return true;
    await sleep(stepMs);
  }
  return false;
};

// ---------------------------------------------------------------- fixture

const root = mkdtempSync(join(tmpdir(), "octoplan-footage-"));
const profile = join(root, "octogent-home");
const octoplanHome = join(root, "octoplan-home");
const projects = join(root, "Projects");
const repo = join(projects, "tally");
const notes = join(root, "Documents", "tally-notes");
const spec = join(root, "Documents", "tally-spec.md");
for (const dir of [profile, octoplanHome, join(repo, "src"), notes])
  mkdirSync(dir, { recursive: true });
writeFileSync(
  join(repo, "README.md"),
  "# tally\n\nCount anything from your terminal.\n\n```\ntally add coffee\ntally show\n```\n\nCounts live in ~/.tally.json.\n",
);
writeFileSync(
  join(repo, "package.json"),
  `${JSON.stringify({ name: "tally", version: "0.2.0", bin: { tally: "src/cli.js" } }, null, 2)}\n`,
);
writeFileSync(
  join(repo, "src", "cli.js"),
  [
    "#!/usr/bin/env node",
    "const fs = require('node:fs');",
    "const file = require('node:path').join(require('node:os').homedir(), '.tally.json');",
    "const counts = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};",
    "const [cmd, name] = process.argv.slice(2);",
    "if (cmd === 'add') { counts[name] = (counts[name] ?? 0) + 1; fs.writeFileSync(file, JSON.stringify(counts)); }",
    "if (cmd === 'show') for (const [k, v] of Object.entries(counts)) console.log(`${k}: ${v}`);",
    "",
  ].join("\n"),
);
writeFileSync(
  spec,
  "# tally — spec\n\n## Goals\n- Count named things from the terminal\n- Show totals per day and per week\n- Reset a counter\n\n## Non-goals\n- A mobile app\n\n## Storage\nCounts are stored in a SQLite database.\n",
);
writeFileSync(
  join(notes, "ideas.md"),
  "# ideas\n\n- export to CSV?\n- a weekly summary in the terminal\n- who else would use this? just me?\n",
);
execFileSync("git", ["init", "-q"], { cwd: repo });
execFileSync("git", ["add", "-A"], { cwd: repo });
execFileSync(
  "git",
  [
    "-c",
    "user.name=Demo",
    "-c",
    "user.email=demo@example.com",
    "commit",
    "-q",
    "-m",
    "tally: add and show",
  ],
  { cwd: repo },
);
log(`fixture at ${root}`);

// ---------------------------------------------------------------- servers

const env = {
  ...process.env,
  OCTOPLAN_PORT: String(PORT),
  OCTOPLAN_WEB_PORT: String(WEB_PORT),
  OCTOPLAN_HOME: octoplanHome,
  OCTOPLAN_OCTOGENT_USERPROFILE: profile,
  OCTOGENT_API_PORT: String(OCTOGENT_PORT),
  CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"),
};
const pnpm = isWindows ? "pnpm.cmd" : "pnpm";
spawn(pnpm, ["exec", "tsx", "server/main.ts"], {
  cwd: octoplanDir,
  shell: isWindows,
  stdio: ["ignore", "inherit", "inherit"],
  env,
});
spawn(pnpm, ["exec", "vite"], { cwd: octoplanDir, shell: isWindows, stdio: "ignore", env });
const httpOk = async (url) => {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
};
if (!(await until(() => httpOk(`http://127.0.0.1:${PORT}/api/health`), 60_000)))
  throw new Error("no server");
if (!(await until(() => httpOk(`http://127.0.0.1:${WEB_PORT}/`), 60_000)))
  throw new Error("no web");
const WEB = `http://127.0.0.1:${WEB_PORT}/`;

// ---------------------------------------------------------------- client

const events = [];
const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
await new Promise((r) => ws.once("open", r));
const send = (event) => ws.send(JSON.stringify(event));
const autoAnswer = new Set();
const recommended = (round) =>
  round.questions.map((q) => {
    const option = q.options.find((o) => o.label.includes("(Recommended)")) ?? q.options[0];
    return {
      questionId: q.id,
      selected: option ? [option.label] : [],
      modifier: "none",
      answeredAt: new Date().toISOString(),
    };
  });
ws.on("message", (raw) => {
  const event = JSON.parse(String(raw));
  events.push(event);
  if (event.type === "plan-job") log(`job ${event.job} ${event.state}: ${event.message}`);
  if (event.type === "error") log(`server error: ${event.message}`);
  if (event.type === "question-round" && autoAnswer.has(event.round.sessionId)) {
    setTimeout(
      () =>
        send({
          type: "answer-round",
          sessionId: event.round.sessionId,
          roundId: event.round.id,
          answers: recommended(event.round),
        }),
      800,
    );
  }
});
send({ type: "hello", protocolVersion: 1 });
const waitFor = async (predicate, timeoutMs, from = 0) => {
  let found = null;
  await until(() => {
    found = events.slice(from).find(predicate) ?? null;
    return Boolean(found);
  }, timeoutMs);
  return found;
};
const same = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase();
const latestPlan = () =>
  [...events].reverse().find((e) => e.type === "plan" && same(e.repoPath, repo))?.plan ?? null;

// ---------------------------------------------------------------- capture

const shoot = (label, shots) => {
  const file = join(root, `${label}.json`);
  writeFileSync(file, JSON.stringify(shots, null, 2));
  try {
    const out = execFileSync(
      process.execPath,
      [join(here, "tools", "captureUi.mjs"), file, outDir],
      {
        encoding: "utf8",
        timeout: 240_000,
      },
    );
    log(out.trim().replace(/\n/g, " | "));
  } catch (error) {
    log(`capture ${label} failed: ${String(error).slice(0, 300)}`);
  }
};
const step = (n) => `.op-wf-steps li:nth-child(${n}) button`;
const STEPPER = {
  stepper: ".op-wf-steps",
  next: ".op-next",
  tools: ".op-wf-tools",
  home: ".op-header-home",
};

// ---- 1. Home and the two forms (a fresh server has no sessions: home opens by itself)
shoot("home", [
  {
    name: "01-home",
    url: WEB,
    steps: [{ waitFor: "[data-testid=home-screen]" }, { wait: 800 }],
    rects: {
      newPath: ".op-home-path:nth-child(1)",
      importPath: ".op-home-path:nth-child(2)",
      home: ".op-header-home",
    },
  },
  {
    name: "02-new-form",
    url: WEB,
    steps: [
      { waitFor: "[data-testid=home-screen]" },
      { clickText: "new project from an idea" },
      { waitFor: ".op-home-form textarea" },
      {
        type: {
          selector: ".op-home-form textarea",
          text: "A shared shopping list for my family: anyone can add items, and it tidies itself up after a trip to the store.",
        },
      },
      { wait: 500 },
    ],
    rects: {
      idea: ".op-home-form textarea",
      name: ".op-home-form label:nth-of-type(2) input",
      parent: ".op-home-form label:nth-of-type(3) input",
      hint: ".op-home-form .op-dialog-hint",
      submit: ".op-home-form button[type=submit]",
    },
  },
  {
    name: "03-import-form",
    url: WEB,
    steps: [
      { waitFor: "[data-testid=home-screen]" },
      { clickText: "import something that exists" },
      { waitFor: ".op-home-form input" },
      { type: { selector: ".op-home-form input", text: repo } },
      { clickText: "add a file or folder" },
      { clickText: "add a file or folder" },
      { wait: 300 },
      { type: { selector: "[aria-label='Extra path 1']", text: spec } },
      { type: { selector: "[aria-label='Extra path 2']", text: notes } },
      { clickText: "paste text" },
      { wait: 300 },
      {
        type: {
          selector: "[aria-label='Pasted text 1']",
          text: "From a chat with my sister: she'd use it too, if it could sync between our laptops.",
        },
      },
      { wait: 500 },
    ],
    rects: {
      main: ".op-home-form input",
      extras: ".op-home-form fieldset:nth-of-type(1)",
      pastes: ".op-home-form fieldset:nth-of-type(2)",
      git: ".op-home-check",
      submit: ".op-home-form button[type=submit]",
    },
  },
]);

// ---- 2. Import: running, then the review
let mark = events.length;
send({
  type: "start-import",
  mainPath: repo,
  extraPaths: [spec, notes],
  pastes: ["From a chat with my sister: she'd use it too, if it could sync between our laptops."],
  gitInit: true,
});
await waitFor(
  (e) =>
    e.type === "plan-job" &&
    e.job === "ingest" &&
    e.state === "running" &&
    /reading/i.test(e.message),
  60_000,
  mark,
);
const openTally = [
  { waitFor: ".op-header" },
  { clickText: "home" },
  { waitFor: "[data-testid=home-screen]" },
  { clickText: "tally" },
];
shoot("reading", [
  {
    name: "04-reading",
    url: WEB,
    steps: [...openTally, { waitFor: "[data-testid=ingest-review]" }, { wait: 600 }],
    rects: { ...STEPPER, spinner: ".op-hw-spinner", understand: step(2) },
  },
]);
const ingested = await waitFor(
  (e) => e.type === "plan-job" && e.job === "ingest" && e.state !== "running",
  15 * 60_000,
  mark,
);
if (ingested?.state !== "done") throw new Error("import failed");
await sleep(1500);
const draft = latestPlan()?.ingest;
const firstDisagreement = draft?.items.find((i) => i.disagreement)?.id;
const inferred = draft?.items.find((i) => i.evidence === "inferred")?.id;
shoot("review", [
  {
    name: "05-review-top",
    url: WEB,
    steps: [...openTally, { waitFor: ".op-ig-head" }, { wait: 800 }],
    rects: {
      ...STEPPER,
      maturity: ".op-ig-maturity",
      reasons: ".op-ig-reasons",
      title: ".op-ig-body label:nth-of-type(1)",
      sources: ".op-ig-sources",
      firstItem: ".op-ig-item",
      apply: ".op-ig-foot .op-button--primary",
      footer: ".op-ig-foot",
    },
  },
  {
    name: "06-review-items",
    url: WEB,
    steps: [
      ...openTally,
      { waitFor: ".op-ig-item" },
      { scrollIntoView: ".op-ig-group", block: "start" },
      { wait: 800 },
    ],
    rects: {
      group: ".op-ig-group",
      item: ".op-ig-item",
      keep: ".op-ig-item .op-ig-keep",
      evidence: ".op-ig-item .op-ig-evidence",
      apply: ".op-ig-foot .op-button--primary",
    },
  },
  ...(inferred
    ? [
        {
          name: "07-review-assumption",
          url: WEB,
          steps: [
            ...openTally,
            { waitFor: ".op-ig-item" },
            { scrollIntoView: `[aria-label^='${inferred} ']` },
            { wait: 800 },
          ],
          rects: {
            item: `[aria-label^='${inferred} ']`,
            badge: `[aria-label^='${inferred} '] .op-ig-tentative`,
            evidence: `[aria-label^='${inferred} '] .op-ig-evidence`,
          },
        },
      ]
    : []),
  ...(firstDisagreement
    ? [
        {
          name: "08-review-disagree",
          url: WEB,
          steps: [
            ...openTally,
            { waitFor: ".op-ig-item" },
            { scrollIntoView: `[aria-label^='${firstDisagreement} ']` },
            {
              select: { selector: `[aria-label^='${firstDisagreement} '] select`, value: "parked" },
            },
            { wait: 900 },
          ],
          rects: {
            item: `[aria-label^='${firstDisagreement} ']`,
            select: `[aria-label^='${firstDisagreement} '] select`,
            problem: ".op-ig-foot output",
            apply: ".op-ig-foot .op-button--primary",
          },
        },
      ]
    : []),
]);

// ---- 3. Apply (as the review above: park disagreements) -> the interview
const reviewed = latestPlan()?.ingest ?? draft;
const parked = {
  ...reviewed,
  items: reviewed.items.map((i) => (i.disagreement ? { ...i, resolution: "parked" } : i)),
};
mark = events.length;
send({ type: "apply-ingest", repoPath: repo, draft: parked });
const focus = await waitFor((e) => e.type === "focus-session", 120_000, mark);
const sessionId = focus?.sessionId;
if (!sessionId) throw new Error("no interview session");
await waitFor((e) => e.type === "question-round" && e.round.sessionId === sessionId, 300_000, mark);
await sleep(1500);
const SESSION = `${WEB}?session=${sessionId}`;
shoot("interview", [
  {
    name: "09-interview",
    url: SESSION,
    steps: [{ waitFor: "[data-testid=question-round-slot]" }, { wait: 1200 }],
    rects: {
      ...STEPPER,
      interview: step(3),
      dock: "[data-testid=question-round-slot]",
      board: "[aria-label='Plan board']",
      coverage: ".op-coverage, [aria-label='Coverage']",
      conversation: "[aria-label='Conversation']",
    },
  },
  {
    name: "10-focus",
    url: `${SESSION}&focus=1`,
    steps: [{ waitFor: ".op-focus-round" }, { wait: 1000 }],
    rects: { round: ".op-focus-round" },
  },
]);

// ---- 4. Answer rounds (recommended options) until Claude writes GOAL.md
autoAnswer.add(sessionId);
const firstRound = [...events]
  .reverse()
  .find((e) => e.type === "question-round" && e.round.sessionId === sessionId);
if (firstRound) {
  send({
    type: "answer-round",
    sessionId,
    roundId: firstRound.round.id,
    answers: recommended(firstRound.round),
  });
}
await until(
  () => events.filter((e) => e.type === "round-answered" && e.sessionId === sessionId).length >= 2,
  8 * 60_000,
);
shoot("answered", [
  {
    name: "11-answered",
    url: SESSION,
    steps: [{ waitFor: "[aria-label='Conversation']" }, { wait: 1500 }],
    rects: {
      ...STEPPER,
      conversation: "[aria-label='Conversation']",
      board: "[aria-label='Plan board']",
      chips: ".op-answer-chips, .op-chips",
    },
  },
]);
const WRITE_GOAL =
  "Please write GOAL.md now with plan_write_goal: the title, why, goals, non-goals and a definition of done where every item is checkable by running something. Ask me first about anything you'd otherwise have to guess.";
mark = events.length;
send({ type: "send-message", sessionId, text: WRITE_GOAL });
await until(() => (latestPlan()?.goal?.done.length ?? 0) > 0, 15 * 60_000, 1000);
autoAnswer.delete(sessionId);
log(`goal: ${latestPlan()?.goal?.title} (${latestPlan()?.goal?.done.length} done-when items)`);
await sleep(3000);
shoot("goal", [
  {
    name: "12-goal",
    url: SESSION,
    steps: [
      { waitFor: ".op-wf-steps" },
      { click: step(4) },
      { waitFor: "[aria-label='Goal']" },
      { wait: 900 },
    ],
    rects: {
      ...STEPPER,
      goal: step(4),
      pane: "[aria-label='Goal']",
      dod: "[aria-label='Definition of done']",
    },
  },
]);

// ---- 5. Stages
mark = events.length;
send({ type: "generate-stages", repoPath: repo });
await waitFor(
  (e) => e.type === "stages" && same(e.repoPath, repo) && e.stages.length > 0,
  60_000,
  mark,
);
shoot("stages", [
  {
    name: "13-stages",
    url: SESSION,
    steps: [
      { waitFor: ".op-wf-steps" },
      { click: step(5) },
      { waitFor: ".op-stage-list" },
      { wait: 900 },
    ],
    rects: {
      ...STEPPER,
      stages: step(5),
      list: ".op-stage-list",
      copy: ".op-stage .op-card-action",
    },
  },
]);

// ---- 6. Hand off: generate (Claude), review, apply before Octogent runs, Run Octogent, retry
mark = events.length;
send({ type: "generate-handoff", repoPath: repo, heading: latestPlan()?.goal?.title ?? "v1" });
await waitFor(
  (e) => e.type === "plan-job" && e.job === "handoff-generate" && e.state !== "running",
  10 * 60_000,
  mark,
);
await sleep(1500);
shoot("handoff", [
  {
    name: "14-handoff-generate",
    url: SESSION,
    steps: [
      { waitFor: ".op-wf-steps" },
      { click: step(6) },
      { waitFor: "[data-testid=handoff-wizard]" },
      { wait: 800 },
    ],
    rects: {
      ...STEPPER,
      handoff: step(6),
      wizard: "[data-testid=handoff-wizard]",
      steps: ".op-hw-steps",
      advanced: ".op-step-advanced",
    },
  },
  {
    name: "15-handoff-review",
    url: SESSION,
    steps: [
      { waitFor: ".op-wf-steps" },
      { click: step(6) },
      { waitFor: "[data-testid=handoff-wizard]" },
      { clickText: "review existing draft" },
      { wait: 1200 },
    ],
    rects: {
      wizard: "[data-testid=handoff-wizard]",
      steps: ".op-hw-steps",
      next: ".op-hw-footer .op-button--primary",
    },
  },
  {
    name: "16-handoff-needs-octogent",
    url: SESSION,
    steps: [
      { waitFor: ".op-wf-steps" },
      { click: step(6) },
      { waitFor: "[data-testid=handoff-wizard]" },
      { clickText: "review existing draft" },
      { wait: 600 },
      { clickText: "next: apply" },
      { wait: 600 },
      { clickText: "apply to octogent" },
      { waitFor: "[data-testid=octogent-launch]", timeoutMs: 120_000 },
      { wait: 2500 },
    ],
    rects: {
      launch: "[data-testid=octogent-launch]",
      run: "text=run octogent",
      retry: "text=retry apply",
      results: "[aria-label='Tentacle results']",
    },
  },
  {
    name: "17-run-octogent",
    url: SESSION,
    steps: [
      { waitFor: ".op-wf-steps" },
      { click: step(7) },
      { waitFor: "[data-testid=octogent-launch]" },
      { wait: 1500 },
      { clickText: "run octogent" },
      { waitFor: ".op-og-chip--running", timeoutMs: 120_000 },
      { wait: 1200 },
    ],
    rects: {
      ...STEPPER,
      build: step(7),
      launch: "[data-testid=octogent-launch]",
      chip: ".op-og-chip",
      open: "[data-testid=octogent-launch] a",
      trust: ".op-og-hint",
    },
  },
]);

// Retry the apply now that Octogent runs (the same click as "Retry apply").
mark = events.length;
send({ type: "apply-handoff", repoPath: repo });
const handoff = await waitFor(
  (e) => e.type === "handoff-result" && same(e.repoPath, repo),
  5 * 60_000,
  mark,
);
log(`handoff: ${handoff?.result.message}`);
const octogentUrl =
  [...events].reverse().find((e) => e.type === "octogent-status" && e.status.url)?.status.url ??
  `http://127.0.0.1:${OCTOGENT_PORT}`;
await sleep(2000);
shoot("done", [
  {
    name: "18-handoff-done",
    url: SESSION,
    steps: [
      { waitFor: ".op-wf-steps" },
      { click: step(6) },
      { waitFor: ".op-hw-done" },
      { wait: 1200 },
    ],
    rects: {
      ...STEPPER,
      done: ".op-hw-done",
      prompt: ".op-hw-octopus",
      copy: "text=copy octopus prompt",
      open: "[data-testid=octogent-launch] a",
    },
  },
  {
    name: "19-build",
    url: SESSION,
    steps: [
      { waitFor: ".op-wf-steps" },
      { click: step(7) },
      { waitFor: "[data-testid=tentacle-cards]" },
      { wait: 2500 },
    ],
    rects: {
      ...STEPPER,
      build: step(7),
      launch: "[data-testid=octogent-launch]",
      cards: "[data-testid=tentacle-cards]",
    },
  },
  { name: "20-og-deck", url: octogentUrl, steps: [{ wait: 3000 }, { key: "2" }, { wait: 2500 }] },
  { name: "21-og-agents", url: octogentUrl, steps: [{ wait: 3000 }, { key: "1" }, { wait: 2500 }] },
]);

// ---- 7. Octogent: start the octopus with the prompt Octoplan wrote
const octopusPrompt = readFileSync(join(repo, "docs", "plan", "OCTOPUS.md"), "utf8");
const spawned = await fetch(`${octogentUrl}/api/terminals`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    workspaceMode: "shared",
    agentProvider: "claude-code",
    tentacleId: "__octoboss__",
    initialPrompt: octopusPrompt,
  }),
})
  .then((r) => r.json())
  .catch((error) => ({ error: String(error) }));
log(`octoboss terminal: ${JSON.stringify(spawned).slice(0, 200)}`);

writeFileSync(
  join(root, "footage-state.json"),
  JSON.stringify(
    { root, repo, sessionId, web: WEB, session: SESSION, octogentUrl, terminal: spawned },
    null,
    2,
  ),
);
log(`state at ${join(root, "footage-state.json")}. Servers stay up; Ctrl+C when done.`);
