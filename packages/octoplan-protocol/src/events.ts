import { z } from "zod";
import {
  answerSchema,
  coverageStateSchema,
  decisionSchema,
  gapSchema,
  gitGraphSchema,
  goalDocSchema,
  ideaActionSchema,
  ideaSchema,
  ideaSearchResultSchema,
  messageBlockSchema,
  modeIdSchema,
  parkedItemSchema,
  questionRoundSchema,
  riskSchema,
  sessionSchema,
  stageSchema,
} from "./domain";

export const PROTOCOL_VERSION = 1;

export const planSnapshotSchema = z.object({
  decisions: z.array(decisionSchema),
  gaps: z.array(gapSchema),
  risks: z.array(riskSchema),
  parked: z.array(parkedItemSchema),
  ideas: z.array(ideaSchema),
  coverage: coverageStateSchema,
  goal: goalDocSchema.nullable(),
});
export type PlanSnapshot = z.infer<typeof planSnapshotSchema>;

export const serverEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello"), protocolVersion: z.number(), serverVersion: z.string() }),
  z.object({ type: z.literal("sessions"), sessions: z.array(sessionSchema) }),
  z.object({ type: z.literal("session-updated"), session: sessionSchema }),
  z.object({ type: z.literal("block"), sessionId: z.string(), block: messageBlockSchema }),
  z.object({ type: z.literal("question-round"), round: questionRoundSchema }),
  z.object({
    type: z.literal("round-answered"),
    sessionId: z.string(),
    roundId: z.string(),
    answers: z.array(answerSchema),
  }),
  z.object({ type: z.literal("plan"), repoPath: z.string(), plan: planSnapshotSchema }),
  z.object({ type: z.literal("error"), message: z.string(), sessionId: z.string().optional() }),
  // Wave 2
  /** Short confirmation for a toast ("Captured I4", "Exported 5 tasks to tentacle x"). */
  z.object({ type: z.literal("notice"), message: z.string(), sessionId: z.string().optional() }),
  z.object({
    type: z.literal("ideas"),
    query: z.string(),
    results: z.array(ideaSearchResultSchema),
  }),
  z.object({ type: z.literal("stages"), repoPath: z.string(), stages: z.array(stageSchema) }),
  z.object({
    type: z.literal("export-result"),
    repoPath: z.string(),
    tentacleId: z.string(),
    ok: z.boolean(),
    message: z.string(),
  }),
  z.object({ type: z.literal("graph"), graph: gitGraphSchema }),
]);
export type ServerEvent = z.infer<typeof serverEventSchema>;

export const clientEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello"), protocolVersion: z.number() }),
  z.object({
    type: z.literal("start-session"),
    repoPath: z.string().min(1),
    mode: modeIdSchema,
    topic: z.string(),
  }),
  z.object({ type: z.literal("send-message"), sessionId: z.string(), text: z.string().min(1) }),
  z.object({
    type: z.literal("answer-round"),
    sessionId: z.string(),
    roundId: z.string(),
    answers: z.array(answerSchema).min(1),
  }),
  z.object({
    type: z.literal("revise-answer"),
    sessionId: z.string(),
    answer: answerSchema,
  }),
  z.object({ type: z.literal("stop-session"), sessionId: z.string() }),
  z.object({
    type: z.literal("capture-idea"),
    repoPath: z.string(),
    title: z.string().min(1),
    tags: z.array(z.string()).optional(),
  }),
  // Wave 2
  /** Fork a session (Agent SDK resume + forkSession) to explore an alternative. */
  z.object({
    type: z.literal("branch-session"),
    sessionId: z.string(),
    title: z.string().min(1),
    fromBlockId: z.string().optional(),
  }),
  /** Brainstorm: ask Claude to turn starred ideas into decisions. */
  z.object({ type: z.literal("converge"), sessionId: z.string() }),
  z.object({ type: z.literal("search-ideas"), query: z.string() }),
  z.object({
    type: z.literal("update-idea"),
    repoPath: z.string(),
    ideaId: z.string(),
    action: ideaActionSchema,
    /** For "merge": the idea this one merges into. */
    intoId: z.string().optional(),
  }),
  z.object({ type: z.literal("generate-stages"), repoPath: z.string() }),
  z.object({
    type: z.literal("export-tentacle"),
    repoPath: z.string(),
    tentacleId: z
      .string()
      .min(1)
      .regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase letters, digits and dashes"),
    tasks: z.array(z.string().min(1)),
  }),
  z.object({ type: z.literal("request-graph"), repoPath: z.string() }),
  z.object({
    type: z.literal("link-branch"),
    repoPath: z.string(),
    branchId: z.string(),
    gitBranch: z.string().min(1),
  }),
]);
export type ClientEvent = z.infer<typeof clientEventSchema>;

// Pop-out terminal: a separate socket per session so raw keystrokes never mix with planning events.
export const terminalPath = (sessionId: string) => `/ws/terminal/${encodeURIComponent(sessionId)}`;
export const TERMINAL_PATH_RE = /^\/ws\/terminal\/([^/]+)$/;

export const terminalClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("input"), data: z.string() }),
  z.object({
    type: z.literal("resize"),
    cols: z.number().int().min(10).max(500),
    rows: z.number().int().min(5).max(300),
  }),
]);
export type TerminalClientMessage = z.infer<typeof terminalClientMessageSchema>;

export const terminalServerMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("output"), data: z.string() }),
  z.object({ type: z.literal("exit"), code: z.number().int().nullable() }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type TerminalServerMessage = z.infer<typeof terminalServerMessageSchema>;

export const parseServerEvent = (raw: string): ServerEvent | null => {
  const result = serverEventSchema.safeParse(safeJson(raw));
  return result.success ? result.data : null;
};

export const parseClientEvent = (raw: string): ClientEvent | null => {
  const result = clientEventSchema.safeParse(safeJson(raw));
  return result.success ? result.data : null;
};

const safeJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};
