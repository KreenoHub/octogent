// Layout of docs/plan/ inside a target repo. Markdown here is the source of truth;
// anything Octoplan keeps in memory must be rebuildable from these files.
export const PLAN_DIR = "docs/plan";

export const PLAN_FILES = {
  decisions: {
    path: "DECISIONS.md",
    preamble: "# Decisions\n\nD-numbered decision log. Newest last.",
  },
  parked: {
    path: "PARKED.md",
    preamble: "# Parked\n\nQuestions answered later. Claude proceeded on the stated assumption.",
  },
  ideas: {
    path: "IDEAS.md",
    preamble: "# Idea inbox\n\nCaptured ideas, waiting for a brainstorm.",
  },
  gaps: { path: "GAPS.md", preamble: "# Gaps\n\nThings the plan does not answer yet." },
  risks: { path: "RISKS.md", preamble: "# Risks\n\nIncludes every answer marked tentative." },
  coverage: {
    path: "COVERAGE.md",
    preamble: "# Coverage\n\nPlanning dimensions and how well the conversation has covered them.",
  },
  branches: {
    path: "branches.md",
    preamble:
      "# Conversation branches\n\nExplorations forked from a session, and the git branch that implemented each.",
  },
  goal: { path: "GOAL.md", preamble: "" },
} as const;

export type PlanFileKey = keyof typeof PLAN_FILES;

export const SESSIONS_DIR = "sessions";
export const STAGES_DIR = "stages";

export const sessionFileName = (date: string, slug: string) => `${date}-${slugify(slug)}.md`;
export const stageFileName = (index: number) => `STAGE-${index}.md`;

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "session";
