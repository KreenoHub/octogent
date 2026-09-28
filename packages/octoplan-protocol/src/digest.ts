// The plan digest Claude gets at session start and every few rounds (D16, D18, D32, D34).
// Pure: no fs. The bridge injects it; the web can preview it.
import { COVERAGE_DIMENSION_LABELS } from "./domain";
import type { PlanSnapshot } from "./events";
import type { Convention } from "./v2";

export const DIGEST_MAX_LINES = 60;
export const DIGEST_HEADING = "## Octoplan plan digest";

const idNumber = (id: string) => Number.parseInt(id.replace(/^\D+/, ""), 10) || 0;
const newestFirst = <T extends { id: string }>(items: readonly T[]) =>
  [...items].sort((a, b) => idNumber(b.id) - idNumber(a.id));
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Ids + titles + status for active and stale decisions, open gaps, parked assumptions,
 * coverage and conventions, newest first, capped at `maxLines` (D32). Returns "" when
 * the repo has no plan yet, so a first session gets no noise.
 */
export const buildPlanDigest = (
  snapshot: PlanSnapshot,
  conventions: readonly Convention[] = [],
  options: { maxLines?: number } = {},
): string => {
  const maxLines = Math.max(10, options.maxLines ?? DIGEST_MAX_LINES);
  const decisions = newestFirst(snapshot.decisions.filter((d) => d.status !== "superseded"));
  const gaps = newestFirst(snapshot.gaps.filter((g) => g.status === "open"));
  const parked = newestFirst(snapshot.parked.filter((p) => p.status === "parked"));
  const covered = snapshot.coverage.dimensions;
  if (
    decisions.length === 0 &&
    gaps.length === 0 &&
    parked.length === 0 &&
    conventions.length === 0 &&
    !snapshot.goal
  ) {
    return "";
  }

  const head = [
    DIGEST_HEADING,
    "",
    "Already settled in docs/plan. Don't re-ask these; build on them. `stale` means an answer it depended on changed, so re-check it. Read DECISIONS.md with Read when you need a decision's reasoning.",
  ];
  if (snapshot.goal) head.push("", `Goal: ${oneLine(snapshot.goal.title)}`);

  const sections: Array<{ title: string; lines: string[] }> = [
    {
      title: "Decisions",
      lines: decisions.map((d) => `- ${d.id} [${d.status}] ${oneLine(d.title)}`),
    },
    { title: "Open gaps", lines: gaps.map((g) => `- ${g.id} ${oneLine(g.title)}`) },
    {
      title: "Parked (proceeding on the assumption)",
      lines: parked.map((p) => `- ${p.id} ${oneLine(p.title)} → ${oneLine(p.assumption)}`),
    },
    {
      title: "Coverage",
      lines:
        covered.length > 0
          ? [covered.map((d) => `${COVERAGE_DIMENSION_LABELS[d.id]}: ${d.status}`).join(" · ")]
          : [],
    },
    {
      title: "Your conventions (all repos)",
      lines: newestFirst(conventions).map((c) => `- ${c.id} ${oneLine(c.title)}`),
    },
  ].filter((section) => section.lines.length > 0);

  // Budget: headings cost 2 lines each; items are dropped from the longest lists first.
  const fixed = head.length + sections.length * 2;
  let budget = maxLines - fixed;
  const kept = sections.map(() => 0);
  let progress = true;
  while (budget > 0 && progress) {
    progress = false;
    for (let i = 0; i < sections.length && budget > 0; i += 1) {
      const section = sections[i];
      const count = kept[i] ?? 0;
      if (section && count < section.lines.length) {
        kept[i] = count + 1;
        budget -= 1;
        progress = true;
      }
    }
  }

  const out = [...head];
  sections.forEach((section, i) => {
    const count = kept[i] ?? 0;
    if (count === 0) return;
    const dropped = section.lines.length - count;
    const lines = section.lines.slice(0, count);
    if (dropped > 0 && lines.length > 0) {
      // Replace the last kept line with the overflow note so the cap holds exactly.
      lines[lines.length - 1] = `- …and ${dropped + 1} more in docs/plan`;
    }
    out.push("", `${section.title}:`, ...lines);
  });
  return out.slice(0, maxLines).join("\n");
};
