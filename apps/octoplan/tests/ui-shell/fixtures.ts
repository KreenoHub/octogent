import type {
  Answer,
  Decision,
  MessageBlock,
  PlanSnapshot,
  QuestionRound,
  Session,
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
  index: 0,
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
