// D22: one summary per tentacle for the G cards and the header count. Todo progress comes from
// `.octogent/tentacles/*/todo.md` on disk, git status from local branches mapped to the
// tentacle, PR/CI from the cached gh reader. Octogent itself is never asked.
import type { PrStatus, TentacleSummary } from "@octogent/octoplan-protocol";
import { parseAheadBehind, parseForEachRef, pickBase, tentacleIdForBranch } from "./gitGraph";
import type { GithubReader } from "./github";
import { readTentacles } from "./tentacles";
import type { Exec } from "./types";
import { mapLimit } from "./util";
import { resolveWorkspace } from "./workspace";

const SEP = "\x1f";
const REV_LIST_CONCURRENCY = 8;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** `octogent/<id>/…`, an `octogent/<id>-swarm-…` worker, or a branch with the id as a word. */
export const branchBelongsTo = (branch: string, tentacleId: string): boolean => {
  if (branch.startsWith(`octogent/${tentacleId}/`)) return true;
  if (tentacleIdForBranch(branch, false) === tentacleId) return true;
  return new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(tentacleId)}($|[^A-Za-z0-9])`, "i").test(
    branch,
  );
};

/** `%(refname)%1f%(objectname)%1f%(committerdate:unix)` -> refname -> unix seconds. */
const parseRefTimes = (stdout: string): Map<string, number> => {
  const times = new Map<string, number>();
  for (const line of stdout.split(/\r?\n/)) {
    const [refname = "", , time = ""] = line.split(SEP);
    const seconds = Number.parseInt(time, 10);
    if (refname && Number.isFinite(seconds)) times.set(refname, seconds);
  }
  return times;
};

const newestPr = (prs: readonly PrStatus[], branches: readonly string[]) =>
  prs.filter((pr) => branches.includes(pr.headRef)).sort((a, b) => b.number - a.number)[0];

export const tentacleSummaries = async (
  exec: Exec,
  github: GithubReader,
  repoPath: string,
): Promise<TentacleSummary[]> => {
  const workspace = await resolveWorkspace(exec, repoPath);
  const tentacles = await readTentacles(workspace);
  if (tentacles.length === 0) return [];

  const refsOut = await exec(
    "git",
    [
      "for-each-ref",
      "--format=%(refname)%1f%(objectname)%1f%(committerdate:unix)",
      "refs/heads",
      "refs/remotes",
    ],
    repoPath,
  );
  const refs = refsOut.code === 0 ? parseForEachRef(refsOut.stdout) : [];
  const times = refsOut.code === 0 ? parseRefTimes(refsOut.stdout) : new Map<string, number>();
  const base = refs.length > 0 ? await pickBase(exec, repoPath, refs) : undefined;
  const locals = refs.filter((r) => !r.isRemote && r.refname !== base?.refname);

  const mapped = tentacles.map((t) => ({
    tentacle: t,
    refs: locals.filter((r) => branchBelongsTo(r.name, t.id)),
  }));
  const anyBranches = mapped.some((m) => m.refs.length > 0);
  const prs = anyBranches ? (await github.read(repoPath)).prs : [];

  // Ahead/behind for every mapped branch once (a branch can match two tentacles).
  const unique = [...new Map(mapped.flatMap((m) => m.refs).map((r) => [r.refname, r])).values()];
  const counts = new Map<string, { ahead: number; behind: number }>();
  if (base) {
    await mapLimit(unique, REV_LIST_CONCURRENCY, async (ref) => {
      const out = await exec(
        "git",
        ["rev-list", "--left-right", "--count", `${base.refname}...${ref.refname}`],
        repoPath,
      );
      const parsed = out.code === 0 ? parseAheadBehind(out.stdout) : null;
      if (parsed) counts.set(ref.refname, parsed);
    });
  }

  return mapped.map(({ tentacle, refs: own }) => {
    const branches = own.map((r) => r.name).sort();
    // The most-ahead branch speaks for the tentacle (ties: the fewest behind).
    const primary = own
      .map((r) => counts.get(r.refname) ?? { ahead: 0, behind: 0 })
      .sort((a, b) => b.ahead - a.ahead || a.behind - b.behind)[0] ?? { ahead: 0, behind: 0 };
    const commitTimes = own
      .map((r) => times.get(r.refname))
      .filter((t): t is number => t !== undefined);
    const lastActivity = commitTimes.length > 0 ? Math.max(...commitTimes) : tentacle.todoMtime;
    const pr = newestPr(prs, branches);
    const summary: TentacleSummary = {
      tentacleId: tentacle.id,
      name: tentacle.name,
      description: tentacle.description,
      done: tentacle.todoDone,
      total: tentacle.todoTotal,
      branches,
      ahead: primary.ahead,
      behind: primary.behind,
      ...(pr
        ? {
            pr: {
              number: pr.number,
              state: pr.state,
              isDraft: pr.isDraft,
              checks: pr.checks,
              url: pr.url,
            },
          }
        : {}),
      ...(lastActivity !== undefined ? { lastActivity } : {}),
    };
    return summary;
  });
};
