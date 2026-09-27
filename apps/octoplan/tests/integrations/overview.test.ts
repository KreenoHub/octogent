// v2 overview readers against a fixture workspace + recorded git/gh output:
// tentacle summaries (D22), drift (D26) and harvest inputs (D11/D31).
import type { Decision, HarvestCandidate } from "@octogent/octoplan-protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createIntegrations } from "../../server/integrations";
import { branchBelongsTo } from "../../server/integrations/summaries";
import { type Responder, createFakeExec, fail, ok } from "./fakeExec";
import { makeWorkspace, plainRepoGit } from "./workspaceFixture";

const F = "\x1f";
const R = "\x1e";

let ws: ReturnType<typeof makeWorkspace>;
beforeEach(() => {
  ws = makeWorkspace([
    {
      id: "api",
      context:
        "# API Server\n\nServes the plan over HTTP.\nSecond line.\n\n## Owns\n- `apps/api/`\n",
      todo: "# Todo\n\n- [x] [D2] Routes. Done when curl works.\n- [x] Auth. Done when login.\n- [ ] [D3] Docs. Done when read.\n",
    },
    { id: "ui", context: "# UI\n\nThe cockpit.\n", todo: "# Todo\n", todoMtime: 1_700_000_000 },
    {
      id: "docs",
      todo: "# Todo\n\n- [x] One. Done when one.\n- [ ] Two. Done when two.\n",
      todoMtime: 1_700_000_500,
    },
  ]);
});
afterEach(() => ws.cleanup());

const refLine = (refname: string, sha: string, time: number) => `${refname}${F}${sha}${F}${time}`;

const summaryRoutes = (): Record<string, Responder> => ({
  ...plainRepoGit(ws.root),
  "git for-each-ref": ok(
    [
      refLine("refs/heads/main", "m1", 900),
      refLine("refs/heads/octogent/api-swarm-0", "a1", 1000),
      refLine("refs/heads/octogent/api/feature", "a2", 2000),
      refLine("refs/heads/feat/ui-cards", "u1", 1500),
      refLine("refs/heads/build", "b1", 3000),
      refLine("refs/remotes/origin/main", "m1", 900),
      refLine("refs/remotes/origin/HEAD", "m1", 900),
    ].join("\n"),
  ),
  "git rev-list --left-right --count": (call) => {
    const table: Record<string, string> = {
      "refs/heads/main...refs/heads/octogent/api-swarm-0": "3\t1\n",
      "refs/heads/main...refs/heads/octogent/api/feature": "0\t5\n",
      "refs/heads/main...refs/heads/feat/ui-cards": "2\t2\n",
    };
    const out = table[call.args[3] ?? ""];
    return out === undefined ? fail(128, "bad revision") : ok(out);
  },
  "gh pr list": ok(
    JSON.stringify([
      {
        number: 20,
        title: "api feature",
        headRefName: "octogent/api/feature",
        state: "OPEN",
        isDraft: false,
        url: "https://x/pr/20",
      },
      {
        number: 21,
        title: "api worker",
        headRefName: "octogent/api-swarm-0",
        state: "OPEN",
        isDraft: true,
        url: "https://x/pr/21",
      },
      {
        number: 5,
        title: "old ui",
        headRefName: "feat/ui-cards",
        state: "MERGED",
        isDraft: false,
        url: "https://x/pr/5",
      },
    ]),
  ),
  "gh pr checks 21": fail(1, "", JSON.stringify([{ state: "FAILURE" }])),
  "gh pr checks": ok(JSON.stringify([{ state: "SUCCESS" }])),
  // Octogent is down: any call to its CLI would fail (and must not happen).
  octogent: fail(1, "Error: Could not reach API at http://localhost:8787."),
});

