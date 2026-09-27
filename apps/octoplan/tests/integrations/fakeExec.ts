// A recorded-output Exec for integrations tests: nothing here ever spawns a process.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Exec, ExecResult } from "../../server/integrations/types";

export const fixture = (name: string): string =>
  readFileSync(join(__dirname, "fixtures", name), "utf8");

export type ExecCall = { command: string; args: string[]; cwd: string };

export type Responder = ExecResult | ((call: ExecCall) => ExecResult | undefined);

export const ok = (stdout: string): ExecResult => ({ code: 0, stdout, stderr: "" });
export const fail = (code: number, stderr: string, stdout = ""): ExecResult => ({
  code,
  stdout,
  stderr,
});

/**
 * Routes are matched on `command + " " + args.join(" ")` by prefix; the longest matching
 * prefix wins. Unmatched calls return exit code 1 so a missing recording is loud in asserts.
 */
export const createFakeExec = (routes: Record<string, Responder>) => {
  const calls: ExecCall[] = [];
  const keys = Object.keys(routes).sort((a, b) => b.length - a.length);
  const exec: Exec = async (command, args, cwd) => {
    const call = { command, args: [...args], cwd };
    calls.push(call);
    const line = [command, ...args].join(" ");
    for (const key of keys) {
      if (line === key || line.startsWith(`${key} `)) {
        const responder = routes[key] as Responder;
        const result = typeof responder === "function" ? responder(call) : responder;
        if (result) return result;
      }
    }
    return fail(1, `fake exec: no recording for "${line}"`);
  };
  return { exec, calls };
};

export const GIT_LOG_PREFIX = "git log --all --date-order";

/** Recorded git output for the fixture repo (main, feat/x, octogent/* workers). */
export const gitRoutes = (): Record<string, Responder> => ({
  [GIT_LOG_PREFIX]: ok(fixture("gitLog.txt")),
  "git for-each-ref": ok(fixture("forEachRef.txt")),
  "git rev-list --left-right --count": (call) => {
    const range = call.args[3] ?? "";
    const table: Record<string, string> = {
      "refs/heads/main...refs/heads/feat/x": "1\t2\n",
      "refs/heads/main...refs/heads/octogent/api-swarm-0": "3\t1\n",
      "refs/heads/main...refs/heads/octogent/api-todo-2": "4\t0\n",
      "refs/heads/main...refs/heads/octogent/my-todo-app-swarm-parent": "2\t0\n",
      "refs/heads/main...refs/remotes/origin/main": "0\t0\n",
      "refs/heads/main...refs/remotes/origin/octogent/api-swarm-0": "3\t1\n",
    };
    const out = table[range];
    return out === undefined ? fail(128, `fatal: bad revision '${range}'`) : ok(out);
  },
});
