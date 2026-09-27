// D11/D31: what the harvest pass reads. Commits after the last harvest mark on `octogent/*`
// worker branches and the current branch (newest first, max 50), plus every tentacle's
// current todo state. Without a mark it looks at the last 20 commits.
import { readTentacles } from "./tentacles";
import type { Exec, HarvestInputs } from "./types";
import { resolveWorkspace } from "./workspace";

export const HARVEST_MAX_COMMITS = 50;
export const HARVEST_FIRST_RUN_COMMITS = 20;
const FIELD = "\x1f";
const RECORD = "\x1e";

export const parseHarvestLog = (stdout: string, headBranch: string): HarvestInputs["commits"] =>
  stdout
    .split(RECORD)
    .map((record) => record.replace(/^\s+/, ""))
    .filter((record) => record.length > 0)
    .flatMap((record) => {
      const [sha = "", source = "", subject = "", ...body] = record.split(FIELD);
      if (!/^[0-9a-f]{7,64}$/i.test(sha.trim())) return [];
      const ref = source.trim();
      const branch =
        ref === "HEAD" || !ref ? headBranch : ref.replace(/^refs\/(heads|remotes)\//, "");
      return [{ sha: sha.trim(), branch, subject: subject.trim(), body: body.join(FIELD).trim() }];
    });

const logArgs = (sinceSha: string | null) => [
  "log",
  "--source",
  "--date-order",
  `--max-count=${sinceSha ? HARVEST_MAX_COMMITS : HARVEST_FIRST_RUN_COMMITS}`,
  "--format=%H%x1f%S%x1f%s%x1f%b%x1e",
  "--branches=octogent/*",
  "HEAD",
  ...(sinceSha ? [`^${sinceSha}`] : []),
];

export const readHarvestInputs = async (
  exec: Exec,
  repoPath: string,
  sinceSha: string | null,
): Promise<HarvestInputs> => {
  const workspace = await resolveWorkspace(exec, repoPath);
  const todos = (await readTentacles(workspace)).map((t) => ({
    tentacleId: t.id,
    done: t.done,
    open: t.open,
  }));

  const head = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], repoPath);
  const headBranch = head.code === 0 ? head.stdout.trim() || "HEAD" : "HEAD";

  let mark = sinceSha;
  let log = await exec("git", logArgs(mark), repoPath);
  if (log.code !== 0 && mark) {
    // The mark is gone (rewritten history, gc): start over from the recent commits.
    mark = null;
    log = await exec("git", logArgs(null), repoPath);
  }
  if (log.code !== 0) return { headSha: null, commits: [], todos };

  const commits = parseHarvestLog(log.stdout, headBranch).slice(0, HARVEST_MAX_COMMITS);
  return { headSha: commits[0]?.sha ?? mark, commits, todos };
};
