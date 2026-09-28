import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import {
  type Answer,
  DIGEST_HEADING,
  DIGEST_MAX_LINES,
  type QuestionRound,
  type ServerEvent,
  buildPlanDigest,
  encodeAnswersForTool,
} from "@octogent/octoplan-protocol";
import { afterEach, describe, expect, it } from "vitest";
import {
  ORPHAN_ANSWERS_INTRO,
  type SessionManager,
  createSessionManager,
} from "../../server/bridge/sessionManager";
import type { BridgeDeps } from "../../server/bridge/types";
import { getMode } from "../../server/modes";
import { createFsPlanStore } from "../../server/store/fsPlanStore";
import {
  assistantText,
  createFakeQuery,
  createFakeTranscripts,
  eventLog,
  fakeConventions,
  init,
  realDeps,
  result,
  roundInput,
  tempRepo,
  until,
} from "./fakes";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  // Newest first: managers dispose their stores before the temp repo goes away.
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const isType =
  <K extends ServerEvent["type"]>(type: K) =>
  (event: ServerEvent): event is Extract<ServerEvent, { type: K }> =>
    event.type === type;

const answersFor = (round: QuestionRound): Answer[] =>
  round.questions.map((q) => ({
    questionId: q.id,
    selected: [q.options[0]?.label ?? ""],
    modifier: "none",
    answeredAt: "2026-09-25T10:01:00.000Z",
  }));

const rounds = (events: ServerEvent[]) =>
  events.filter(isType("question-round")).map((e) => e.round);

const managerFor = (deps: BridgeDeps) => {
  const log = eventLog();
  const manager: SessionManager = createSessionManager(deps, log.broadcast);
  cleanups.push(() => manager.dispose());
  return { log, manager };
};

const seedDecision = async (repoDir: string) => {
  const store = createFsPlanStore(repoDir);
  await store.upsertDecision({
    title: "Local-first storage",
    body: "Everything lives in docs/plan.",
    source: "test",
    questionIds: [],
    dependsOn: [],
    status: "active",
  });
  await store.dispose();
};

