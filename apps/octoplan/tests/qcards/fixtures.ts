import type { Answer, QuestionRound } from "@octogent/octoplan-protocol";

export const FIXED_NOW = "2026-09-25T12:00:00.000Z";

export const fourQuestionRound: QuestionRound = {
  id: "round-1",
  sessionId: "s1",
  index: 0,
  askedAt: "2026-09-25T11:59:00.000Z",
  questions: [
    {
      id: "Q1",
      question: "How should users sign in?",
      header: "Auth",
      multiSelect: false,
      dimension: "architecture",
      options: [
        { label: "Magic link (Recommended)", description: "Email a one-time link." },
        { label: "Password", description: "Classic email and password." },
        { label: "OAuth", description: "GitHub or Google." },
      ],
    },
    {
      id: "Q2",
      question: "Which platforms ship in v1?",
      header: "Platforms",
      multiSelect: true,
      options: [
        { label: "Web", description: "Browser app." },
        { label: "iOS", description: "Native iPhone app." },
        { label: "Android", description: "Native Android app." },
      ],
    },
    {
      id: "Q3",
      question: "Which layout for the dashboard?",
      header: "Layout",
      multiSelect: false,
      dimension: "ux",
      options: [
        {
          label: "Sidebar",
          description: "Nav on the left.",
          preview: "+---+------+\n|nav| main |\n+---+------+",
        },
        {
          label: "Top bar",
          description: "Nav on top.",
          preview: "+----------+\n|   nav    |\n+----------+",
        },
      ],
    },
    {
      id: "Q4",
      question: "Which database?",
      header: "Data",
      multiSelect: false,
      options: [
        { label: "Postgres (Recommended)", description: "Relational and solid." },
        { label: "SQLite", description: "One file." },
      ],
    },
  ],
};

export const singleQuestionRound = (questionIndex: number): QuestionRound => {
  const question = fourQuestionRound.questions[questionIndex];
  if (!question) {
    throw new Error(`no fixture question at ${questionIndex}`);
  }
  return { ...fourQuestionRound, id: `round-${question.id}`, questions: [question] };
};

export const makeAnswer = (overrides: Partial<Answer> & Pick<Answer, "questionId">): Answer => ({
  selected: [],
  modifier: "none",
  answeredAt: FIXED_NOW,
  ...overrides,
});
