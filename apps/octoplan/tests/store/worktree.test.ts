import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFsPlanStore } from "../../server/store/fsPlanStore";
import {
  PROJECTS_FILE_NAME,
  createIdeaRegistry,
  mainCheckoutOf,
} from "../../server/store/ideaRegistry";

// A fake main checkout plus a linked worktree, laid out the way `git worktree add` does it.
let root: string;
let homeDir: string;
let main: string;
let worktree: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "octoplan-worktree-"));
  homeDir = join(root, "home");
  main = join(root, "main");
  worktree = join(main, ".claude", "worktrees", "feature");
  await mkdir(join(main, ".git", "worktrees", "feature"), { recursive: true });
  await mkdir(join(worktree, "apps"), { recursive: true });
  // git writes forward slashes, even on Windows.
  const gitdir = join(main, ".git", "worktrees", "feature").split("\\").join("/");
  await writeFile(join(worktree, ".git"), `gitdir: ${gitdir}\n`);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

const projects = async () =>
  JSON.parse(await readFile(join(homeDir, ".octoplan", PROJECTS_FILE_NAME), "utf8")) as {
    repos: string[];
  };

describe("worktrees map to their main checkout", () => {
  it("resolves the worktree root and paths inside it; leaves other paths alone", () => {
    expect(mainCheckoutOf(worktree)).toBe(main);
    expect(mainCheckoutOf(join(worktree, "apps"))).toBe(join(main, "apps"));
    expect(mainCheckoutOf(main)).toBe(main);
    expect(mainCheckoutOf(join(root, "elsewhere"))).toBe(join(root, "elsewhere"));
  });

  it("ignores a .git file that points somewhere other than .git/worktrees (a submodule)", async () => {
    const sub = join(main, "vendor", "lib");
    await mkdir(sub, { recursive: true });
    await writeFile(join(sub, ".git"), "gitdir: ../../.git/modules/lib\n");
    expect(mainCheckoutOf(sub)).toBe(sub);
  });

  it("registering a worktree adds no second entry, and search does not duplicate", async () => {
    const store = createFsPlanStore(main, { onWarning: () => undefined });
    await store.addIdea({
      title: "Dock",
      date: "2026-09-27",
      tags: [],
      status: "inbox",
      body: "Pinned rounds.",
    });
    await store.dispose();

    const registry = createIdeaRegistry({ homeDir });
    await registry.registerRepo(main);
    await registry.registerRepo(worktree);
    await registry.registerRepo(`${worktree}/`);
    expect((await projects()).repos).toEqual([main]);

    const results = await registry.searchIdeas("dock");
    expect(results.map((r) => [r.repoPath, r.idea.id])).toEqual([[main, "I1"]]);
  });

  it("collapses a projects.json that already lists both checkouts", async () => {
    await mkdir(join(homeDir, ".octoplan"), { recursive: true });
    await writeFile(
      join(homeDir, ".octoplan", PROJECTS_FILE_NAME),
      JSON.stringify({ repos: [worktree, main] }),
    );
    const registry = createIdeaRegistry({ homeDir });
    const store = createFsPlanStore(main, { onWarning: () => undefined });
    await store.addIdea({ title: "Dock", date: "2026-09-27", tags: [], status: "inbox", body: "" });
    await store.dispose();
    expect(await registry.searchIdeas("")).toHaveLength(1);
    await registry.registerRepo(main);
    expect((await projects()).repos).toEqual([main]);
  });
});
