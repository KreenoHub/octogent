// Temp Octogent workspaces for the v2 integrations tests (always under os.tmpdir()).
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type FixtureTentacle = { id: string; context?: string; todo?: string; todoMtime?: number };

export const makeWorkspace = (
  tentacles: readonly FixtureTentacle[],
  options: { project?: boolean } = {},
) => {
  const root = mkdtempSync(join(tmpdir(), "octoplan-ws-"));
  const octogent = join(root, ".octogent");
  mkdirSync(join(octogent, "tentacles"), { recursive: true });
  if (options.project !== false) writeFileSync(join(octogent, "project.json"), '{"id":"p1"}');
  for (const t of tentacles) {
    const dir = join(octogent, "tentacles", t.id);
    mkdirSync(dir, { recursive: true });
    if (t.context !== undefined) writeFileSync(join(dir, "CONTEXT.md"), t.context);
    if (t.todo !== undefined) {
      writeFileSync(join(dir, "todo.md"), t.todo);
      if (t.todoMtime !== undefined) utimesSync(join(dir, "todo.md"), t.todoMtime, t.todoMtime);
    }
  }
  return {
    root,
    dir: (id: string) => join(octogent, "tentacles", id),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
};

/** Git answers for a plain (non-worktree) checkout at `root`. */
export const plainRepoGit = (root: string) => ({
  "git rev-parse --path-format=absolute --git-common-dir": {
    code: 0,
    stdout: `${root.replace(/\\/g, "/")}/.git\n`,
    stderr: "",
  },
  "git rev-parse --show-toplevel": {
    code: 0,
    stdout: `${root.replace(/\\/g, "/")}\n`,
    stderr: "",
  },
});

/** Git answers for a linked worktree at `worktree` whose main checkout is `main`. */
export const linkedWorktreeGit = (main: string, worktree: string) => ({
  "git rev-parse --path-format=absolute --git-common-dir": {
    code: 0,
    stdout: `${main.replace(/\\/g, "/")}/.git\n`,
    stderr: "",
  },
  "git rev-parse --show-toplevel": {
    code: 0,
    stdout: `${worktree.replace(/\\/g, "/")}\n`,
    stderr: "",
  },
});
