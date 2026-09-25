import { z } from "zod";

// Stable IDs are prefix + integer (D12, Q3, ...) so humans can cite them in markdown and chat.
export const ID_PREFIX = {
  question: "Q",
  decision: "D",
  gap: "G",
  risk: "R",
  parked: "P",
  idea: "I",
  done: "DOD",
  branch: "B",
} as const;

export type IdKind = keyof typeof ID_PREFIX;

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const modeIdSchema = z.enum([
  "deep-interview",
  "quick-align",
  "brainstorm",
  "devils-advocate",
]);
export type ModeId = z.infer<typeof modeIdSchema>;

export const coverageDimensionIdSchema = z.enum([
  "problem",
  "users",
  "scope",
  "flows",
  "data",
  "architecture",
  "integrations",
  "ux",
  "risks",
  "success",
  "ops",
  "timeline",
]);
export type CoverageDimensionId = z.infer<typeof coverageDimensionIdSchema>;

export const COVERAGE_DIMENSION_LABELS: Record<CoverageDimensionId, string> = {
  problem: "Problem & why",
  users: "Users",
  scope: "Scope & non-goals",
  flows: "Core flows",
  data: "Data",
  architecture: "Architecture & stack",
  integrations: "Integrations",
  ux: "UX",
  risks: "Risks",
  success: "Success metrics & DoD",
  ops: "Ops & deploy",
  timeline: "Timeline & budget",
};

export const coverageStatusSchema = z.enum(["unknown", "partial", "covered"]);
export type CoverageStatus = z.infer<typeof coverageStatusSchema>;

export const confidenceSchema = z.enum(["low", "medium", "high"]);
export type Confidence = z.infer<typeof confidenceSchema>;

export const coverageDimensionSchema = z.object({
  id: coverageDimensionIdSchema,
  status: coverageStatusSchema,
  confidence: confidenceSchema,
  questionIds: z.array(z.string()),
  note: z.string(),
});
export type CoverageDimension = z.infer<typeof coverageDimensionSchema>;

export const coverageStateSchema = z.object({
  dimensions: z.array(coverageDimensionSchema),
});
export type CoverageState = z.infer<typeof coverageStateSchema>;

// Mirrors Claude Code's AskUserQuestion tool input so rounds pass through untouched.
export const questionOptionSchema = z.object({
  label: z.string().min(1),
  description: z.string(),
  preview: z.string().optional(),
});
export type QuestionOption = z.infer<typeof questionOptionSchema>;

export const questionSchema = z.object({
  id: z.string(),
  question: z.string().min(1),
  header: z.string(),
  multiSelect: z.boolean(),
  options: z.array(questionOptionSchema).min(2).max(4),
  dimension: coverageDimensionIdSchema.optional(),
});
export type Question = z.infer<typeof questionSchema>;

export const questionRoundSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  index: z.number().int().nonnegative(),
  questions: z.array(questionSchema).min(1).max(4),
  askedAt: z.string(),
});
export type QuestionRound = z.infer<typeof questionRoundSchema>;

export const answerModifierSchema = z.enum(["none", "tentative", "parked"]);
export type AnswerModifier = z.infer<typeof answerModifierSchema>;

export const answerSchema = z.object({
  questionId: z.string(),
  // Selected option labels; free text from "Other" is stored as-is.
  selected: z.array(z.string()),
  otherText: z.string().optional(),
  modifier: answerModifierSchema,
  assumption: z.string().optional(),
  revisionOf: z.string().optional(),
  answeredAt: z.string(),
});
export type Answer = z.infer<typeof answerSchema>;

export const decisionStatusSchema = z.enum(["active", "stale", "superseded"]);
export const decisionSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  date: isoDate,
  status: decisionStatusSchema,
  source: z.string(),
  questionIds: z.array(z.string()),
  dependsOn: z.array(z.string()),
  body: z.string(),
});
export type Decision = z.infer<typeof decisionSchema>;

