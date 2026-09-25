import type { ServerEvent } from "@octogent/octoplan-protocol";
import { describe, expect, it } from "vitest";
import {
  type PlanClientState,
  initialPlanClientState,
  planClientReducer,
  selectPendingRounds,
} from "../../web/src/app/planClientReducer";
import { answer, plan, round, sectionBlock, session } from "./fixtures";

const run = (...events: ServerEvent[]): PlanClientState =>
  events.reduce(planClientReducer, initialPlanClientState);

describe("planClientReducer", () => {
  it("hello records the server version", () => {
    const state = run({ type: "hello", protocolVersion: 1, serverVersion: "1.2.3" });
    expect(state.serverVersion).toBe("1.2.3");
  });

  it("sessions replaces the list and session-updated upserts", () => {
    const state = run(
      { type: "sessions", sessions: [session(), session({ id: "s2", title: "Other" })] },
      { type: "session-updated", session: session({ id: "s2", status: "ended" }) },
      { type: "session-updated", session: session({ id: "s3" }) },
    );
    expect(state.sessions.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    expect(state.sessions[1]?.status).toBe("ended");
    const replaced = planClientReducer(state, { type: "sessions", sessions: [session()] });
    expect(replaced.sessions.map((s) => s.id)).toEqual(["s1"]);
  });

  it("block appends per session and dedupes by id (last write wins, position kept)", () => {
    const state = run(
      { type: "block", sessionId: "s1", block: sectionBlock("b1", "Intro", 2) },
      { type: "block", sessionId: "s1", block: sectionBlock("b2", "Next", 2) },
      { type: "block", sessionId: "s1", block: sectionBlock("b1", "Intro v2", 3) },
      { type: "block", sessionId: "s2", block: sectionBlock("b1", "Other session", 1) },
    );
    const s1 = state.blocksBySession.s1 ?? [];
    expect(s1.map((b) => b.id)).toEqual(["b1", "b2"]);
    const first = s1[0];
    expect(first?.kind === "section" ? first.heading : null).toBe("Intro v2");
    expect(state.blocksBySession.s2).toHaveLength(1);
  });

  it("question-round adds a pending round and round-answered marks it answered", () => {
    const asked = run({ type: "question-round", round: round() });
    expect(asked.rounds.r1?.status).toBe("pending");
    expect(selectPendingRounds(asked, "s1").map((r) => r.round.id)).toEqual(["r1"]);

    const answered = planClientReducer(asked, {
      type: "round-answered",
      sessionId: "s1",
      roundId: "r1",
      answers: [answer("Q1"), answer("Q2")],
    });
    expect(answered.rounds.r1?.status).toBe("answered");
    expect(answered.rounds.r1?.answers).toHaveLength(2);
    expect(selectPendingRounds(answered, "s1")).toEqual([]);
  });

  it("round-answered arriving before its question-round is applied when the round lands", () => {
    const early = run({
      type: "round-answered",
      sessionId: "s1",
      roundId: "r1",
      answers: [answer("Q1")],
    });
    expect(early.rounds.r1).toBeUndefined();
    const state = planClientReducer(early, { type: "question-round", round: round() });
    expect(state.rounds.r1?.status).toBe("answered");
    expect(state.rounds.r1?.answers.map((a) => a.questionId)).toEqual(["Q1"]);
    expect(state.earlyAnswers).toEqual({});
  });

  it("a re-sent question-round keeps an answered round answered", () => {
    const state = run(
      { type: "question-round", round: round() },
      { type: "round-answered", sessionId: "s1", roundId: "r1", answers: [answer("Q1")] },
      { type: "question-round", round: round() },
    );
    expect(state.rounds.r1?.status).toBe("answered");
  });

  it("pending rounds are ordered by index and scoped to the session", () => {
    const state = run(
      { type: "question-round", round: round({ id: "r2", index: 1 }) },
      { type: "question-round", round: round({ id: "r1", index: 0 }) },
      { type: "question-round", round: round({ id: "rx", sessionId: "s2" }) },
    );
    expect(selectPendingRounds(state, "s1").map((r) => r.round.id)).toEqual(["r1", "r2"]);
  });

  it("plan stores the snapshot per repo, latest wins", () => {
    const state = run(
      { type: "plan", repoPath: "C:\\a", plan: plan() },
      { type: "plan", repoPath: "C:\\b", plan: plan() },
      { type: "plan", repoPath: "C:\\a", plan: plan({ goal: null, ideas: [] }) },
    );
    expect(Object.keys(state.planByRepo).sort()).toEqual(["C:\\a", "C:\\b"]);
  });

  it("error keeps the 20 most recent errors", () => {
    let state = initialPlanClientState;
    for (let i = 0; i < 30; i++) {
      state = planClientReducer(state, { type: "error", message: `boom ${i}`, sessionId: "s1" });
    }
    expect(state.errors).toHaveLength(20);
    expect(state.errors.at(-1)?.message).toBe("boom 29");
  });
});
