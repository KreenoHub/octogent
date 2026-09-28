import { describe, expect, it } from "vitest";
import {
  type Answer,
  type Question,
  encodeAnswerText,
  encodeAnswersForTool,
  encodeRevisionTurn,
  parseClientEvent,
  parseServerEvent,
} from "../src";

const answer = (overrides: Partial<Answer>): Answer => ({
  questionId: "Q1",
  selected: ["Magic link"],
  modifier: "none",
  answeredAt: "2026-09-25T10:00:00.000Z",
  ...overrides,
});

describe("answer encoding", () => {
  it("passes plain answers through, joining multi-select and Other", () => {
    expect(encodeAnswerText(answer({}))).toBe("Magic link");
    expect(encodeAnswerText(answer({ selected: ["A", "B"], otherText: " custom " }))).toBe(
      "A, B, custom",
    );
  });

  it("marks tentative answers", () => {
    expect(encodeAnswerText(answer({ modifier: "tentative" }))).toBe(
      "Magic link (TENTATIVE — log as a risk, re-ask if it matters)",
    );
  });

  it("parks with an explicit or fallback assumption", () => {
    expect(encodeAnswerText(answer({ modifier: "parked", assumption: "OAuth later" }))).toBe(
      'PARKED — proceed assuming "OAuth later"; this is logged in PARKED.md.',
    );
    expect(encodeAnswerText(answer({ modifier: "parked", selected: [] }))).toContain(
      '"your recommended option"',
    );
  });

  it("keys tool answers by question text", () => {
    const questions: Question[] = [
      {
        id: "Q1",
        question: "Auth: which way?",
        header: "Auth",
        multiSelect: false,
        options: [
          { label: "Magic link", description: "" },
          { label: "OAuth", description: "" },
        ],
      },
      {
        id: "Q2",
        question: "Unanswered?",
        header: "X",
        multiSelect: false,
        options: [
          { label: "a", description: "" },
          { label: "b", description: "" },
        ],
      },
    ];
    expect(encodeAnswersForTool(questions, [answer({})])).toEqual({
      "Auth: which way?": "Magic link",
    });
  });

  it("builds revision turns", () => {
    expect(
      encodeRevisionTurn({
        questionId: "Q4",
        previous: "A",
        next: "B",
        dependentDecisionIds: ["D2"],
      }),
    ).toBe(
      'REVISION of Q4: was "A", now "B". Re-check decisions D2 that depended on it and report what changes.',
    );
  });
});

describe("wire events", () => {
  it("accepts valid and rejects malformed events", () => {
    expect(
      parseServerEvent(JSON.stringify({ type: "hello", protocolVersion: 1, serverVersion: "0" })),
    ).toMatchObject({ type: "hello" });
    expect(parseServerEvent("not json")).toBeNull();
    expect(
      parseClientEvent(
        JSON.stringify({ type: "start-session", repoPath: "", mode: "deep-interview", topic: "" }),
      ),
    ).toBeNull();
    expect(
      parseClientEvent(
        JSON.stringify({ type: "start-session", repoPath: "C:/x", mode: "brainstorm", topic: "t" }),
      ),
    ).toMatchObject({ type: "start-session", mode: "brainstorm" });
  });
});
