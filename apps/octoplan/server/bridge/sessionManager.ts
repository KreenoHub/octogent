import { randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import { resolve } from "node:path";
import type { Options, PermissionResult, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  type Answer,
  type Decision,
  type MessageBlock,
  type ModeId,
  type Question,
  type QuestionRound,
  type ServerEvent,
  type Session,
  buildPlanDigest,
  coverageDimensionIdSchema,
  encodeAnswerText,
  encodeAnswersForTool,
  encodeRevisionTurn,
  questionRoundSchema,
} from "@octogent/octoplan-protocol";
import { applyAnsweredQuestions } from "../modes";
import { buildConvergeTurn as defaultBuildConvergeTurn } from "../modes/brainstorm";
import type { ModeDefinition } from "../modes/types";
import type { PlanStore, TranscriptRecord } from "../store/types";
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
  summaryWritten: boolean;
  /** Set by a revision; turned into a visible card at Claude's next round or turn end. */
  pendingRevision: { questionId: string; staleIds: string[] } | null;
  /** A branch that hasn't reported its own Claude session id yet forks from this one. */
  forkOf?: string;
  /** D30: rounds restored as pending after a restart; no canUseTool call is waiting on them. */
  orphaned: Set<string>;
  /** D18: rounds answered so far (revisions excluded), for the recap cadence. */
  answeredRounds: number;
};

export const isRevisionHeading = (heading: string, questionId: string) =>
  new RegExp(`revision\\b.{0,8}\\b${questionId}\\b`, "i").test(heading);

/**
 * What a revision did, read from docs/plan rather than trusted from Claude's prose:
 * each decision that depended on the revised answer is replaced, re-confirmed, or
 * still waiting to be re-checked.
 */
export const revisionCardMarkdown = (
  questionId: string,
  staleIds: readonly string[],
  decisions: readonly Decision[],
) => {
  if (staleIds.length === 0) {
    return `No recorded decisions depended on ${questionId}, so nothing needed re-checking.`;
  }
  const lines = staleIds.map((id) => {
    const replacements = decisions.filter(
      (d) => d.status === "active" && d.id !== id && d.dependsOn.includes(id),
    );
    if (replacements.length > 0) {
      return `- ${id} → ${replacements.map((d) => `${d.id} ${d.title}`).join(", ")}`;
    }
    if (decisions.find((d) => d.id === id)?.status === "active") return `- ${id}: re-confirmed`;
    return `- ${id}: still stale, not re-checked yet`;
  });
  return [`What your change to ${questionId} did, from docs/plan:`, "", ...lines].join("\n");
};

/** Claude's closing `## Summary` reply section (the mode prompts end with one). */
export const isSummaryHeading = (heading: string) => /^summary\b/i.test(heading.trim());

export const fallbackSummary = (rounds: number, answers: number) =>
  `Stopped by the user after ${rounds} question round${rounds === 1 ? "" : "s"} (${answers} answer${answers === 1 ? "" : "s"}) before Claude wrote a closing summary. See DECISIONS.md, GAPS.md and COVERAGE.md for what was settled.`;

export const INVALID_ROUND_MESSAGE =
  "Octoplan shows 1–4 questions per round, each with a question, a header and 2–4 options that have a label and a description. Ask again in that shape.";

const str = (value: unknown) => (typeof value === "string" ? value : "");
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export type SessionManager = ReturnType<typeof createSessionManager>;

/** The user turn that opens a branch; the forked Claude keeps the parent's whole context. */
export const branchTurn = (title: string, fromBlock?: MessageBlock) => {
  const anchor =
    fromBlock?.kind === "section"
      ? ` It starts from your section "${fromBlock.heading || "(untitled)"}".`
      : "";
  return `BRANCH: this conversation is now a separate branch called "${title}".${anchor} Explore this alternative direction from here, as if the other path was not taken. Continue the interview with AskUserQuestion, and record decisions for this branch as usual.`;
};

export const NOTHING_STARRED_MESSAGE =
  "Nothing is starred yet. Star at least one idea on the brainstorm board before converging.";

