import { randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import { resolve } from "node:path";
import type { Options, PermissionResult, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  type Answer,
  type MessageBlock,
  type ModeId,
  type Question,
  type QuestionRound,
  type ServerEvent,
  type Session,
  coverageDimensionIdSchema,
  encodeAnswerText,
  encodeAnswersForTool,
  encodeRevisionTurn,
  questionRoundSchema,
} from "@octogent/octoplan-protocol";
import { applyAnsweredQuestions } from "../modes";
import type { ModeDefinition } from "../modes/types";
import type { PlanStore } from "../store/types";
import { splitSections, summarizeToolUse } from "./blocks";
import { type InputQueue, createInputQueue } from "./inputQueue";
import { PLAN_SERVER_NAME, createPlanToolsServer } from "./planTools";
import { PLANNING_BUILTIN_TOOLS, PLANNING_DENY_MESSAGE, isToolAllowed } from "./toolPolicy";
import type { BridgeDeps, Broadcast } from "./types";

type PendingRound = { input: Record<string, unknown>; settle: (result: PermissionResult) => void };

type LiveSession = {
  session: Session;
  mode: ModeDefinition;
  store: PlanStore;
  input: InputQueue | null;
  abort: AbortController | null;
  blocks: MessageBlock[];
  rounds: QuestionRound[];
  answers: Map<string, Answer[]>;
  pending: Map<string, PendingRound>;
  questionCount: number;
  blockCount: number;
};

export const INVALID_ROUND_MESSAGE =
  "Octoplan shows 1–4 questions per round, each with a question, a header and 2–4 options that have a label and a description. Ask again in that shape.";

const str = (value: unknown) => (typeof value === "string" ? value : "");
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export type SessionManager = ReturnType<typeof createSessionManager>;

export const createSessionManager = (deps: BridgeDeps, broadcast: Broadcast) => {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? randomUUID;
  const sessions = new Map<string, LiveSession>();
  const stores = new Map<string, PlanStore>();

  const reportError = (message: string, sessionId?: string) =>
    broadcast({ type: "error", message, ...(sessionId ? { sessionId } : {}) });

  // One store per repo; its change events (own writes and hand edits) drive the plan board.
  const storeFor = (repoPath: string) => {
    const existing = stores.get(repoPath);
    if (existing) return existing;
    const store = deps.storeFor(repoPath);
    store.onChange((plan) => broadcast({ type: "plan", repoPath, plan }));
    stores.set(repoPath, store);
    return store;
  };

  const emitPlan = async (repoPath: string, store: PlanStore) => {
    try {
      broadcast({ type: "plan", repoPath, plan: await store.snapshot() });
    } catch (error) {
      reportError(`Could not read docs/plan: ${errorText(error)}`);
    }
  };

  const setStatus = (live: LiveSession, status: Session["status"]) => {
    if (live.session.status === status) return;
    live.session = { ...live.session, status };
    broadcast({ type: "session-updated", session: live.session });
  };

  const addBlock = (live: LiveSession, block: MessageBlock) => {
    live.blocks.push(block);
    broadcast({ type: "block", sessionId: live.session.id, block });
  };
  const blockId = (live: LiveSession) => `${live.session.id}-b${++live.blockCount}`;

  const toRound = (live: LiveSession, input: Record<string, unknown>): QuestionRound | null => {
    const raw = Array.isArray(input.questions)
      ? (input.questions as Record<string, unknown>[])
      : [];
    const questions: Question[] = raw.map((q, index) => {
      const header = str(q.header);
      const dimension = coverageDimensionIdSchema.safeParse(header.trim().toLowerCase());
      const options = Array.isArray(q.options) ? (q.options as Record<string, unknown>[]) : [];
      return {
        id: `Q${live.questionCount + index + 1}`,
        question: str(q.question),
        header,
        multiSelect: q.multiSelect === true,
        options: options.map((o) => ({
          label: str(o.label),
          description: str(o.description),
          ...(typeof o.preview === "string" ? { preview: o.preview } : {}),
        })),
        ...(dimension.success ? { dimension: dimension.data } : {}),
      };
    });
    const parsed = questionRoundSchema.safeParse({
      id: `${live.session.id}-r${live.rounds.length + 1}`,
      sessionId: live.session.id,
      index: live.rounds.length + 1,
      questions,
      askedAt: now().toISOString(),
    });
    if (!parsed.success) return null;
    live.questionCount += questions.length;
    return parsed.data;
  };

  const canUseToolFor =
    (live: LiveSession) =>
    async (
      toolName: string,
      input: Record<string, unknown>,
      { signal }: { signal: AbortSignal },
    ): Promise<PermissionResult> => {
      if (toolName === "AskUserQuestion") {
        const round = toRound(live, input);
        if (!round) return { behavior: "deny", message: INVALID_ROUND_MESSAGE };
        live.rounds.push(round);
        addBlock(live, {
          kind: "question-round",
          id: blockId(live),
          roundId: round.id,
          at: round.askedAt,
        });
        broadcast({ type: "question-round", round });
        setStatus(live, "waiting-for-answer");
        return new Promise<PermissionResult>((settleRound) => {
          const settle = (result: PermissionResult) => {
            if (!live.pending.has(round.id)) return;
            live.pending.delete(round.id);
            settleRound(result);
          };
          live.pending.set(round.id, { input, settle });
          signal.addEventListener(
            "abort",
            () =>
              settle({ behavior: "deny", message: "The session was stopped.", interrupt: true }),
            { once: true },
          );
        });
      }
      if (isToolAllowed(toolName, live.mode.allowedTools)) {
        return { behavior: "allow", updatedInput: input };
      }
      return { behavior: "deny", message: PLANNING_DENY_MESSAGE };
    };

  const handleMessage = async (live: LiveSession, message: SDKMessage) => {
    if (message.type === "system" && message.subtype === "init") {
      if (live.session.claudeSessionId !== message.session_id) {
        live.session = { ...live.session, claudeSessionId: message.session_id };
        broadcast({ type: "session-updated", session: live.session });
        await live.store
          .setClaudeSessionId(live.session.id, message.session_id)
          .catch((error) => reportError(errorText(error), live.session.id));
      }
      setStatus(live, "running");
      return;
    }
    if (message.type === "assistant") {
      const content = Array.isArray(message.message.content) ? message.message.content : [];
      for (const block of content) {
        if (block.type === "text") {
          for (const section of splitSections(block.text)) {
            addBlock(live, {
              kind: "section",
              id: blockId(live),
              heading: section.heading,
              markdown: section.markdown,
              at: now().toISOString(),
            });
          }
        } else if (block.type === "tool_use" && block.name !== "AskUserQuestion") {
          addBlock(live, {
            kind: "tool",
            id: blockId(live),
            name: block.name,
            summary: summarizeToolUse(block.name, block.input),
            at: now().toISOString(),
          });
        }
      }
      if (live.session.status !== "waiting-for-answer") setStatus(live, "running");
      return;
    }
    if (message.type === "result") {
      if (message.subtype !== "success") {
        reportError(`Claude stopped: ${message.subtype}`, live.session.id);
      }
      if (live.pending.size === 0) setStatus(live, "idle");
    }
  };

  const runQuery = (live: LiveSession, resumeId?: string): InputQueue => {
    const input = createInputQueue();
    const abort = new AbortController();
    live.input = input;
    live.abort = abort;
    const options: Options = {
      cwd: live.session.repoPath,
      systemPrompt: { type: "preset", preset: "claude_code", append: live.mode.systemPromptAppend },
      // Planning sessions see only read tools + AskUserQuestion; only the target repo's
      // project settings load, so user-level hooks can't intercept AskUserQuestion.
      tools: PLANNING_BUILTIN_TOOLS,
      settingSources: ["project"],
      permissionMode: "default",
      canUseTool: canUseToolFor(live),
      mcpServers: {
        [PLAN_SERVER_NAME]: createPlanToolsServer({
          store: live.store,
          applyCoverageUpdate: deps.applyCoverageUpdate,
          today: () => now().toISOString().slice(0, 10),
        }),
      },
      abortController: abort,
      ...(resumeId ? { resume: resumeId } : {}),
    };
    void (async () => {
      try {
        for await (const message of deps.query({ prompt: input.iterable, options })) {
          await handleMessage(live, message);
        }
        if (live.session.status !== "ended") setStatus(live, "idle");
      } catch (error) {
        if (abort.signal.aborted) return;
        setStatus(live, "error");
        reportError(`Claude session failed: ${errorText(error)}`, live.session.id);
      } finally {
        if (live.input === input) {
          live.input = null;
          live.abort = null;
        }
      }
    })();
    return input;
  };

  const liveInput = (live: LiveSession) => {
    if (live.input && !live.input.closed) return live.input;
    return runQuery(live, live.session.claudeSessionId);
  };

  const getLive = (sessionId: string) => {
    const live = sessions.get(sessionId);
    if (!live) reportError(`Unknown session ${sessionId}.`, sessionId);
    return live;
  };

  const syncCoverage = async (live: LiveSession, round: QuestionRound, answers: Answer[]) => {
    const answeredIds = new Set(
      answers.filter((a) => a.modifier !== "parked").map((a) => a.questionId),
    );
    const touched = round.questions.filter((q) => q.dimension && answeredIds.has(q.id));
    if (touched.length === 0) return;
    const before = (await live.store.snapshot()).coverage;
    const after = applyAnsweredQuestions(before, touched);
    for (const dimension of after.dimensions) {
      const previous = before.dimensions.find((d) => d.id === dimension.id);
      if (JSON.stringify(previous) !== JSON.stringify(dimension)) {
        await live.store.updateCoverage(dimension);
      }
    }
  };

  const sendMessage = (sessionId: string, text: string) => {
    const live = getLive(sessionId);
    if (!live || live.session.status === "ended") return;
    addBlock(live, { kind: "user", id: blockId(live), text, at: now().toISOString() });
    liveInput(live).push(text);
    if (live.session.status !== "waiting-for-answer") setStatus(live, "running");
  };

  return {
    start: async (input: { repoPath: string; mode: ModeId; topic: string }) => {
      const repoPath = resolve(input.repoPath.trim().replace(/^"(.*)"$/, "$1"));
      try {
        if (!statSync(repoPath).isDirectory()) throw new Error("not a directory");
      } catch {
        reportError(`Repo folder not found: ${repoPath}`);
        return null;
      }
      const mode = deps.getMode(input.mode);
      const store = storeFor(repoPath);
      const topic = input.topic.trim();
      const live: LiveSession = {
        session: {
          id: newId(),
          title: topic.slice(0, 60) || mode.label,
          mode: input.mode,
          repoPath,
          status: "starting",
          startedAt: now().toISOString(),
        },
        mode,
        store,
        input: null,
        abort: null,
        blocks: [],
        rounds: [],
        answers: new Map(),
        pending: new Map(),
        questionCount: 0,
        blockCount: 0,
      };
      sessions.set(live.session.id, live);
      broadcast({ type: "session-updated", session: live.session });
      await store
        .startSessionLog({
          sessionId: live.session.id,
          title: live.session.title,
          mode: input.mode,
          startedAt: live.session.startedAt,
        })
        .catch((error) => reportError(errorText(error), live.session.id));
      await emitPlan(repoPath, store);
      const kickoff = mode.buildKickoffPrompt(topic);
      addBlock(live, { kind: "user", id: blockId(live), text: kickoff, at: now().toISOString() });
      runQuery(live).push(kickoff);
      return live.session;
    },

    sendMessage,

    answerRound: async (sessionId: string, roundId: string, answers: Answer[]) => {
      const live = getLive(sessionId);
      if (!live) return;
      const pending = live.pending.get(roundId);
      const round = live.rounds.find((r) => r.id === roundId);
      if (!pending || !round) {
        reportError(`Round ${roundId} is not waiting for an answer.`, sessionId);
        return;
      }
      live.answers.set(roundId, answers);
      broadcast({ type: "round-answered", sessionId, roundId, answers });
      try {
        await live.store.recordAnswers(sessionId, round, answers);
        await syncCoverage(live, round, answers);
      } catch (error) {
        reportError(`Could not record answers: ${errorText(error)}`, sessionId);
      }
      // Q ids travel with each answer so Claude can cite them in decisions (questionIds).
      const encoded = encodeAnswersForTool(round.questions, answers);
      for (const question of round.questions) {
        const text = encoded[question.question];
        if (text !== undefined) encoded[question.question] = `[${question.id}] ${text}`;
      }
      setStatus(live, "running");
      pending.settle({ behavior: "allow", updatedInput: { ...pending.input, answers: encoded } });
    },

    reviseAnswer: async (sessionId: string, answer: Answer) => {
      const live = getLive(sessionId);
      if (!live) return;
      const questionId = answer.revisionOf ?? answer.questionId;
      const round = live.rounds.find((r) => r.questions.some((q) => q.id === questionId));
      if (!round) {
        reportError(`Question ${questionId} is not part of this session.`, sessionId);
        return;
      }
      const revision: Answer = { ...answer, questionId, revisionOf: questionId };
      try {
        const latest = await live.store.latestAnswer(sessionId, questionId);
        const previousAnswer = [...(live.answers.get(round.id) ?? [])]
          .reverse()
          .find((a) => a.questionId === questionId);
        const previous =
          latest?.answer ?? (previousAnswer ? encodeAnswerText(previousAnswer) : "(unknown)");
        const dependents = await live.store.dependentDecisions(questionId);
        const dependentIds = dependents.map((d) => d.id);
        await live.store.markDecisionsStale(dependentIds);
        await live.store.recordAnswers(sessionId, round, [revision]);
        const history = [...(live.answers.get(round.id) ?? []), revision];
        live.answers.set(round.id, history);
        broadcast({ type: "round-answered", sessionId, roundId: round.id, answers: history });
        sendMessage(
          sessionId,
          encodeRevisionTurn({
            questionId,
            previous,
            next: encodeAnswerText(revision),
            dependentDecisionIds: dependentIds,
          }),
        );
      } catch (error) {
        reportError(`Could not revise ${questionId}: ${errorText(error)}`, sessionId);
      }
    },

    stop: (sessionId: string) => {
      const live = getLive(sessionId);
      if (!live) return;
      for (const pending of [...live.pending.values()]) {
        pending.settle({ behavior: "deny", message: "The session was stopped.", interrupt: true });
      }
      live.abort?.abort();
      live.input?.close();
      setStatus(live, "ended");
    },

    captureIdea: async (repoPath: string, title: string) => {
      const store = storeFor(resolve(repoPath));
      try {
        await store.addIdea({
          title,
          body: "",
          tags: [],
          date: now().toISOString().slice(0, 10),
          status: "inbox",
        });
      } catch (error) {
        reportError(`Could not capture idea: ${errorText(error)}`);
      }
    },

    /** Everything a (re)connecting browser needs: sessions, their cards, rounds and plans. */
    replay: async (send: (event: ServerEvent) => void) => {
      send({ type: "sessions", sessions: [...sessions.values()].map((l) => l.session) });
      for (const live of sessions.values()) {
        for (const block of live.blocks) send({ type: "block", sessionId: live.session.id, block });
        for (const round of live.rounds) {
          send({ type: "question-round", round });
          const answers = live.answers.get(round.id);
          if (answers) {
            send({
              type: "round-answered",
              sessionId: live.session.id,
              roundId: round.id,
              answers,
            });
          }
        }
      }
      for (const [repoPath, store] of stores) {
        try {
          send({ type: "plan", repoPath, plan: await store.snapshot() });
        } catch {
          // A broken plan file must not block the rest of the replay.
        }
      }
    },

    dispose: async () => {
      for (const live of sessions.values()) {
        live.abort?.abort();
        live.input?.close();
      }
      await Promise.all([...stores.values()].map((store) => store.dispose()));
    },
  };
};
