import { describe, expect, it } from "vitest";
import {
  type GoalDoc,
  type SessionLog,
  type Stage,
  parseGoalDoc,
  parseSessionLog,
  parseStage,
  serializeGoalDoc,
  serializeSessionLog,
  serializeStage,
  sessionFileName,
} from "../src";

describe("GOAL.md", () => {
  const goal: GoalDoc = {
    title: "Octoplan MVP",
    why: "Planning in the terminal buries questions.",
    goals: ["Deep interview end-to-end", "Plan files written to docs/plan"],
    nonGoals: ["Multi-user"],
    done: [
      { id: "DOD1", text: "Questions render as cards", status: "covered", evidence: "e2e run 3" },
      { id: "DOD2", text: "GOAL.md generated", status: "partial", evidence: "" },
    ],
  };

  it("round-trips", () => {
    expect(parseGoalDoc(serializeGoalDoc(goal))).toEqual({ goal, extra: "" });
  });

  it("preserves sections it does not own", () => {
    const text = `${serializeGoalDoc(goal)}\n## My notes\n\nKeep this.\n`;
    const { goal: parsed, extra } = parseGoalDoc(text);
    expect(parsed).toEqual(goal);
    expect(serializeGoalDoc(parsed, extra)).toContain("## My notes\n\nKeep this.");
  });

  it("round-trips an empty goal without leaking placeholders", () => {
    const empty: GoalDoc = { title: "Empty", why: "", goals: [], nonGoals: [], done: [] };
    expect(parseGoalDoc(serializeGoalDoc(empty))).toEqual({ goal: empty, extra: "" });
  });

  it("ticks the checkbox only when covered", () => {
    const text = serializeGoalDoc(goal);
    expect(text).toContain("- [x] Questions render as cards");
    expect(text).toContain("- [ ] GOAL.md generated");
  });
});

describe("session log", () => {
  const log: SessionLog = {
    title: "Octoplan kickoff",
    mode: "deep-interview",
    repoPath: "C:\\Users\\kulis\\Projects\\octoplan-scratch",
    startedAt: "2026-09-25T10:00:00.000Z",
    claudeSessionId: "abc-123",
    summary: "Aligned on placement and engine.",
    entries: [
      {
        id: "A1",
        questionId: "Q1",
        questionText: "Where should it live?",
        round: 1,
        dimension: "architecture",
        answer: "Separate app, same repo",
        modifier: "none",
        answeredAt: "2026-09-25T10:01:00.000Z",
      },
      {
        id: "A2",
        questionId: "Q1",
        questionText: "Where should it live?",
        round: 1,
        answer: "New tab inside Octogent",
        modifier: "tentative",
        revises: "A1",
        answeredAt: "2026-09-25T10:05:00.000Z",
      },
    ],
  };

  it("round-trips including revision history", () => {
    expect(parseSessionLog(serializeSessionLog(log))).toEqual(log);
  });

  it("builds dated file names", () => {
    expect(sessionFileName("2026-09-25", "Octoplan: Kickoff!")).toBe(
      "2026-09-25-octoplan-kickoff.md",
    );
  });
});

describe("stage prompts", () => {
  it("round-trips prompts that contain code fences", () => {
    const stage: Stage = {
      index: 2,
      title: "Bridge",
      goal: "Questions reach the UI.",
      prompt: "Build the bridge.\n\n```ts\nconst x = 1;\n```\nThen stop.",
    };
    expect(parseStage(serializeStage(stage))).toEqual(stage);
  });
});
