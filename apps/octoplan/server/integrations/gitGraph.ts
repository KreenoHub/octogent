// Read-only git readers for the branch graph: commits with lanes, branches with ahead/behind
// against the base branch, and `octogent/<terminal-id>` worktree branches grouped by tentacle.
import type { GitBranchNode, GitCommitNode, TentacleLane } from "@octogent/octoplan-protocol";
import type { Exec } from "./types";
import { mapLimit } from "./util";

export const MAX_COMMITS = 400;
export const GIT_LOG_FORMAT = "%H%x1f%P%x1f%D%x1f%s%x1f%at";
const SEP = "\x1f";
const REV_LIST_CONCURRENCY = 8;

export type ParsedCommit = Omit<GitCommitNode, "lane">;

/** `HEAD -> main, origin/main, tag: v1` -> ["HEAD", "main", "origin/main", "tag: v1"]. */
export const parseRefs = (decoration: string): string[] =>
  decoration
    .split(", ")
    .map((ref) => ref.trim())
    .filter((ref) => ref.length > 0)
    .flatMap((ref) =>
      ref.startsWith("HEAD -> ") ? ["HEAD", ref.slice("HEAD -> ".length)] : [ref],
    );

export const parseGitLog = (stdout: string): ParsedCommit[] => {
  const commits: ParsedCommit[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const fields = line.split(SEP);
    if (fields.length < 5) continue;
    const [hash = "", parents = "", decoration = ""] = fields;
    if (!hash) continue;
    const time = Number.parseInt(fields[fields.length - 1] ?? "", 10);
    commits.push({
      hash,
      parents: parents.split(" ").filter((p) => p.length > 0),
      refs: parseRefs(decoration),
      subject: fields.slice(3, -1).join(SEP),
      time: Number.isFinite(time) ? time : 0,
    });
  }
  return commits;
};

/**
 * Column allocator. Each lane remembers the hash it expects next; a commit takes the lowest
 * lane waiting for it (others waiting for it close), its first parent inherits that lane, and
 * extra (merge) parents open the first free lane unless some lane already waits for them.
 */
export const allocateLanes = (commits: readonly ParsedCommit[]): GitCommitNode[] => {
  const lanes: (string | null)[] = [];
  const firstFree = () => {
    const index = lanes.indexOf(null);
    if (index !== -1) return index;
    lanes.push(null);
    return lanes.length - 1;
  };

  return commits.map((commit) => {
    let lane = -1;
    lanes.forEach((expected, index) => {
      if (expected !== commit.hash) return;
      if (lane === -1) lane = index;
      else lanes[index] = null;
    });
    if (lane === -1) lane = firstFree();

    const [first, ...rest] = commit.parents;
    lanes[lane] = first ?? null;
    for (const parent of rest) {
      if (!lanes.includes(parent)) lanes[firstFree()] = parent;
    }
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();
    return { ...commit, lane };
  });
};

export type RefRecord = { refname: string; name: string; head: string; isRemote: boolean };

export const parseForEachRef = (stdout: string): RefRecord[] => {
  const refs: RefRecord[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const [refname = "", head = ""] = line.split(SEP);
    if (!refname || !head) continue;
    if (refname.startsWith("refs/heads/")) {
      refs.push({ refname, name: refname.slice("refs/heads/".length), head, isRemote: false });
    } else if (refname.startsWith("refs/remotes/")) {
      const name = refname.slice("refs/remotes/".length);
      if (name.endsWith("/HEAD")) continue; // symbolic pointer, not a branch
      refs.push({ refname, name, head, isRemote: true });
    }
  }
  return refs;
};

/** `git rev-list --left-right --count base...branch` prints "<behind>\t<ahead>". */
export const parseAheadBehind = (stdout: string): { ahead: number; behind: number } | null => {
  const match = /^\s*(\d+)\s+(\d+)\s*$/.exec(stdout);
  if (!match) return null;
  return { behind: Number(match[1]), ahead: Number(match[2]) };
};

