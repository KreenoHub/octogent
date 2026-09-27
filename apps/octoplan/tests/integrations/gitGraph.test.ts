import { describe, expect, it } from "vitest";
import {
  MAX_COMMITS,
  allocateLanes,
  groupTentacleLanes,
  parseAheadBehind,
  parseGitLog,
  readGit,
  tentacleIdForBranch,
} from "../../server/integrations/gitGraph";
import { GIT_LOG_PREFIX, createFakeExec, fail, fixture, gitRoutes, ok } from "./fakeExec";

const repo = "C:\\repos\\fixture";

describe("parseGitLog", () => {
  it("splits hashes, parents, refs, subject and time", () => {
    const commits = parseGitLog(fixture("gitLog.txt"));
    expect(commits).toHaveLength(7);
    expect(commits[0]).toEqual({
      hash: "c9",
      parents: ["c7", "c8"],
      refs: ["HEAD", "main", "origin/main", "origin/HEAD"],
      subject: "Merge branch feat/x",
      time: 1727000900,
    });
    expect(commits[5]?.refs).toEqual(["tag: v0.1", "octogent/api-todo-2"]);
    expect(commits[6]?.parents).toEqual([]);
  });

  it("keeps a subject that contains odd characters", () => {
    const [commit] = parseGitLog('h1\x1f\x1f\x1fwhat | if & "quoted" %PATH%\x1f5\n');
    expect(commit?.subject).toBe('what | if & "quoted" %PATH%');
  });
});

describe("allocateLanes", () => {
  it("keeps first parents in their lane and opens lanes for merges and side branches", () => {
    const lanes = Object.fromEntries(
      allocateLanes(parseGitLog(fixture("gitLog.txt"))).map((c) => [c.hash, c.lane]),
    );
    expect(lanes).toEqual({ c9: 0, c8: 1, c6: 2, c7: 0, c5: 1, c4: 0, c3: 0 });
  });

  it("reuses a freed lane instead of growing", () => {
    const commits = allocateLanes([
      { hash: "a", parents: ["b"], refs: [], subject: "", time: 3 },
      { hash: "x", parents: ["b"], refs: [], subject: "", time: 2 },
      { hash: "b", parents: [], refs: [], subject: "", time: 1 },
      { hash: "y", parents: [], refs: [], subject: "", time: 0 },
    ]);
    expect(commits.map((c) => c.lane)).toEqual([0, 1, 0, 0]);
  });
});

describe("tentacle mapping", () => {
  it("maps octogent/<terminal-id> to the prefix before -swarm- / -todo-", () => {
    expect(tentacleIdForBranch("octogent/api-swarm-0", false)).toBe("api");
    expect(tentacleIdForBranch("octogent/api-swarm-parent", false)).toBe("api");
    expect(tentacleIdForBranch("octogent/api-todo-2", false)).toBe("api");
    expect(tentacleIdForBranch("octogent/my-todo-app-swarm-3", false)).toBe("my-todo-app");
    expect(tentacleIdForBranch("origin/octogent/api-swarm-0", true)).toBe("api");
    expect(tentacleIdForBranch("octogent/solo", false)).toBe("solo");
    expect(tentacleIdForBranch("feat/octogent/api-swarm-0", false)).toBeUndefined();
    expect(tentacleIdForBranch("main", false)).toBeUndefined();
  });

  it("groups branches into lanes", () => {
    const lanes = groupTentacleLanes([
      {
        name: "octogent/b-todo-1",
        head: "1",
        isRemote: false,
        ahead: 0,
        behind: 0,
        tentacleId: "b",
      },
      {
        name: "octogent/a-swarm-0",
        head: "2",
        isRemote: false,
        ahead: 0,
        behind: 0,
        tentacleId: "a",
      },
      { name: "main", head: "3", isRemote: false, ahead: 0, behind: 0 },
      {
        name: "octogent/a-swarm-1",
        head: "4",
        isRemote: false,
        ahead: 0,
        behind: 0,
        tentacleId: "a",
      },
    ]);
    expect(lanes).toEqual([
      { tentacleId: "a", branches: ["octogent/a-swarm-0", "octogent/a-swarm-1"] },
      { tentacleId: "b", branches: ["octogent/b-todo-1"] },
    ]);
  });
});

