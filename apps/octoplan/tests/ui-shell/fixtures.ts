import type {
  Answer,
  Decision,
  GitGraph,
  HarvestCandidate,
  Idea,
  MessageBlock,
  Overview,
  PlanSnapshot,
  QuestionRound,
  Session,
  SessionLogSummary,
  Stage,
  TentacleSummary,
} from "@octogent/octoplan-protocol";

export const session = (overrides: Partial<Session> = {}): Session => ({
  id: "s1",
  title: "Plan Octoplan",
  mode: "deep-interview",
  repoPath: "C:\\repos\\alpha",
  status: "running",
  startedAt: "2026-09-25T10:00:00Z",
  ...overrides,
});

export const round = (overrides: Partial<QuestionRound> = {}): QuestionRound => ({
  id: "r1",
  sessionId: "s1",
  index: 1,
  askedAt: "2026-09-25T10:01:00Z",
  questions: [
    {
      id: "Q1",
      question: "Who is the primary user?",
      header: "Users",
      multiSelect: false,
      options: [
        { label: "Solo dev", description: "Just me" },
        { label: "Team", description: "A small team" },
      ],
      dimension: "users",
    },
    {
      id: "Q2",
      question: "What is out of scope?",
      header: "Scope",
      multiSelect: true,
      options: [
        { label: "Mobile", description: "No phone UI" },
        { label: "Cloud", description: "No hosting" },
      ],
      dimension: "scope",
    },
  ],
  ...overrides,
});

export const answer = (questionId: string, overrides: Partial<Answer> = {}): Answer => ({
  questionId,
  selected: ["Solo dev"],
  modifier: "none",
  answeredAt: "2026-09-25T10:02:00Z",
  ...overrides,
});

export const sectionBlock = (id: string, heading: string, lines: number): MessageBlock => ({
  kind: "section",
  id,
  heading,
  markdown: Array.from({ length: lines }, (_, i) => `line ${i + 1} of ${heading}`).join("\n"),
  at: "2026-09-25T10:00:30Z",
});

export const decision = (overrides: Partial<Decision> = {}): Decision => ({
  id: "D1",
  title: "Cockpit by default",
  date: "2026-09-25",
  status: "active",
  source: "interview",
  questionIds: [],
  dependsOn: [],
  body: "",
  ...overrides,
});

export const plan = (overrides: Partial<PlanSnapshot> = {}): PlanSnapshot => ({
  decisions: [],
  gaps: [],
  risks: [],
  parked: [],
  ideas: [],
  coverage: { dimensions: [] },
  goal: null,
  ...overrides,
});

export const idea = (overrides: Partial<Idea> = {}): Idea => ({
  id: "I1",
  title: "Offline mode",
  date: "2026-09-26",
  tags: [],
  status: "inbox",
  body: "",
  ...overrides,
});

export const stage = (overrides: Partial<Stage> = {}): Stage => ({
  index: 1,
  title: "Skeleton",
  goal: "App boots with an empty cockpit",
  prompt: "Build the skeleton, then stop at the checkpoint.",
  ...overrides,
});

export const graph = (overrides: Partial<GitGraph> = {}): GitGraph => ({
  repoPath: "C:\\repos\\alpha",
  commits: [{ hash: "abc", parents: [], refs: ["main"], subject: "init", time: 1, lane: 0 }],
  branches: [],
  prs: [],
  lanes: [],
  conversationBranches: [],
  ghAvailable: false,
  ...overrides,
});

// ---------- v2 ----------

export const toolBlock = (id: string, name: string, summary = name): MessageBlock => ({
  kind: "tool",
  id,
  name,
  summary,
  at: "2026-09-25T10:00:40Z",
});

export const harvest = (overrides: Partial<HarvestCandidate> = {}): HarvestCandidate => ({
  id: "H1",
  title: "Use pnpm workspaces",
  date: "2026-09-26",
  source: "abc1234def",
  sourceKind: "commit",
  status: "pending",
  contradicts: [],
  body: "Seen in feat: workspace split",
  ...overrides,
});

export const sessionLog = (overrides: Partial<SessionLogSummary> = {}): SessionLogSummary => ({
  file: "2026-09-25-plan-octoplan.md",
  title: "Plan Octoplan",
  mode: "deep-interview",
  startedAt: "2026-09-25T10:00:00Z",
  summary: "Settled the cockpit layout.",
  answers: 12,
  parked: 1,
  tentative: 2,
  revisions: 0,
  ...overrides,
});

export const tentacle = (overrides: Partial<TentacleSummary> = {}): TentacleSummary => ({
  tentacleId: "ui-shell",
  name: "Octoplan UI Shell",
  description: "The cockpit",
  done: 3,
  total: 8,
  branches: [],
  ahead: 0,
  behind: 0,
  ...overrides,
});

export const overview = (overrides: Partial<Overview> = {}): Overview => ({
  repoPath: "C:\\repos\\alpha",
  workspace: "C:\\repos\\alpha",
  tentacles: [tentacle(), tentacle({ tentacleId: "qcards", name: "QCards", done: 2, total: 4 })],
  drift: [],
  history: [],
  ...overrides,
});

/** A repo aggregate as the store sends it: every v2 board source filled once. */
export const aggregatePlan = (overrides: Partial<PlanSnapshot> = {}): PlanSnapshot =>
  plan({
    decisions: [
      decision({ id: "D1", title: "Cockpit by default" }),
      decision({ id: "D2", title: "Dark only", status: "stale" }),
      decision({ id: "D3", title: "Keyboard first" }),
    ],
    risks: [
      {
        id: "R1",
        title: "Solo dev only",
        likelihood: "medium",
        impact: "medium",
        origin: "Q1 tentative",
        status: "open",
        body: "",
      },
      {
        id: "R2",
        title: "SDK churn",
        likelihood: "medium",
        impact: "high",
        origin: "Q4",
        status: "open",
        body: "",
      },
    ],
    ideas: [idea(), idea({ id: "I2", title: "Voice answers", status: "starred" })],
    harvest: [harvest(), harvest({ id: "H2", title: "Old one", status: "accepted" })],
    sessionLogs: [
      sessionLog(),
      sessionLog({
        file: "2026-09-26-pricing.md",
        title: "Pricing",
        mode: "quick-align",
        startedAt: "2026-09-26T09:00:00Z",
      }),
    ],
    goal: { title: "Alpha", why: "", goals: ["Ship v2"], nonGoals: [], done: [] },
    ...overrides,
  });
