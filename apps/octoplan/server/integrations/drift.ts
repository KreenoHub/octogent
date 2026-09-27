// D26: where each active decision stands in the code, from the D-ids cited in commits and
// stamped on todos. diverged (a pending/accepted harvest candidate contradicts it) beats
// implemented (a stamped todo is ticked, or a citing commit is on main) beats untouched.
import type { Decision, DecisionDrift, HarvestCandidate } from "@octogent/octoplan-protocol";
import { parseForEachRef, pickBase } from "./gitGraph";
import { splitStamp } from "./octogentExport";
import { readTentacles } from "./tentacles";
import type { Exec } from "./types";
import { resolveWorkspace } from "./workspace";

export const DRIFT_LOG_LIMIT = 500;
const BASE_REV_LIMIT = 5000;
const MAX_EVIDENCE = 5;
const FIELD = "\x1f";
const RECORD = "\x1e";

export type CitingCommit = { sha: string; subject: string; ids: Set<string> };

export const parseCitingLog = (stdout: string): CitingCommit[] =>
  stdout
    .split(RECORD)
    .map((record) => record.replace(/^\s+/, ""))
    .filter((record) => record.length > 0)
    .flatMap((record) => {
      const [sha = "", subject = "", body = ""] = record.split(FIELD);
      if (!/^[0-9a-f]{7,64}$/i.test(sha.trim())) return [];
      const ids = new Set(`${subject}\n${body}`.match(/\bD\d+\b/g) ?? []);
      return ids.size > 0 ? [{ sha: sha.trim(), subject: subject.trim(), ids }] : [];
    });

const clip = (text: string, max = 60) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export const computeDrift = async (
  exec: Exec,
  repoPath: string,
  decisions: readonly Decision[],
  harvest: readonly HarvestCandidate[],
): Promise<DecisionDrift[]> => {
  const active = decisions.filter((d) => d.status === "active");
  if (active.length === 0) return [];

  const log = await exec(
    "git",
    ["log", "--all", `--max-count=${DRIFT_LOG_LIMIT}`, "--format=%H%x1f%s%x1f%b%x1e"],
    repoPath,
  );
  const commits = log.code === 0 ? parseCitingLog(log.stdout) : [];

  // Commits reachable from main count as merged.
  const onMain = new Set<string>();
  if (commits.length > 0) {
    const refsOut = await exec(
      "git",
      ["for-each-ref", "--format=%(refname)%1f%(objectname)", "refs/heads", "refs/remotes"],
      repoPath,
    );
    const refs = refsOut.code === 0 ? parseForEachRef(refsOut.stdout) : [];
    const base = refs.length > 0 ? await pickBase(exec, repoPath, refs) : undefined;
    if (base) {
      const revs = await exec(
        "git",
        ["rev-list", `--max-count=${BASE_REV_LIMIT}`, base.refname],
        repoPath,
      );
      if (revs.code === 0) {
        for (const sha of revs.stdout.split(/\r?\n/)) if (sha.trim()) onMain.add(sha.trim());
      }
    }
  }

  const workspace = await resolveWorkspace(exec, repoPath);
  const tentacles = await readTentacles(workspace);
  const contradicting = harvest.filter((h) => h.status === "pending" || h.status === "accepted");

  return active.map((decision): DecisionDrift => {
    const id = decision.id;
    const diverged = contradicting.filter((h) => h.contradicts.includes(id)).map((h) => h.id);
    const ticked = tentacles
      .filter((t) => t.done.some((line) => splitStamp(line).ids.includes(id)))
      .map((t) => `todo ticked in ${t.id}`);
    const citing = commits.filter((c) => c.ids.has(id));
    const merged = citing.filter((c) => onMain.has(c.sha));
    const unmerged = citing.filter((c) => !onMain.has(c.sha));
    const commitLine = (c: CitingCommit, suffix = "") =>
      `${c.sha.slice(0, 7)} ${clip(c.subject)}${suffix}`;

    const status =
      diverged.length > 0
        ? "diverged"
        : ticked.length > 0 || merged.length > 0
          ? "implemented"
          : "untouched";
    const evidence = [
      ...diverged,
      ...ticked,
      ...merged.map((c) => commitLine(c)),
      ...unmerged.map((c) => commitLine(c, " (not merged)")),
    ].slice(0, MAX_EVIDENCE);
    return { decisionId: id, status, evidence };
  });
};
