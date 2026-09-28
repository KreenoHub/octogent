// D51 "New project from an idea" and D52's optional git init for an imported folder. Octoplan
// only ever writes outside docs/plan here, and only into a folder it just created (or, for an
// import, a single empty commit that touches no files).
import { existsSync } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { projectFolderName } from "@octogent/octoplan-protocol";
import type { Exec } from "../integrations/types";

export type CreateProjectInput = { parentDir: string; name: string; idea: string };
export type CreateProjectResult =
  | { ok: true; repoPath: string; note?: string }
  | { ok: false; message: string };

/** Used only when git has no user.name/user.email configured, so the first commit can't fail. */
const FALLBACK_IDENTITY = ["-c", "user.name=Octoplan", "-c", "user.email=octoplan@localhost"];

const firstLine = (text: string) => text.trim().split(/\r?\n/)[0] ?? "";

const isEmptyDir = async (dir: string) => (await readdir(dir)).length === 0;

/** `git commit`, retried with a fallback identity when git has none. */
const commit = async (exec: Exec, dir: string, args: string[]) => {
  const first = await exec("git", ["commit", ...args], dir);
  if (first.code === 0) return first;
  if (!/tell me who you are|empty ident|user\.email|user\.name/i.test(first.stderr)) return first;
  return exec("git", [...FALLBACK_IDENTITY, "commit", ...args], dir);
};

export const isGitRepo = async (exec: Exec, dir: string): Promise<boolean> => {
  const result = await exec("git", ["rev-parse", "--is-inside-work-tree"], dir);
  return result.code === 0 && result.stdout.trim() === "true";
};

/**
 * `git init` plus a first commit: of `files` when given, else an empty one (an imported folder's
 * files are the user's to commit). Returns a user-facing problem, or null on success.
 */
export const initGitRepo = async (
  exec: Exec,
  dir: string,
  options: { files?: string[]; message: string },
): Promise<string | null> => {
  const init = await exec("git", ["init"], dir);
  if (init.code !== 0) {
    return init.code === 127
      ? "git isn't installed, so this project has no history (harvest and drift stay off)."
      : `git init failed: ${firstLine(init.stderr) || init.code}`;
  }
  if (options.files && options.files.length > 0) {
    const add = await exec("git", ["add", "--", ...options.files], dir);
    if (add.code !== 0) return `git add failed: ${firstLine(add.stderr) || add.code}`;
  }
  const args = options.files?.length
    ? ["-m", options.message]
    : ["--allow-empty", "-m", options.message];
  const done = await commit(exec, dir, args);
  return done.code === 0 ? null : `git commit failed: ${firstLine(done.stderr) || done.code}`;
};

export const createProject = async (
  exec: Exec,
  input: CreateProjectInput,
): Promise<CreateProjectResult> => {
  const name = input.name.trim();
  const idea = input.idea.trim();
  const slug = projectFolderName(name);
  if (!slug) return { ok: false, message: "Give the project a name with letters or digits." };
  const parent = path.resolve(input.parentDir.trim().replace(/^"(.*)"$/, "$1"));
  const parentStat = await stat(parent).catch(() => null);
  if (!parentStat?.isDirectory()) {
    return { ok: false, message: `Parent folder not found: ${parent}` };
  }
  const repoPath = path.join(parent, slug);
  if (existsSync(repoPath)) {
    const isDir = (await stat(repoPath)).isDirectory();
    if (!isDir || !(await isEmptyDir(repoPath))) {
      return {
        ok: false,
        message: `${repoPath} already exists and isn't empty. Pick another name.`,
      };
    }
  }

  await mkdir(path.join(repoPath, "docs", "plan"), { recursive: true });
  await writeFile(path.join(repoPath, "README.md"), `# ${name}\n\n${idea}\n`, "utf8");
  await writeFile(path.join(repoPath, "docs", "plan", ".gitkeep"), "", "utf8");
  const problem = await initGitRepo(exec, repoPath, {
    files: ["README.md", "docs/plan/.gitkeep"],
    message: `chore: start ${name} (Octoplan)`,
  });
  return problem ? { ok: true, repoPath, note: problem } : { ok: true, repoPath };
};