describe("tentacleSummaries (D22)", () => {
  it("counts todos from disk and joins branches, ahead/behind, PR and activity with Octogent down", async () => {
    const { exec, calls } = createFakeExec(summaryRoutes());
    const summaries = await createIntegrations({ exec }).tentacleSummaries(ws.root);

    expect(calls.some((c) => c.command === "octogent")).toBe(false);
    expect(summaries.map((s) => s.tentacleId)).toEqual(["api", "docs", "ui"]);
    const [api, docs, ui] = summaries;
    expect(api).toEqual({
      tentacleId: "api",
      name: "API Server",
      description: "Serves the plan over HTTP. Second line.",
      done: 2,
      total: 3,
      branches: ["octogent/api-swarm-0", "octogent/api/feature"],
      ahead: 5,
      behind: 0,
      pr: { number: 21, state: "open", isDraft: true, checks: "failing", url: "https://x/pr/21" },
      lastActivity: 2000,
    });
    expect(docs).toMatchObject({ name: "docs", done: 1, total: 2, branches: [], ahead: 0 });
    expect(docs?.pr).toBeUndefined();
    expect(docs?.lastActivity).toBe(1_700_000_500);
    expect(ui).toMatchObject({
      name: "UI",
      done: 0,
      total: 0,
      branches: ["feat/ui-cards"],
      ahead: 2,
      behind: 2,
      pr: { number: 5, state: "merged", checks: "none" },
      lastActivity: 1500,
    });
  });

  it("still counts todos without git or gh", async () => {
    const { exec } = createFakeExec({ git: fail(128, "not a git repository"), gh: fail(127, "") });
    const summaries = await createIntegrations({ exec }).tentacleSummaries(ws.root);
    expect(summaries.map((s) => [s.tentacleId, s.done, s.total, s.branches.length])).toEqual([
      ["api", 2, 3, 0],
      ["docs", 1, 2, 0],
      ["ui", 0, 0, 0],
    ]);
  });

  it("maps branches by octogent/<id>/, worker prefix, or the id as a word", () => {
    expect(branchBelongsTo("octogent/api/x", "api")).toBe(true);
    expect(branchBelongsTo("octogent/api-todo-3", "api")).toBe(true);
    expect(branchBelongsTo("feat/api-routes", "api")).toBe(true);
    expect(branchBelongsTo("feat/rapid", "api")).toBe(false);
    expect(branchBelongsTo("octogent/apiary", "api")).toBe(false);
  });
});

const decision = (id: string, status: Decision["status"] = "active"): Decision => ({
  id,
  title: `Decision ${id}`,
  date: "2026-09-27",
  status,
  source: "s",
  questionIds: [],
  dependsOn: [],
  body: "",
});

const harvest = (id: string, status: HarvestCandidate["status"], contradicts: string[]) =>
  ({
    id,
    title: `Candidate ${id}`,
    date: "2026-09-27",
    source: "abc",
    sourceKind: "commit",
    status,
    contradicts,
    body: "",
  }) satisfies HarvestCandidate;

const SHA = (n: number) => `${String(n).repeat(7)}${"0".repeat(33)}`;

describe("computeDrift (D26)", () => {
  const driftRoutes = (): Record<string, Responder> => ({
    ...plainRepoGit(ws.root),
    "git log --all --max-count=500": ok(
      [
        `${SHA(1)}${F}feat: routes [D3]${F}Implements D3.\n${R}`,
        `${SHA(2)}${F}wip: graph${F}Refs D5 and D10.\n${R}`,
        `${SHA(3)}${F}chore: nothing${F}${R}`,
        `${SHA(4)}${F}fix: D4 tweak${F}${R}`,
      ].join("\n"),
    ),
    "git for-each-ref": ok(`refs/heads/main${F}${SHA(1)}\nrefs/heads/wip${F}${SHA(2)}\n`),
    "git rev-list --max-count=5000 refs/heads/main": ok(`${SHA(1)}\n${SHA(3)}\n${SHA(4)}\n`),
  });

  it("yields untouched, implemented and diverged with short evidence", async () => {
    const { exec, calls } = createFakeExec(driftRoutes());
    const drift = await createIntegrations({ exec }).computeDrift(
      ws.root,
      [
        decision("D1"),
        decision("D2"),
        decision("D3"),
        decision("D4"),
        decision("D5"),
        decision("D6", "superseded"),
      ],
      [harvest("H1", "pending", ["D4"]), harvest("H2", "rejected", ["D1"])],
    );
    expect(calls.find((c) => c.args[0] === "log")?.args).toEqual([
      "log",
      "--all",
      "--max-count=500",
      "--format=%H%x1f%s%x1f%b%x1e",
    ]);
    const byId = Object.fromEntries(drift.map((d) => [d.decisionId, d]));
    expect(Object.keys(byId)).toEqual(["D1", "D2", "D3", "D4", "D5"]);
    expect(byId.D1).toEqual({ decisionId: "D1", status: "untouched", evidence: [] });
    expect(byId.D2).toEqual({
      decisionId: "D2",
      status: "implemented",
      evidence: ["todo ticked in api"],
    });
    // D3's todo is still open, but its citing commit is on main.
    expect(byId.D3).toEqual({
      decisionId: "D3",
      status: "implemented",
      evidence: ["1111111 feat: routes [D3]"],
    });
    expect(byId.D4).toEqual({
      decisionId: "D4",
      status: "diverged",
      evidence: ["H1", "4444444 fix: D4 tweak"],
    });
    // Cited only on an unmerged branch: not implemented yet.
    expect(byId.D5).toEqual({
      decisionId: "D5",
      status: "untouched",
      evidence: ["2222222 wip: graph (not merged)"],
    });
  });
});

