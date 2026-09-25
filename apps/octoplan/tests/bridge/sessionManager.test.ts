import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import type { Answer, ServerEvent } from "@octogent/octoplan-protocol";
import { afterEach, describe, expect, it } from "vitest";
import {
  INVALID_ROUND_MESSAGE,
  type SessionManager,
  createSessionManager,
} from "../../server/bridge/sessionManager";
import { PLANNING_BUILTIN_TOOLS, PLANNING_DENY_MESSAGE } from "../../server/bridge/toolPolicy";
import { createFsPlanStore } from "../../server/store/fsPlanStore";
import {
  assistantText,
  assistantToolUse,
  createFakeQuery,
  eventLog,
  init,
  realDeps,
  result,
  roundInput,
  tempRepo,
  until,
} from "./fakes";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const setup = (script: Parameters<typeof createFakeQuery>[0]) => {
  const repo = tempRepo();
  const fake = createFakeQuery(script);
  const log = eventLog();
  const manager: SessionManager = createSessionManager(realDeps(fake.query), log.broadcast);
  cleanups.push(async () => {
    await manager.dispose();
    repo.cleanup();
  });
  return { repo, fake, log, manager };
};

const answer = (questionId: string, label: string, extra: Partial<Answer> = {}): Answer => ({
  questionId,
  selected: [label],
  modifier: "none",
  answeredAt: "2026-09-25T10:01:00.000Z",
  ...extra,
});

const isType =
  <K extends ServerEvent["type"]>(type: K) =>
  (event: ServerEvent): event is Extract<ServerEvent, { type: K }> =>
    event.type === type;