describe("parseAheadBehind", () => {
  it("reads left (behind main) and right (ahead) counts", () => {
    expect(parseAheadBehind("3\t1\n")).toEqual({ behind: 3, ahead: 1 });
    expect(parseAheadBehind("0 12")).toEqual({ behind: 0, ahead: 12 });
    expect(parseAheadBehind("garbage")).toBeNull();
  });
});

describe("readGit", () => {
  it("builds commits, branches with ahead/behind main, and tentacle lanes", async () => {
    const { exec, calls } = createFakeExec(gitRoutes());
    const git = await readGit(exec, repo);

    const logCall = calls.find((c) => c.args[0] === "log");
    expect(logCall?.args).toEqual([
      "log",
      "--all",
      "--date-order",
      `--max-count=${MAX_COMMITS}`,
      "--format=%H%x1f%P%x1f%D%x1f%s%x1f%at",
    ]);
    expect(logCall?.cwd).toBe(repo);
    expect(git.baseBranch).toBe("main");
    expect(git.commits).toHaveLength(7);

    const byName = Object.fromEntries(git.branches.map((b) => [b.name, b]));
    expect(byName["origin/HEAD"]).toBeUndefined();
    expect(byName.main).toMatchObject({ ahead: 0, behind: 0, isRemote: false, head: "c9" });
    expect(byName["feat/x"]).toMatchObject({ ahead: 2, behind: 1 });
    expect(byName["octogent/api-swarm-0"]).toMatchObject({
      ahead: 1,
      behind: 3,
      tentacleId: "api",
    });
    expect(byName["origin/octogent/api-swarm-0"]).toMatchObject({
      isRemote: true,
      tentacleId: "api",
    });
    expect(git.lanes).toEqual([
      {
        tentacleId: "api",
        branches: ["octogent/api-swarm-0", "octogent/api-todo-2", "origin/octogent/api-swarm-0"],
      },
      { tentacleId: "my-todo-app", branches: ["octogent/my-todo-app-swarm-parent"] },
    ]);
    // no rev-list for the base branch itself
    expect(calls.some((c) => c.args.includes("refs/heads/main...refs/heads/main"))).toBe(false);
  });

  it("falls back to master when there is no main", async () => {
    const { exec, calls } = createFakeExec({
      [GIT_LOG_PREFIX]: ok("c1\x1f\x1fHEAD -> master\x1finit\x1f1\n"),
      "git for-each-ref": ok("refs/heads/master\x1fc1\nrefs/heads/dev\x1fc1\n"),
      "git rev-list": ok("0\t0\n"),
    });
    const git = await readGit(exec, repo);
    expect(git.baseBranch).toBe("master");
    expect(calls.find((c) => c.args[0] === "rev-list")?.args[3]).toBe(
      "refs/heads/master...refs/heads/dev",
    );
  });

  it("falls back to origin/HEAD when neither main nor master exist locally", async () => {
    const { exec, calls } = createFakeExec({
      [GIT_LOG_PREFIX]: ok("c1\x1f\x1f\x1finit\x1f1\n"),
      "git for-each-ref": ok(
        "refs/heads/dev\x1fc1\nrefs/remotes/origin/HEAD\x1fc1\nrefs/remotes/origin/trunk\x1fc1\n",
      ),
      "git symbolic-ref": ok("refs/remotes/origin/trunk\n"),
      "git rev-list": ok("0\t5\n"),
    });
    const git = await readGit(exec, repo);
    expect(git.baseBranch).toBe("origin/trunk");
    expect(git.branches.find((b) => b.name === "dev")).toMatchObject({ ahead: 5, behind: 0 });
    expect(calls.find((c) => c.args[0] === "rev-list")?.args[3]).toBe(
      "refs/remotes/origin/trunk...refs/heads/dev",
    );
  });

  it("returns an empty graph with a hint outside a git repo", async () => {
    const { exec } = createFakeExec({
      git: fail(128, "fatal: not a git repository (or any of the parent directories): .git"),
    });
    const git = await readGit(exec, repo);
    expect(git.commits).toEqual([]);
    expect(git.branches).toEqual([]);
    expect(git.error).toMatch(/not a git repository/i);
  });

  it("returns an empty graph (no error) for a repo with no commits yet", async () => {
    const { exec } = createFakeExec({
      [GIT_LOG_PREFIX]: fail(
        128,
        "fatal: your current branch 'main' does not have any commits yet",
      ),
      "git for-each-ref": ok(""),
    });
    const git = await readGit(exec, repo);
    expect(git.commits).toEqual([]);
    expect(git.error).toBeUndefined();
  });
});
