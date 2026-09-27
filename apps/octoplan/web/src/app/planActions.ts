// Pure helpers for the wave-2 dialogs: idea capture, tentacle export and branch naming.
import type { GoalDoc } from "@octogent/octoplan-protocol";
import { repoName } from "./sessionView";

/** "a, b ,, c" -> ["a", "b", "c"]; duplicates dropped, order kept. */
export const parseTags = (raw: string): string[] => [
  ...new Set(
    raw
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
  ),
];

/** Same rule as the protocol's `export-tentacle.tentacleId`. */
export const TENTACLE_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

export const tentacleIdError = (id: string): string | null => {
  if (!id) return "Tentacle id is required";
  if (!TENTACLE_ID_RE.test(id)) return "Use lowercase letters, digits and dashes (no leading dash)";
  return null;
};

/** A valid default id from the repo folder name ("C:\\repos\\My App" -> "my-app"). */
export const defaultTentacleId = (repoPath: string): string =>
  repoName(repoPath)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** GOAL.md definition-of-done items, one task per line. */
export const tasksFromGoal = (goal: GoalDoc | null | undefined): string =>
  (goal?.done ?? []).map((item) => item.text).join("\n");

/** One task per non-empty line, trimmed and stripped of a leading "- [ ]" or "-". */
export const parseTasks = (raw: string): string[] =>
  raw
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/^-\s*\[[ xX]?\]\s*/, "")
        .replace(/^[-*]\s+/, "")
        .trim(),
    )
    .filter(Boolean);
