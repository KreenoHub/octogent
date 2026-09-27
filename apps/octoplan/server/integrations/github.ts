// `gh` readers for PR + CI badges, cached per repo with backoff: results are reused for at
// least 60 s; while nothing changes (or gh keeps failing) the interval doubles up to 10 min,
// and any change resets it to 60 s. The UI only asks while the graph view is open.
import type { PrStatus } from "@octogent/octoplan-protocol";
import type { Exec, ExecResult } from "./types";
import { mapLimit } from "./util";

export const GH_MIN_INTERVAL_MS = 60_000;
export const GH_MAX_INTERVAL_MS = 10 * 60_000;
export const PR_LIST_LIMIT = 30;
const CHECKS_CONCURRENCY = 6;

export type GithubResult = { prs: PrStatus[]; ghAvailable: boolean; hint?: string };

const FAILING = new Set([
  "FAILURE",
  "FAILED",
  "ERROR",
  "CANCELLED",
  "TIMED_OUT",
  "ACTION_REQUIRED",
  "STARTUP_FAILURE",
]);
const PENDING = new Set(["PENDING", "QUEUED", "IN_PROGRESS", "WAITING", "REQUESTED", "EXPECTED"]);
const PASSING = new Set(["SUCCESS", "PASS"]);

export const mapChecks = (checks: readonly { state?: unknown }[]): PrStatus["checks"] => {
  const states = checks.map((c) => String(c.state ?? "").toUpperCase());
  if (states.some((s) => FAILING.has(s))) return "failing";
  if (states.some((s) => PENDING.has(s))) return "pending";
  if (states.some((s) => PASSING.has(s))) return "passing";
  return "none";
};

export const mapPrState = (state: unknown): PrStatus["state"] => {
  const value = String(state).toUpperCase();
  if (value === "MERGED") return "merged";
  if (value === "CLOSED") return "closed";
  return "open";
};

const parseJsonArray = (text: string): unknown[] | null => {
  try {
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/** Turns a failed gh call into a one-line hint for the graph header. */
export const ghHint = (result: ExecResult): string => {
  const text = `${result.stderr}\n${result.stdout}`;
  if (result.code === 127 || /command not found|not recognized|ENOENT/i.test(text)) {
    return "Install the GitHub CLI (gh) and run `gh auth login` to see PR and CI badges.";
  }
  if (/auth login|not logged in|authentication/i.test(text)) {
    return "Run `gh auth login` to see PR and CI badges.";
  }
  if (/set-default|default remote repository/i.test(text)) {
    return "Run `gh repo set-default` in this repo to pick which GitHub repo the badges come from.";
  }
  if (/no git remotes|not a git repository|none of the git remotes/i.test(text)) {
    return "This repo has no GitHub remote, so there are no PR badges.";
  }
  if (result.code === 124) return "gh timed out; PR badges will retry later.";
  const first = result.stderr.trim().split(/\r?\n/)[0];
  return `gh failed${first ? `: ${first}` : ""}. PR badges will retry later.`;
};

const fetchChecks = async (exec: Exec, repoPath: string, number: number) => {
  // gh exits 1 on failing and 8 on pending checks but still prints the JSON.
  const out = await exec("gh", ["pr", "checks", String(number), "--json", "state"], repoPath);
  const checks = parseJsonArray(out.stdout);
  return checks ? mapChecks(checks as { state?: unknown }[]) : "none";
};

export const fetchGithub = async (exec: Exec, repoPath: string): Promise<GithubResult> => {
  const list = await exec(
    "gh",
    [
      "pr",
      "list",
      "--json",
      "number,title,headRefName,state,isDraft,url",
      "--state",
      "all",
      "--limit",
      String(PR_LIST_LIMIT),
    ],
    repoPath,
  );
  const rows = list.code === 0 ? parseJsonArray(list.stdout) : null;
  if (!rows) return { prs: [], ghAvailable: false, hint: ghHint(list) };

  const prs = await mapLimit(rows, CHECKS_CONCURRENCY, async (raw): Promise<PrStatus | null> => {
    const row = raw as Record<string, unknown>;
    const number = Number(row.number);
    if (!Number.isInteger(number) || number <= 0) return null;
    const state = mapPrState(row.state);
    // Only open PRs get a checks call; closed/merged ones would cost 30 calls for stale data.
    const checks = state === "open" ? await fetchChecks(exec, repoPath, number) : "none";
    return {
      number,
      title: String(row.title ?? ""),
      headRef: String(row.headRefName ?? ""),
      state,
      isDraft: row.isDraft === true,
      checks,
      url: String(row.url ?? ""),
    };
  });
  return { prs: prs.filter((p): p is PrStatus => p !== null), ghAvailable: true };
};

type CacheEntry = {
  result: GithubResult;
  key: string;
  fetchedAt: number;
  nextAt: number;
  interval: number;
};

export type GithubReader = {
  read(repoPath: string, options?: { force?: boolean }): Promise<GithubResult>;
};

export const createGithubReader = (deps: { exec: Exec; now?: () => Date }): GithubReader => {
  const now = () => (deps.now ? deps.now() : new Date()).getTime();
  const cache = new Map<string, CacheEntry>();
  const inflight = new Map<string, Promise<GithubResult>>();

  const refresh = async (repoPath: string): Promise<GithubResult> => {
    const result = await fetchGithub(deps.exec, repoPath);
    const at = now();
    const key = JSON.stringify(result);
    const previous = cache.get(repoPath);
    const interval =
      previous && previous.key === key
        ? Math.min(previous.interval * 2, GH_MAX_INTERVAL_MS)
        : GH_MIN_INTERVAL_MS;
    cache.set(repoPath, { result, key, fetchedAt: at, nextAt: at + interval, interval });
    return result;
  };

  return {
    read(repoPath, options = {}) {
      const entry = cache.get(repoPath);
      const at = now();
      if (entry) {
        const due = at >= entry.nextAt;
        const forcedAndAllowed =
          options.force === true && at >= entry.fetchedAt + GH_MIN_INTERVAL_MS;
        if (!due && !forcedAndAllowed) return Promise.resolve(entry.result);
      }
      const running = inflight.get(repoPath);
      if (running) return running;
      const promise = refresh(repoPath).finally(() => inflight.delete(repoPath));
      inflight.set(repoPath, promise);
      return promise;
    },
  };
};
