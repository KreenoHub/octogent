// D48: the checkout Octogent runs in. A session opened on a linked git worktree still belongs
// to the main checkout's `.octogent/` (that's where Deck reads tentacles from).
import { existsSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import type { Exec } from "./types";

const samePath = (a: string, b: string): boolean => {
  const norm = (p: string) => resolve(p).replace(/[\\/]+$/, "");
  return process.platform === "win32"
    ? norm(a).toLowerCase() === norm(b).toLowerCase()
    : norm(a) === norm(b);
};

/**
 * The main worktree when `repoPath` is a linked worktree and the main one has `.octogent/`;
 * otherwise `repoPath`. Never throws: without git it is `repoPath`.
 */
export const resolveWorkspace = async (exec: Exec, repoPath: string): Promise<string> => {
  try {
    const common = await exec(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      repoPath,
    );
    const commonDir = common.code === 0 ? common.stdout.trim().split(/\r?\n/)[0] : "";
    if (!commonDir || basename(commonDir) !== ".git") return repoPath;
    const main = dirname(commonDir);

    const top = await exec("git", ["rev-parse", "--show-toplevel"], repoPath);
    const toplevel = top.code === 0 ? top.stdout.trim().split(/\r?\n/)[0] : "";
    if (!toplevel || samePath(main, toplevel)) return repoPath;
    return existsSync(resolve(main, ".octogent")) ? resolve(main) : repoPath;
  } catch {
    return repoPath;
  }
};