export const BRANCH_NOT_READY_MESSAGE =
  "This session can't be branched yet: Claude hasn't reported its session id. Wait for its first reply.";

export const ORPHAN_ANSWERS_INTRO =
  "Answers to your last round (the server restarted, so they arrive as a message):";

export const ORPHAN_NO_CLAUDE_MESSAGE =
  "Your answers were recorded in docs/plan, but this session never reported a Claude session id before the restart, so they can't reach Claude. Start a new session to continue.";

/** Session-scoped events a transcript keeps (D29); everything else is not replayed. */
const transcriptSessionId = (event: ServerEvent): string | null => {
  switch (event.type) {
    case "session-updated":
      return event.session.id;
    case "block":
    case "round-answered":
      return event.sessionId;
    case "question-round":
      return event.round.sessionId;
    default:
      return null;
  }
};

const blockNumber = (id: string) => Number.parseInt(/-b(\d+)$/.exec(id)?.[1] ?? "0", 10);

export const createSessionManager = (deps: BridgeDeps, emit: Broadcast) => {
  const now = deps.now ?? (() => new Date());
  const recapEvery = deps.recapEvery ?? 3;
  const buildConvergeTurn = deps.buildConvergeTurn ?? defaultBuildConvergeTurn;
  const newId = deps.newId ?? randomUUID;
  const sessions = new Map<string, LiveSession>();
  const stores = new Map<string, PlanStore>();
  // Appends are chained per session so a transcript keeps the broadcast order.
  const transcriptChains = new Map<string, Promise<void>>();

  // Every broadcast also goes to the session's transcript (fire-and-forget: a slow or
  // failing disk never blocks Claude).
  const broadcast: Broadcast = (event) => {
    emit(event);
    const transcripts = deps.transcripts;
    const sessionId = transcripts ? transcriptSessionId(event) : null;
    if (!transcripts || !sessionId) return;
    const previous = transcriptChains.get(sessionId) ?? Promise.resolve();
    const next = previous
      .then(() => transcripts.append(sessionId, event))
      .catch((error) =>
        emit({
          type: "error",
          message: `Could not save the session transcript: ${errorText(error)}`,
          sessionId,
        }),
      );
    transcriptChains.set(sessionId, next);
  };

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

  const flushRevisionCard = async (live: LiveSession) => {
    const pending = live.pendingRevision;
    if (!pending) return;
    live.pendingRevision = null;
    try {
      const { decisions } = await live.store.snapshot();
      addBlock(live, {
        kind: "section",
        id: blockId(live),
        heading: `Revision ${pending.questionId}`,
        markdown: revisionCardMarkdown(pending.questionId, pending.staleIds, decisions),
        at: now().toISOString(),
      });
    } catch (error) {
      reportError(`Could not summarize the revision: ${errorText(error)}`, live.session.id);
    }
  };

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
        await flushRevisionCard(live);
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
            if (
              live.pendingRevision &&
              isRevisionHeading(section.heading, live.pendingRevision.questionId)
            ) {
              // Claude wrote its own revision card; don't add a second one.
              live.pendingRevision = null;
            }
            if (isSummaryHeading(section.heading) && section.markdown) {
              live.summaryWritten = true;
              await live.store
                .writeSessionSummary(live.session.id, section.markdown)
                .catch((error) => reportError(errorText(error), live.session.id));
            }
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
      await flushRevisionCard(live);
      if (message.subtype !== "success") {
        reportError(`Claude stopped: ${message.subtype}`, live.session.id);
      }
      if (live.pending.size === 0) setStatus(live, "idle");
    }
  };

  const runQuery = (live: LiveSession, resumeId?: string, forkSession = false): InputQueue => {
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
      ...(resumeId && forkSession ? { forkSession: true } : {}),
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
    if (!live.session.claudeSessionId && live.forkOf) return runQuery(live, live.forkOf, true);
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

  const pushTurn = (live: LiveSession, text: string) => {
    addBlock(live, { kind: "user", id: blockId(live), text, at: now().toISOString() });
    liveInput(live).push(text);
    if (live.session.status !== "waiting-for-answer") setStatus(live, "running");
  };

  const sendMessage = (sessionId: string, text: string) => {
    const live = getLive(sessionId);
    if (!live || live.session.status === "ended") return;
    pushTurn(live, text);
  };

  /** D16/D32: the plan digest; "" when the repo has no plan or it can't be read. */
  const planDigest = async (store: PlanStore) => {
    try {
      const conventions = deps.conventions ? await deps.conventions.list().catch(() => []) : [];
      return buildPlanDigest(await store.snapshot(), conventions);
    } catch {
      return "";
    }
  };

  /** The canUseTool answer map; Q ids travel with each answer so Claude can cite them. */
  const encodeRound = (round: QuestionRound, answers: Answer[]) => {
    const encoded = encodeAnswersForTool(round.questions, answers);
    for (const question of round.questions) {
      const text = encoded[question.question];
      if (text !== undefined) encoded[question.question] = `[${question.id}] ${text}`;
    }
    return encoded;
  };

  /** D18: every `recapEvery` answered rounds, the digest rides on the round's last answer. */
  const withRecap = async (
    live: LiveSession,
    round: QuestionRound,
    encoded: Record<string, string>,
  ) => {
    live.answeredRounds += 1;
    if (recapEvery <= 0 || live.answeredRounds % recapEvery !== 0) return encoded;
    const digest = await planDigest(live.store);
    const last = [...round.questions].reverse().find((q) => encoded[q.question] !== undefined);
    if (digest && last) encoded[last.question] = `${encoded[last.question]}\n\n${digest}`;
    return encoded;
  };

  const recordRoundAnswers = async (live: LiveSession, round: QuestionRound, answers: Answer[]) => {
    const sessionId = live.session.id;
    live.answers.set(round.id, answers);
    broadcast({ type: "round-answered", sessionId, roundId: round.id, answers });
    try {
      await live.store.recordAnswers(sessionId, round, answers);
      await syncCoverage(live, round, answers);
    } catch (error) {
      reportError(`Could not record answers: ${errorText(error)}`, sessionId);
    }
  };

  /** D30: a round orphaned by a restart is answered as one user turn to the resumed Claude. */
  const answerOrphanedRound = async (
    live: LiveSession,
    round: QuestionRound,
    answers: Answer[],
  ) => {
    live.orphaned.delete(round.id);
    await recordRoundAnswers(live, round, answers);
    if (!live.session.claudeSessionId) {
      setStatus(live, "idle");
      reportError(ORPHAN_NO_CLAUDE_MESSAGE, live.session.id);
      return;
    }
    const encoded = await withRecap(live, round, encodeRound(round, answers));
    const lines = round.questions.flatMap((q) => {
      const text = encoded[q.question];
      return text === undefined ? [] : [text];
    });
    setStatus(live, "running");
    pushTurn(live, [ORPHAN_ANSWERS_INTRO, ...lines].join("\n"));
  };

  const newLive = (session: Session, mode: ModeDefinition, store: PlanStore): LiveSession => ({
    session,
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
    summaryWritten: false,
    pendingRevision: null,
    orphaned: new Set(),
    answeredRounds: 0,
  });

  /** Rebuilds one session from its transcript without starting Claude (D29). */
  const restoreLive = (record: TranscriptRecord): LiveSession => {
    const session = record.session;
    const live = newLive(
      { ...session, restored: true },
      deps.getMode(session.mode),
      storeFor(session.repoPath),
    );
    for (const event of record.events) {
      if (event.type === "block") {
        live.blocks.push(event.block);
      } else if (event.type === "question-round") {
        const index = live.rounds.findIndex((r) => r.id === event.round.id);
        if (index >= 0) live.rounds[index] = event.round;
        else live.rounds.push(event.round);
      } else if (event.type === "round-answered") {
        live.answers.set(event.roundId, event.answers);
      }
    }
    live.questionCount = live.rounds.reduce((sum, r) => sum + r.questions.length, 0);
    live.blockCount = live.blocks.reduce((max, b) => Math.max(max, blockNumber(b.id)), 0);
    live.answeredRounds = live.rounds.filter((r) => live.answers.has(r.id)).length;
    live.summaryWritten = session.status === "ended";
    // Nothing is running any more: an unanswered last round waits again (answered as a
    // user turn, D30); anything else in flight comes back idle.
    const last = live.rounds.at(-1);
    let status = session.status;
    if (status !== "ended" && status !== "error") {
      if (last && !live.answers.has(last.id)) {
        live.orphaned.add(last.id);
        status = "waiting-for-answer";
      } else {
        status = "idle";
      }
    }
    live.session = { ...live.session, status };
    return live;
  };

  const register = async (live: LiveSession) => {
    sessions.set(live.session.id, live);
    broadcast({ type: "session-updated", session: live.session });
    await live.store
      .startSessionLog({
        sessionId: live.session.id,
        title: live.session.title,
        mode: live.session.mode,
        startedAt: live.session.startedAt,
      })
      .catch((error) => reportError(errorText(error), live.session.id));
  };

  return {
    /** `brief` (v3, D57) goes between the plan digest and the mode's kickoff prompt. */
    start: async (input: { repoPath: string; mode: ModeId; topic: string; brief?: string }) => {
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
      const live = newLive(
        {
          id: newId(),
          title: topic.slice(0, 60) || mode.label,
          mode: input.mode,
          repoPath,
          status: "starting",
          startedAt: now().toISOString(),
        },
        mode,
        store,
      );
      await register(live);
      await emitPlan(repoPath, store);
      // D16/D34: Claude starts from what docs/plan already settled.
      const digest = await planDigest(store);
      const prompt = mode.buildKickoffPrompt(topic);
      const kickoff = [digest, input.brief?.trim(), prompt].filter(Boolean).join("\n\n");
      addBlock(live, { kind: "user", id: blockId(live), text: kickoff, at: now().toISOString() });
      runQuery(live).push(kickoff);
      return live.session;
    },

    sendMessage,

    /** The session as the browser sees it (the pop-out terminal needs its repo and Claude id). */
    getSession: (sessionId: string): Session | undefined => sessions.get(sessionId)?.session,

    /**
     * Forks a session to explore an alternative (SPEC 3.5): a new Octoplan session in the
     * same repo and mode whose query resumes the parent's Claude session with forkSession,
     * recorded as a B-record in docs/plan/branches.md.
     */
    branch: async (sessionId: string, title: string, fromBlockId?: string) => {
      const parent = getLive(sessionId);
      if (!parent) return null;
      const parentClaudeId = parent.session.claudeSessionId;
      if (!parentClaudeId) {
        reportError(BRANCH_NOT_READY_MESSAGE, sessionId);
        return null;
      }
      const fromBlock = fromBlockId ? parent.blocks.find((b) => b.id === fromBlockId) : undefined;
      if (fromBlockId && !fromBlock) {
        reportError(`Block ${fromBlockId} is not part of this session.`, sessionId);
        return null;
      }
      const cleanTitle = title.trim().slice(0, 60) || `${parent.session.title} (branch)`;
      const child = newLive(
        {
          id: newId(),
          title: cleanTitle,
          mode: parent.session.mode,
          repoPath: parent.session.repoPath,
          status: "starting",
          startedAt: now().toISOString(),
          parentSessionId: parent.session.id,
        },
        parent.mode,
        parent.store,
      );
      // The forked Claude remembers the parent's Q ids, so the branch's continue after them.
      child.questionCount = parent.questionCount;
      child.forkOf = parentClaudeId;
      await register(child);
      broadcast({ type: "session-updated", session: parent.session });
      let branchId: string | null = null;
      try {
        const record = await parent.store.upsertBranch({
          title: cleanTitle,
          sessionId: child.session.id,
          parentSessionId: parent.session.id,
          ...(fromBlockId ? { forkedFromBlockId: fromBlockId } : {}),
          status: "exploring",
          body: "",
        });
        branchId = record.id;
      } catch (error) {
        reportError(`Could not record the branch: ${errorText(error)}`, child.session.id);
      }
      broadcast({
        type: "notice",
        message: branchId ? `Branched ${branchId}: ${cleanTitle}` : `Branched: ${cleanTitle}`,
        sessionId: child.session.id,
      });
      pushTurn(child, branchTurn(cleanTitle, fromBlock));
      return child.session;
    },

    /** Brainstorm: asks Claude to turn the repo's starred ideas into decisions. */
    converge: async (sessionId: string) => {
      const live = getLive(sessionId);
      if (!live) return;
      if (live.session.status === "ended" && !live.session.claudeSessionId) {
        reportError("This session ended before Claude started, so it can't converge.", sessionId);
        return;
      }
      try {
        const { ideas } = await live.store.snapshot();
        if (!ideas.some((idea) => idea.status === "starred")) {
          reportError(NOTHING_STARRED_MESSAGE, sessionId);
          return;
        }
        // An ended or failed session is resumed from its Claude session id by liveInput.
        pushTurn(live, buildConvergeTurn(ideas));
        // Starred ideas are now in Claude's hands as decisions; close them on the board.
        for (const idea of ideas.filter((i) => i.status === "starred")) {
          await live.store.updateIdea({ ...idea, status: "adopted" });
        }
      } catch (error) {
        reportError(`Could not converge: ${errorText(error)}`, sessionId);
      }
    },

    answerRound: async (sessionId: string, roundId: string, answers: Answer[]) => {
      const live = getLive(sessionId);
      if (!live) return;
      const pending = live.pending.get(roundId);
      const round = live.rounds.find((r) => r.id === roundId);
      if (round && !pending && live.orphaned.has(roundId)) {
        await answerOrphanedRound(live, round, answers);
        return;
      }
      if (!pending || !round) {
        reportError(`Round ${roundId} is not waiting for an answer.`, sessionId);
        return;
      }
      await recordRoundAnswers(live, round, answers);
      const encoded = await withRecap(live, round, encodeRound(round, answers));
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
        live.pendingRevision = { questionId, staleIds: dependentIds };
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

    stop: async (sessionId: string) => {
      const live = getLive(sessionId);
      if (!live) return;
      for (const pending of [...live.pending.values()]) {
        pending.settle({ behavior: "deny", message: "The session was stopped.", interrupt: true });
      }
      live.orphaned.clear();
      live.abort?.abort();
      live.input?.close();
      setStatus(live, "ended");
      if (!live.summaryWritten) {
        live.summaryWritten = true;
        const answers = [...live.answers.values()].reduce((sum, list) => sum + list.length, 0);
        await live.store
          .writeSessionSummary(live.session.id, fallbackSummary(live.rounds.length, answers))
          .catch((error) => reportError(errorText(error), live.session.id));
      }
    },

    captureIdea: async (repoPath: string, title: string, tags: readonly string[] = []) => {
      const store = storeFor(resolve(repoPath));
      try {
        const idea = await store.addIdea({
          title,
          body: "",
          tags: [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))],
          date: now().toISOString().slice(0, 10),
          status: "inbox",
        });
        broadcast({ type: "notice", message: `Captured ${idea.id}: ${idea.title}` });
      } catch (error) {
        reportError(`Could not capture idea: ${errorText(error)}`);
      }
    },

    /** The per-repo store (cached, change events broadcast as `plan`), for server-side plan ops. */
    storeFor: (repoPath: string) => storeFor(resolve(repoPath)),

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

    /**
     * D29/D30: rebuild sessions from `deps.transcripts` after a server restart. No Claude
     * query starts here; the first message or answer resumes the saved Claude session.
     * Returns how many sessions were restored.
     */
    restore: async (): Promise<number> => {
      if (!deps.transcripts) return 0;
      let count = 0;
      for (const record of await deps.transcripts.load()) {
        if (sessions.has(record.session.id)) continue;
        try {
          const live = restoreLive(record);
          sessions.set(live.session.id, live);
          count += 1;
        } catch (error) {
          reportError(`Could not restore session ${record.session.id}: ${errorText(error)}`);
        }
      }
      return count;
    },

    dispose: async () => {
      for (const live of sessions.values()) {
        live.abort?.abort();
        live.input?.close();
      }
      await Promise.all(transcriptChains.values());
      await Promise.all([...stores.values()].map((store) => store.dispose()));
    },
  };
};