export const gapSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  dimension: coverageDimensionIdSchema.optional(),
  status: z.enum(["open", "closed"]),
  body: z.string(),
});
export type Gap = z.infer<typeof gapSchema>;

export const riskSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  likelihood: confidenceSchema,
  impact: confidenceSchema,
  origin: z.string(),
  status: z.enum(["open", "mitigated", "accepted"]),
  body: z.string(),
});
export type Risk = z.infer<typeof riskSchema>;

export const parkedItemSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  questionId: z.string().optional(),
  assumption: z.string(),
  date: isoDate,
  status: z.enum(["parked", "resolved"]),
  body: z.string(),
});
export type ParkedItem = z.infer<typeof parkedItemSchema>;

export const ideaSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  date: isoDate,
  tags: z.array(z.string()),
  status: z.enum(["inbox", "starred", "merged", "killed", "adopted"]),
  body: z.string(),
});
export type Idea = z.infer<typeof ideaSchema>;

export const doneCriterionSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  status: coverageStatusSchema,
  evidence: z.string(),
});
export type DoneCriterion = z.infer<typeof doneCriterionSchema>;

export const goalDocSchema = z.object({
  title: z.string().min(1),
  why: z.string(),
  goals: z.array(z.string()),
  nonGoals: z.array(z.string()),
  done: z.array(doneCriterionSchema),
});
export type GoalDoc = z.infer<typeof goalDocSchema>;

export const stageSchema = z.object({
  index: z.number().int().positive(),
  title: z.string().min(1),
  goal: z.string(),
  prompt: z.string(),
});
export type Stage = z.infer<typeof stageSchema>;

export const conversationBranchSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  sessionId: z.string(),
  parentSessionId: z.string(),
  forkedFromBlockId: z.string().optional(),
  gitBranch: z.string().optional(),
  status: z.enum(["exploring", "merged", "abandoned"]),
  body: z.string(),
});
export type ConversationBranch = z.infer<typeof conversationBranchSchema>;

export const gitBranchNodeSchema = z.object({
  name: z.string(),
  head: z.string(),
  isRemote: z.boolean(),
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  tentacleId: z.string().optional(),
});
export type GitBranchNode = z.infer<typeof gitBranchNodeSchema>;

export const prStatusSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  headRef: z.string(),
  state: z.enum(["open", "closed", "merged"]),
  isDraft: z.boolean(),
  checks: z.enum(["pending", "passing", "failing", "none"]),
  url: z.string(),
});
export type PrStatus = z.infer<typeof prStatusSchema>;

export const tentacleLaneSchema = z.object({
  tentacleId: z.string(),
  branches: z.array(z.string()),
});
export type TentacleLane = z.infer<typeof tentacleLaneSchema>;

export const sessionSchema = z.object({
  id: z.string(),
  // Claude Code session id; absent until the SDK reports its init message.
  claudeSessionId: z.string().optional(),
  title: z.string(),
  mode: modeIdSchema,
  repoPath: z.string(),
  status: z.enum(["starting", "running", "waiting-for-answer", "idle", "ended", "error"]),
  startedAt: z.string(),
  parentSessionId: z.string().optional(),
});
export type Session = z.infer<typeof sessionSchema>;

// One visible unit in the conversation stream. Claude replies are split into
// sections so each can be collapsed, pinned or turned into a task/decision.
export const messageBlockSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("user"),
    id: z.string(),
    text: z.string(),
    at: z.string(),
  }),
  z.object({
    kind: z.literal("section"),
    id: z.string(),
    heading: z.string(),
    markdown: z.string(),
    at: z.string(),
  }),
  z.object({
    kind: z.literal("tool"),
    id: z.string(),
    name: z.string(),
    summary: z.string(),
    at: z.string(),
  }),
  z.object({
    kind: z.literal("question-round"),
    id: z.string(),
    roundId: z.string(),
    at: z.string(),
  }),
]);
export type MessageBlock = z.infer<typeof messageBlockSchema>;