/** `octogent/<tentacle>-swarm-<n|parent>` / `octogent/<tentacle>-todo-<n>` -> `<tentacle>`. */
export const tentacleIdForBranch = (name: string, isRemote: boolean): string | undefined => {
  const local = isRemote ? name.slice(name.indexOf("/") + 1) : name;
  if (!local.startsWith("octogent/")) return undefined;
  const terminalId = local.slice("octogent/".length);
  if (!terminalId) return undefined;
  const worker = /^(.+)-(?:swarm|todo)-[^-]+$/.exec(terminalId);
  return worker ? worker[1] : terminalId;
};

export const groupTentacleLanes = (branches: readonly GitBranchNode[]): TentacleLane[] => {
  const groups = new Map<string, string[]>();
  for (const branch of branches) {
    if (!branch.tentacleId) continue;
    const list = groups.get(branch.tentacleId) ?? [];
    list.push(branch.name);
    groups.set(branch.tentacleId, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tentacleId, names]) => ({ tentacleId, branches: names.sort() }));
};

export const pickBase = async (
  exec: Exec,
  repoPath: string,
  refs: readonly RefRecord[],
): Promise<RefRecord | undefined> => {
  const local = (name: string) => refs.find((r) => !r.isRemote && r.name === name);
  const byRefname = (refname: string) => refs.find((r) => r.refname === refname);
  const direct = local("main") ?? local("master");
  if (direct) return direct;
  const symbolic = await exec(
    "git",
    ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"],
    repoPath,
  );
  if (symbolic.code === 0) {
    const target = byRefname(symbolic.stdout.trim());
    if (target) return target;
  }
  return byRefname("refs/remotes/origin/main") ?? byRefname("refs/remotes/origin/master");
};

export type GitReadResult = {
  commits: GitCommitNode[];
  branches: GitBranchNode[];
  lanes: TentacleLane[];
  baseBranch?: string;
  /** Set when git itself failed (for example: not a git repository). */
  error?: string;
};

export const readGit = async (exec: Exec, repoPath: string): Promise<GitReadResult> => {
  const log = await exec(
    "git",
    ["log", "--all", "--date-order", `--max-count=${MAX_COMMITS}`, `--format=${GIT_LOG_FORMAT}`],
    repoPath,
  );
  if (log.code !== 0 && !/does not have any commits/i.test(log.stderr)) {
    const reason = log.stderr.trim().split(/\r?\n/)[0] || `git exited with ${log.code}`;
    return { commits: [], branches: [], lanes: [], error: reason };
  }
  const commits = allocateLanes(
    parseGitLog(log.code === 0 ? log.stdout : "").slice(0, MAX_COMMITS),
  );

  const refsOut = await exec(
    "git",
    ["for-each-ref", "--format=%(refname)%1f%(objectname)", "refs/heads", "refs/remotes"],
    repoPath,
  );
  const refs = refsOut.code === 0 ? parseForEachRef(refsOut.stdout) : [];
  const base = await pickBase(exec, repoPath, refs);

  const branches = await mapLimit(refs, REV_LIST_CONCURRENCY, async (ref) => {
    let counts = { ahead: 0, behind: 0 };
    if (base && ref.refname !== base.refname) {
      const out = await exec(
        "git",
        ["rev-list", "--left-right", "--count", `${base.refname}...${ref.refname}`],
        repoPath,
      );
      counts = (out.code === 0 && parseAheadBehind(out.stdout)) || counts;
    }
    const tentacleId = tentacleIdForBranch(ref.name, ref.isRemote);
    const node: GitBranchNode = {
      name: ref.name,
      head: ref.head,
      isRemote: ref.isRemote,
      ...counts,
      ...(tentacleId ? { tentacleId } : {}),
    };
    return node;
  });

  return {
    commits,
    branches,
    lanes: groupTentacleLanes(branches),
    ...(base ? { baseBranch: base.name } : {}),
  };
};
