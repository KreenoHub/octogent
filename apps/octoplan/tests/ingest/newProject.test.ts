import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProject, initGitRepo } from "../../server/ingest/newProject";
import { createFakeExec, fail, ok } from "../integrations/fakeExec";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const parentDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "octoplan-new-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

describe("new project from an idea (D51)", () => {
  it("creates <parent>/<slug> with README, docs/plan and a first commit of just those", async () => {
    const parent = parentDir();
    const { exec, calls } = createFakeExec({
      "git init": ok("Initialized"),
      "git add": ok(""),
      "git commit": ok("[main (root-commit) abc] start"),
    });
    const result = await createProject(exec, {
      parentDir: parent,
      name: "Habit Tracker!",
      idea: "Log a habit a day and see a weekly streak.",
    });
    const repoPath = join(parent, "habit-tracker");
    expect(result).toEqual({ ok: true, repoPath });
    expect(readFileSync(join(repoPath, "README.md"), "utf8")).toBe(
      "# Habit Tracker!\n\nLog a habit a day and see a weekly streak.\n",
    );
    expect(readFileSync(join(repoPath, "docs", "plan", ".gitkeep"), "utf8")).toBe("");
    expect(calls.map((c) => [c.command, ...c.args].join(" "))).toEqual([
      "git init",
      "git add -- README.md docs/plan/.gitkeep",
      "git commit -m chore: start Habit Tracker! (Octoplan)",
    ]);
    expect(calls.every((c) => c.cwd === repoPath)).toBe(true);
  });

  it("retries the commit with a fallback identity when git has none", async () => {
    let commits = 0;
    const { exec, calls } = createFakeExec({
      "git init": ok(""),
      "git add": ok(""),
      "git commit": () => {
        commits += 1;
        return fail(128, "Author identity unknown\n*** Please tell me who you are.");
      },
      "git -c": ok("committed"),
    });
    const result = await createProject(exec, { parentDir: parentDir(), name: "x", idea: "y" });
    expect(result.ok).toBe(true);
    expect(commits).toBe(1);
    expect(calls.at(-1)?.args.slice(0, 4)).toEqual([
      "-c",
      "user.name=Octoplan",
      "-c",
      "user.email=octoplan@localhost",
    ]);
  });

  it("refuses a folder that exists and isn't empty, and a missing parent", async () => {
    const parent = parentDir();
    mkdirSync(join(parent, "taken"));
    writeFileSync(join(parent, "taken", "file.txt"), "mine");
    const { exec, calls } = createFakeExec({});
    const taken = await createProject(exec, { parentDir: parent, name: "Taken", idea: "i" });
    expect(taken).toMatchObject({ ok: false });
    expect(!taken.ok && taken.message).toMatch(/already exists and isn't empty/);
    const missing = await createProject(exec, {
      parentDir: join(parent, "nope"),
      name: "A",
      idea: "i",
    });
    expect(!missing.ok && missing.message).toMatch(/Parent folder not found/);
    const noName = await createProject(exec, { parentDir: parent, name: "!!!", idea: "i" });
    expect(noName.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("keeps letters in any script in the folder name", async () => {
    const parent = parentDir();
    const { exec } = createFakeExec({
      "git init": ok(""),
      "git add": ok(""),
      "git commit": ok(""),
    });
    const result = await createProject(exec, {
      parentDir: parent,
      name: "מעקב הרגלים",
      idea: "i",
    });
    expect(result).toEqual({ ok: true, repoPath: join(parent, "מעקב-הרגלים") });
  });

  it("still creates the project without git, with a note", async () => {
    const { exec } = createFakeExec({ "git init": fail(127, "command not found: git") });
    const result = await createProject(exec, { parentDir: parentDir(), name: "nogit", idea: "i" });
    expect(result.ok && result.note).toMatch(/git isn't installed/);
  });
});

describe("git init for an imported folder (D52)", () => {
  it("makes one empty commit and never adds the user's files", async () => {
    const { exec, calls } = createFakeExec({ "git init": ok(""), "git commit": ok("") });
    expect(await initGitRepo(exec, "/w", { message: "start" })).toBeNull();
    expect(calls.map((c) => [c.command, ...c.args].join(" "))).toEqual([
      "git init",
      "git commit --allow-empty -m start",
    ]);
  });
});