describe("readHarvestInputs (D11, D31)", () => {
  const log = [
    `${SHA(9)}${F}refs/heads/octogent/api-swarm-0${F}feat: api [D3]${F}Body line.\n${R}`,
    `${SHA(8)}${F}HEAD${F}docs: plan${F}${R}`,
  ].join("\n");

  it("returns the commits after the mark with branch names, newest first, and todo states", async () => {
    const { exec, calls } = createFakeExec({
      ...plainRepoGit(ws.root),
      "git rev-parse --abbrev-ref HEAD": ok("feat/octoplan-v2\n"),
      "git log --source": ok(log),
    });
    const inputs = await createIntegrations({ exec }).readHarvestInputs(ws.root, SHA(7));
    const logCall = calls.find((c) => c.args[0] === "log");
    expect(logCall?.args).toEqual([
      "log",
      "--source",
      "--date-order",
      "--max-count=50",
      "--format=%H%x1f%S%x1f%s%x1f%b%x1e",
      "--branches=octogent/*",
      "HEAD",
      `^${SHA(7)}`,
    ]);
    expect(inputs.headSha).toBe(SHA(9));
    expect(inputs.commits).toEqual([
      {
        sha: SHA(9),
        branch: "octogent/api-swarm-0",
        subject: "feat: api [D3]",
        body: "Body line.",
      },
      { sha: SHA(8), branch: "feat/octoplan-v2", subject: "docs: plan", body: "" },
    ]);
    expect(inputs.todos).toEqual([
      {
        tentacleId: "api",
        done: ["[D2] Routes. Done when curl works.", "Auth. Done when login."],
        open: ["[D3] Docs. Done when read."],
      },
      { tentacleId: "docs", done: ["One. Done when one."], open: ["Two. Done when two."] },
      { tentacleId: "ui", done: [], open: [] },
    ]);
  });

  it("reads the last 20 without a mark, keeps the mark when nothing is new, and needs git", async () => {
    const first = createFakeExec({ ...plainRepoGit(ws.root), "git log --source": ok(log) });
    await createIntegrations({ exec: first.exec }).readHarvestInputs(ws.root, null);
    const args = first.calls.find((c) => c.args[0] === "log")?.args ?? [];
    expect(args).toContain("--max-count=20");
    expect(args.some((a) => a.startsWith("^"))).toBe(false);

    const quiet = createFakeExec({ ...plainRepoGit(ws.root), "git log --source": ok("") });
    const none = await createIntegrations({ exec: quiet.exec }).readHarvestInputs(ws.root, SHA(9));
    expect(none).toMatchObject({ headSha: SHA(9), commits: [] });

    const noGit = createFakeExec({ git: fail(128, "fatal: not a git repository") });
    const out = await createIntegrations({ exec: noGit.exec }).readHarvestInputs(ws.root, null);
    expect(out.headSha).toBeNull();
    expect(out.commits).toEqual([]);
    expect(out.todos).toHaveLength(3);
  });

  it("starts over from recent commits when the mark no longer exists", async () => {
    const { exec, calls } = createFakeExec({
      ...plainRepoGit(ws.root),
      "git log --source": (call) =>
        call.args.some((a) => a.startsWith("^")) ? fail(128, "fatal: bad revision") : ok(log),
    });
    const inputs = await createIntegrations({ exec }).readHarvestInputs(ws.root, "gone");
    expect(calls.filter((c) => c.args[0] === "log")).toHaveLength(2);
    expect(inputs.headSha).toBe(SHA(9));
  });
});
