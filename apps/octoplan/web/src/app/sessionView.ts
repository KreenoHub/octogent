import {
  type CoverageState,
  type ModeId,
  type Session,
  coverageDimensionIdSchema,
} from "@octogent/octoplan-protocol";
import type { RoundEntry } from "./planClientReducer";

export const MODE_LABELS: Record<ModeId, string> = {
  "deep-interview": "Deep interview",
  "quick-align": "Quick align",
  brainstorm: "Brainstorm",
  "devils-advocate": "Devil's advocate",
};

/** Trims and strips the quotes Windows "Copy as path" wraps around a folder. */
export const normalizeRepoPath = (raw: string): string => {
  const trimmed = raw.trim();
  const unquoted = /^"(.*)"$/.exec(trimmed)?.[1] ?? trimmed;
  return unquoted.trim();
};

export type StatusDot = "running" | "waiting-for-answer" | "idle" | "ended" | "error";

export const statusDot = (status: Session["status"]): StatusDot =>
  status === "starting" ? "running" : status;

export type RepoGroup = { repoPath: string; name: string; sessions: Session[] };

export const repoName = (repoPath: string): string =>
  repoPath.split(/[\\/]/).filter(Boolean).at(-1) ?? repoPath;

/** Windows paths differ only in case or a trailing slash for the same folder. */
export const sameRepo = (a: string | null | undefined, b: string | null | undefined): boolean =>
  !!a && !!b && a.replace(/[\\/]+$/, "").toLowerCase() === b.replace(/[\\/]+$/, "").toLowerCase();

/**
 * Sessions grouped by repo, repos in first-seen order, newest session first within a repo;
 * then repos that only have a plan (an import still waiting for review has no session yet,
 * and must stay reachable from the sidebar too).
 */
export const groupSessionsByRepo = (
  sessions: Session[],
  planRepos: readonly string[] = [],
): RepoGroup[] => {
  const groups = new Map<string, Session[]>();
  for (const session of sessions) {
    const list = groups.get(session.repoPath) ?? [];
    list.push(session);
    groups.set(session.repoPath, list);
  }
  const withSessions = [...groups].map(([repoPath, list]) => ({
    repoPath,
    name: repoName(repoPath),
    sessions: list.slice().sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
  }));
  const planOnly = planRepos
    .filter((repoPath) => !withSessions.some((group) => sameRepo(group.repoPath, repoPath)))
    .map((repoPath) => ({ repoPath, name: repoName(repoPath), sessions: [] }));
  return [...withSessions, ...planOnly];
};

export const SECTION_COLLAPSE_LINES = 12;

export const isLongSection = (markdown: string): boolean =>
  markdown.split("\n").length > SECTION_COLLAPSE_LINES;

export const firstLine = (markdown: string): string =>
  markdown.split("\n").find((line) => line.trim() !== "") ?? "";

export const ALL_DIMENSIONS = coverageDimensionIdSchema.options;

/** Share (0..1) of the 12 dimensions marked covered. */
export const coverageShare = (coverage: CoverageState | undefined): number => {
  if (!coverage) return 0;
  const covered = new Set(
    coverage.dimensions.filter((d) => d.status === "covered").map((d) => d.id),
  );
  return covered.size / ALL_DIMENSIONS.length;
};

/** Focus-mode progress "n / ~m": m = answered questions + questions still pending. */
export const focusProgress = (
  answered: RoundEntry[],
  pending: RoundEntry[],
  currentIndex: number,
): { n: number; m: number } => {
  const answeredCount = answered.reduce((sum, entry) => sum + entry.round.questions.length, 0);
  const pendingCount = pending.reduce((sum, entry) => sum + entry.round.questions.length, 0);
  return { n: answeredCount + currentIndex + 1, m: answeredCount + pendingCount };
};
