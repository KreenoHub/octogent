import { z } from "zod";
import {
  answerSchema,
  coverageStateSchema,
  decisionSchema,
  gapSchema,
  goalDocSchema,
  ideaSchema,
  messageBlockSchema,
  modeIdSchema,
  parkedItemSchema,
  questionRoundSchema,
  riskSchema,
  sessionSchema,
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
  z.object({ type: z.literal("capture-idea"), repoPath: z.string(), title: z.string().min(1) }),
]);
export type ClientEvent = z.infer<typeof clientEventSchema>;

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
