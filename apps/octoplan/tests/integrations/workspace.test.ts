import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createIntegrations } from "../../server/integrations";
import { resolveWorkspace } from "../../server/integrations/workspace";
import { createFakeExec, fail } from "./fakeExec";
import { linkedWorktreeGit, makeWorkspace, plainRepoGit } from "./workspaceFixture";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "octoplan-wt-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

describe("resolveWorkspace (D48)", () => {
  it("resolves a linked worktree to the main checkout when its .octogent exists", async () => {
    const main = makeWorkspace([]);
    cleanups.push(main.cleanup);
    const worktree = tempDir();
    const { exec, calls } = createFakeExec(linkedWorktreeGit(main.root, worktree));

    expect(await resolveWorkspace(exec, worktree)).toBe(main.root);
    expect(calls.every((c) => c.cwd === worktree)).toBe(true);
    expect(calls[0]?.args).toEqual(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  });

  it("stays on the worktree when the main checkout has no .octogent", async () => {
    const main = tempDir();
    const worktree = tempDir();
    const { exec } = createFakeExec(linkedWorktreeGit(main, worktree));
    expect(await resolveWorkspace(exec, worktree)).toBe(worktree);
  });

  it("resolves a plain repo to itself", async () => {
    const repo = makeWorkspace([]);
    cleanups.push(repo.cleanup);
    const { exec } = createFakeExec(plainRepoGit(repo.root));
    expect(await resolveWorkspace(exec, repo.root)).toBe(repo.root);
  });

  it("never throws: no git (or a throwing exec) means the repo itself", async () => {
    const dir = tempDir();
    const { exec } = createFakeExec({ git: fail(128, "fatal: not a git repository") });
    expect(await resolveWorkspace(exec, dir)).toBe(dir);
    expect(
      await resolveWorkspace(async () => {
        throw new Error("spawn failed");
      }, dir),
    ).toBe(dir);
  });

  it("export from a linked worktree writes to the main checkout's tentacle", async () => {
    const main = makeWorkspace([{ id: "api", context: "# API\n\nThe API.\n", todo: "# Todo\n" }]);
    cleanups.push(main.cleanup);
    const worktree = tempDir();
    const { exec } = createFakeExec(linkedWorktreeGit(main.root, worktree));
    const result = await createIntegrations({ exec }).exportToTentacle({
      repoPath: worktree,
      tentacleId: "api",
      goal: null,
      decisions: [],
      tasks: ["Add the route. Done when curl works."],
    });
    expect(result.ok).toBe(true);
    expect(readFileSync(join(main.dir("api"), "todo.md"), "utf8")).toContain(
      "- [ ] Add the route. Done when curl works.",
    );
  });
});