describe("session restore (D29, D30)", () => {
  it("brings back blocks and rounds, and answers an orphaned round as a resumed user turn", async () => {
    const repo = tempRepo();
    cleanups.push(repo.cleanup);
    const { transcripts } = createFakeTranscripts();

    // Before the restart: round 1 is answered, round 2 is pending when the server dies.
    const before = createFakeQuery(async function* ({ next, askTool }) {
      await next();
      yield init("claude-1");
      yield assistantText("## Plan\nLet's start.");
      await askTool("AskUserQuestion", roundInput);
      yield assistantText("## Next\nOne more.");
      await askTool("AskUserQuestion", roundInput);
    });
    const first = managerFor({ ...realDeps(before.query), transcripts });
    const session = await first.manager.start({
      repoPath: repo.dir,
      mode: "quick-align",
      topic: "A todo app",
    });
    if (!session) throw new Error("no session");
    const round1 = await first.log.waitFor(isType("question-round"));
    await first.manager.answerRound(session.id, round1.round.id, answersFor(round1.round));
    await until(() => rounds(first.log.events).length === 2);
    const round2 = rounds(first.log.events)[1] as QuestionRound;
    const blocksBefore = first.log.events.filter(isType("block")).map((e) => e.block);
    await first.manager.dispose();

    // The restart: a new manager over the same transcripts.
    const after = createFakeQuery(async function* ({ next }) {
      yield init("claude-1");
      while ((await next()) !== null) yield result();
    });
    const second = managerFor({ ...realDeps(after.query), transcripts });
    expect(await second.manager.restore()).toBe(1);
    expect(after.calls).toHaveLength(0);

    const replayed: ServerEvent[] = [];
    await second.manager.replay((e) => replayed.push(e));
    const [sessionsEvent] = replayed.filter(isType("sessions"));
    expect(sessionsEvent?.sessions).toEqual([
      expect.objectContaining({
        id: session.id,
        status: "waiting-for-answer",
        restored: true,
        claudeSessionId: "claude-1",
      }),
    ]);
    expect(replayed.filter(isType("block")).map((e) => e.block)).toEqual(blocksBefore);
    expect(rounds(replayed).map((r) => r.id)).toEqual([round1.round.id, round2.id]);
    const replayedAnswers = replayed.filter(isType("round-answered"));
    expect(replayedAnswers.map((e) => e.roundId)).toEqual([round1.round.id]);

    // Answering the orphaned round resumes Claude with one user turn.
    const answers = answersFor(round2);
    await second.manager.answerRound(session.id, round2.id, answers);
    await until(() => (after.calls[0]?.received.length ?? 0) === 1);
    const call = after.calls[0];
    expect(call?.options.resume).toBe("claude-1");
    const encoded = encodeAnswersForTool(round2.questions, answers);
    expect(call?.received[0]).toBe(
      [
        ORPHAN_ANSWERS_INTRO,
        ...round2.questions.map((q) => `[${q.id}] ${encoded[q.question]}`),
      ].join("\n"),
    );
    expect(round2.questions.map((q) => q.id)).toEqual(["Q3", "Q4"]);
    expect(second.log.events.filter(isType("round-answered")).map((e) => e.roundId)).toEqual([
      round2.id,
    ]);

    // The restored session is live: a follow-up message reaches the same resumed query.
    second.manager.sendMessage(session.id, "Also: offline support?");
    await until(() => (after.calls[0]?.received.length ?? 0) === 2);
    expect(after.calls).toHaveLength(1);
    expect(after.calls[0]?.received[1]).toBe("Also: offline support?");
    const newBlockIds = second.log.events.filter(isType("block")).map((e) => e.block.id);
    for (const id of newBlockIds) expect(blocksBefore.map((b) => b.id)).not.toContain(id);
  });

  it("brings an in-flight session back idle, and skips sessions already live", async () => {
    const repo = tempRepo();
    cleanups.push(repo.cleanup);
    const { transcripts } = createFakeTranscripts();
    const before = createFakeQuery(async function* ({ next }) {
      await next();
      yield init("claude-2");
      yield assistantText("Thinking...");
      await new Promise(() => {});
    });
    const first = managerFor({ ...realDeps(before.query), transcripts });
    const session = await first.manager.start({
      repoPath: repo.dir,
      mode: "quick-align",
      topic: "Idle after restart",
    });
    await first.log.waitFor(
      (e): e is ServerEvent => e.type === "session-updated" && e.session.status === "running",
    );
    await first.manager.dispose();

    const after = createFakeQuery(async function* () {});
    const second = managerFor({ ...realDeps(after.query), transcripts });
    expect(await second.manager.restore()).toBe(1);
    expect(await second.manager.restore()).toBe(0);
    expect(second.manager.getSession(session?.id ?? "")).toEqual(
      expect.objectContaining({ status: "idle", restored: true }),
    );
  });

  it("reports a clear error when an orphaned round's session never got a Claude id", async () => {
    const repo = tempRepo();
    cleanups.push(repo.cleanup);
    const { transcripts } = createFakeTranscripts();
    const round: QuestionRound = {
      id: "s1-r1",
      sessionId: "s1",
      index: 1,
      askedAt: "2026-09-25T10:00:00.000Z",
      questions: [
        {
          id: "Q1",
          question: "Who is this for?",
          header: "users",
          multiSelect: false,
          options: [
            { label: "Me", description: "" },
            { label: "Team", description: "" },
          ],
        },
      ],
    };
    await transcripts.append("s1", {
      type: "session-updated",
      session: {
        id: "s1",
        title: "No id",
        mode: "quick-align",
        repoPath: repo.dir,
        status: "waiting-for-answer",
        startedAt: "2026-09-25T10:00:00.000Z",
      },
    });
    await transcripts.append("s1", { type: "question-round", round });
    const fake = createFakeQuery(async function* () {});
    const { log, manager } = managerFor({ ...realDeps(fake.query), transcripts });
    await manager.restore();
    await manager.answerRound("s1", "s1-r1", answersFor(round));
    expect(fake.calls).toHaveLength(0);
    expect(log.events.filter(isType("error")).map((e) => e.message)).toEqual([
      expect.stringContaining("never reported a Claude session id"),
    ]);
    expect(manager.getSession("s1")?.status).toBe("idle");
  });
});