describe("session manager", () => {
  it("runs a full round: kickoff, sections, question round, encoded answers, idle", async () => {
    const toolResults: PermissionResult[] = [];
    const { repo, fake, log, manager } = setup(async function* ({ next, askTool }) {
      await next();
      yield init("claude-1");
      yield assistantText("## Orientation\nThe repo is empty.\n## Plan\nAsk about users first.");
      yield assistantToolUse("Read", { file_path: "README.md" });
      toolResults.push(await askTool("AskUserQuestion", roundInput));
      yield result();
      await next();
    });

    const session = await manager.start({
      repoPath: repo.dir,
      mode: "deep-interview",
      topic: "Habit CLI",
    });
    expect(session?.status).toBe("starting");

    const roundEvent = await log.waitFor(isType("question-round"));
    const { round } = roundEvent;
    expect(round.questions.map((q) => [q.id, q.dimension])).toEqual([
      ["Q1", "users"],
      ["Q2", "scope"],
    ]);
    await until(() =>
      log.events.some(
        (e) => e.type === "session-updated" && e.session.status === "waiting-for-answer",
      ),
    );

    const sections = log.events.filter(
      (e): e is Extract<ServerEvent, { type: "block" }> =>
        e.type === "block" && e.block.kind === "section",
    );
    expect(sections.map((s) => (s.block.kind === "section" ? s.block.heading : ""))).toEqual([
      "Orientation",
      "Plan",
    ]);
    expect(log.events.some((e) => e.type === "block" && e.block.kind === "tool")).toBe(true);

    await manager.answerRound(round.sessionId, round.id, [
      answer("Q1", "Just me (Recommended)"),
      answer("Q2", "Tiny (Recommended)", { modifier: "tentative" }),
    ]);
    await until(() => toolResults.length === 1);
    expect(toolResults[0]).toEqual({
      behavior: "allow",
      updatedInput: {
        ...roundInput,
        answers: {
          "Who is this for?": "[Q1] Just me (Recommended)",
          "How big is v1?":
            "[Q2] Tiny (Recommended) (TENTATIVE — log as a risk, re-ask if it matters)",
        },
      },
    });
    await until(() =>
      log.events.some((e) => e.type === "session-updated" && e.session.status === "idle"),
    );

    // Kickoff reached Claude as the first user turn, and the planning toolset is locked down.
    const call = fake.calls[0];
    expect(call?.received[0]).toContain("Habit CLI");
    expect(call?.options.tools).toEqual(PLANNING_BUILTIN_TOOLS);
    expect(call?.options.allowedTools).toBeUndefined();
    expect(call?.options.settingSources).toEqual(["project"]);
    expect(call?.options.cwd).toBe(repo.dir);

    // The store logged the answers, the tentative risk, and coverage for both dimensions.
    const snapshot = await createFsPlanStore(repo.dir).snapshot();
    expect(snapshot.risks).toHaveLength(1);
    const users = snapshot.coverage.dimensions.find((d) => d.id === "users");
    expect(users?.questionIds).toContain("Q1");
  });

  it("denies malformed rounds and tools outside the planning allowlist", async () => {
    const results: PermissionResult[] = [];
    const { repo, manager } = setup(async function* ({ next, askTool }) {
      await next();
      yield init("claude-2");
      results.push(
        await askTool("AskUserQuestion", {
          questions: [
            { question: "One option?", header: "x", options: [{ label: "a", description: "" }] },
          ],
        }),
      );
      results.push(await askTool("Bash", { command: "rm -rf /" }));
      results.push(await askTool("mcp__octoplan__plan_add_gap", { title: "gap" }));
      results.push(await askTool("Read", { file_path: "x" }));
      yield result();
    });
    await manager.start({ repoPath: repo.dir, mode: "quick-align", topic: "" });
    await until(() => results.length === 4);
    expect(results[0]).toEqual({ behavior: "deny", message: INVALID_ROUND_MESSAGE });
    expect(results[1]).toEqual({ behavior: "deny", message: PLANNING_DENY_MESSAGE });
    expect(results[2]?.behavior).toBe("allow");
    expect(results[3]?.behavior).toBe("allow");
  });

  it("revises an answer: marks dependent decisions stale and sends the REVISION turn", async () => {
    const { repo, fake, log, manager } = setup(async function* ({ next, askTool }) {
      await next();
      yield init("claude-3");
      await askTool("AskUserQuestion", roundInput);
      yield result();
      await next(); // the revision turn
      yield result();
    });
    await manager.start({ repoPath: repo.dir, mode: "deep-interview", topic: "t" });
    const { round } = await log.waitFor(isType("question-round"));
    await manager.answerRound(round.sessionId, round.id, [
      answer("Q1", "Just me (Recommended)"),
      answer("Q2", "Tiny (Recommended)"),
    ]);
    const store = createFsPlanStore(repo.dir);
    const decision = await store.upsertDecision({
      title: "Single-user app",
      body: "Because only one user.",
      source: "test",
      questionIds: ["Q1"],
      dependsOn: [],
    });

    await manager.reviseAnswer(round.sessionId, answer("Q1", "A small team", { revisionOf: "Q1" }));

    await until(() => (fake.calls[0]?.received.length ?? 0) >= 2);
    expect(fake.calls[0]?.received[1]).toBe(
      `REVISION of Q1: was "Just me (Recommended)", now "A small team". Re-check decisions ${decision.id} that depended on it and report what changes.`,
    );
    const after = await createFsPlanStore(repo.dir).snapshot();
    expect(after.decisions.find((d) => d.id === decision.id)?.status).toBe("stale");
    const answered = log.events.filter(isType("round-answered")).at(-1);
    expect(answered?.answers.map((a) => a.selected[0])).toEqual([
      "Just me (Recommended)",
      "Tiny (Recommended)",
      "A small team",
    ]);
  });

  it("stopping while a round waits denies it with interrupt and ends the session", async () => {
    const results: PermissionResult[] = [];
    const { repo, log, manager } = setup(async function* ({ next, askTool }) {
      await next();
      yield init("claude-4");
      results.push(await askTool("AskUserQuestion", roundInput));
    });
    const session = await manager.start({ repoPath: repo.dir, mode: "brainstorm", topic: "t" });
    await log.waitFor(isType("question-round"));
    manager.stop(session?.id ?? "");
    await until(() => results.length === 1);
    expect(results[0]).toMatchObject({ behavior: "deny", interrupt: true });
    expect(
      log.events.some((e) => e.type === "session-updated" && e.session.status === "ended"),
    ).toBe(true);
  });

  it("replays sessions, cards, pending rounds and plans to a reconnecting client", async () => {
    const { repo, log, manager } = setup(async function* ({ next, askTool }) {
      await next();
      yield init("claude-5");
      yield assistantText("Hello");
      await askTool("AskUserQuestion", roundInput);
    });
    await manager.start({ repoPath: repo.dir, mode: "deep-interview", topic: "t" });
    await log.waitFor(isType("question-round"));
    const replayed: ServerEvent[] = [];
    await manager.replay((e) => replayed.push(e));
    expect(replayed[0]).toMatchObject({ type: "sessions" });
    expect(replayed.some((e) => e.type === "question-round")).toBe(true);
    expect(replayed.some((e) => e.type === "block" && e.block.kind === "section")).toBe(true);
    expect(replayed.some((e) => e.type === "plan")).toBe(true);
  });

  it("rejects a missing repo folder with a clear error", async () => {
    const { log, manager } = setup(async function* () {});
    const session = await manager.start({
      repoPath: "C:/definitely/not/here",
      mode: "deep-interview",
      topic: "",
    });
    expect(session).toBeNull();
    expect(log.events.find(isType("error"))?.message).toContain("Repo folder not found");
  });
});