describe("plan digest (D16, D18, D32, D34)", () => {
  it("puts the digest (≤60 lines) at the top of the first user turn", async () => {
    const repo = tempRepo();
    cleanups.push(repo.cleanup);
    await seedDecision(repo.dir);
    const fake = createFakeQuery(async function* ({ next }) {
      await next();
      yield init("claude-3");
      yield result();
    });
    const convention = {
      id: "C1",
      title: "Always pnpm",
      date: "2026-09-01",
      body: "",
    };
    const { log, manager } = managerFor({
      ...realDeps(fake.query),
      conventions: fakeConventions([convention]),
    });
    await manager.start({ repoPath: repo.dir, mode: "quick-align", topic: "Sync" });
    await until(() => (fake.calls[0]?.received.length ?? 0) === 1);

    const snapshot = await createFsPlanStore(repo.dir).snapshot();
    const digest = buildPlanDigest(snapshot, [convention]);
    const kickoff = getMode("quick-align").buildKickoffPrompt("Sync");
    const firstTurn = fake.calls[0]?.received[0] ?? "";
    expect(firstTurn).toBe(`${digest}\n\n${kickoff}`);
    expect(firstTurn.startsWith(DIGEST_HEADING)).toBe(true);
    expect(digest).toContain("Local-first storage");
    expect(digest).toContain("Always pnpm");
    expect(digest.split("\n").length).toBeLessThanOrEqual(DIGEST_MAX_LINES);
    const [firstBlock] = log.events.filter(isType("block")).map((e) => e.block);
    expect(firstBlock).toEqual(expect.objectContaining({ kind: "user", text: firstTurn }));
  });

  it("starts without a digest on an empty repo and survives a failing conventions read", async () => {
    const repo = tempRepo();
    cleanups.push(repo.cleanup);
    const fake = createFakeQuery(async function* ({ next }) {
      await next();
      yield result();
    });
    const { manager } = managerFor({
      ...realDeps(fake.query),
      conventions: fakeConventions(new Error("disk gone")),
    });
    await manager.start({ repoPath: repo.dir, mode: "quick-align", topic: "Fresh" });
    await until(() => (fake.calls[0]?.received.length ?? 0) === 1);
    expect(fake.calls[0]?.received[0]).toBe(getMode("quick-align").buildKickoffPrompt("Fresh"));
  });

  it("appends the digest to the answer of exactly rounds 3 and 6 of 6", async () => {
    const repo = tempRepo();
    cleanups.push(repo.cleanup);
    await seedDecision(repo.dir);
    const results: PermissionResult[] = [];
    const fake = createFakeQuery(async function* ({ next, askTool }) {
      await next();
      yield init("claude-4");
      for (let i = 0; i < 6; i += 1) results.push(await askTool("AskUserQuestion", roundInput));
      yield result();
    });
    const { log, manager } = managerFor(realDeps(fake.query));
    const session = await manager.start({
      repoPath: repo.dir,
      mode: "deep-interview",
      topic: "Recap",
    });
    if (!session) throw new Error("no session");
    for (let n = 1; n <= 6; n += 1) {
      await until(() => rounds(log.events).length === n);
      const round = rounds(log.events)[n - 1] as QuestionRound;
      await manager.answerRound(session.id, round.id, answersFor(round));
    }
    await until(() => results.length === 6);

    const withDigest = results.map((r, index) => {
      if (r.behavior !== "allow") throw new Error("round denied");
      const answers = Object.values(
        (r.updatedInput as { answers: Record<string, string> }).answers,
      );
      const recapIn = answers.map((text) => text.includes(DIGEST_HEADING));
      // Only the round's last answer carries it.
      if (recapIn.slice(0, -1).some(Boolean)) throw new Error(`digest early in ${index + 1}`);
      return recapIn.at(-1) ? index + 1 : null;
    });
    expect(withDigest.filter((n) => n !== null)).toEqual([3, 6]);
  });
});
