// @vitest-environment jsdom
import type { Answer } from "@octogent/octoplan-protocol";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionRoundCard } from "../../web/src/qcards";
import { FIXED_NOW, singleQuestionRound } from "./fixtures";

const key = (target: Element, value: string) => fireEvent.keyDown(target, { key: value });

const renderSingle = (questionIndex: number) => {
  const onAnswer = vi.fn<(answers: Answer[]) => void>();
  render(
    <QuestionRoundCard
      round={singleQuestionRound(questionIndex)}
      onAnswer={onAnswer}
      onRevise={vi.fn()}
    />,
  );
  const card = screen.getByRole("form", { name: /question round/i });
  card.focus();
  return { card, onAnswer };
};

const receive = () => screen.getByTestId("qc-receive");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(FIXED_NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("tentative modifier", () => {
  it("T toggles tentative on and off, with badge and encoded preview", () => {
    const { card, onAnswer } = renderSingle(1);
    key(card, "1");
    key(card, "t");
    expect(screen.getByText("TENTATIVE")).toBeInTheDocument();
    expect(receive()).toHaveTextContent(
      "Claude will receive: Web (TENTATIVE — log as a risk, re-ask if it matters)",
    );

    key(card, "t");
    expect(screen.queryByText("TENTATIVE")).toBeNull();
    expect(receive()).toHaveTextContent("Claude will receive: Web");
    expect(receive()).not.toHaveTextContent("TENTATIVE");

    key(card, "Enter");
    expect(onAnswer).toHaveBeenCalledWith([
      { questionId: "Q2", selected: ["Web"], modifier: "none", answeredAt: FIXED_NOW },
    ]);
  });

  it("a tentative question with no selection is not yet answered", () => {
    const { card, onAnswer } = renderSingle(1);
    key(card, "t");
    key(card, "Enter");
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.queryByTestId("qc-receive")).toBeNull();
  });
});

describe("park modifier", () => {
  it("P pre-fills the (Recommended) label, accepts an edit and encodes the assumption", () => {
    const { card, onAnswer } = renderSingle(0);
    key(card, "2");
    key(card, "p");
    const input = screen.getByRole("textbox", { name: /assumption/i });
    expect(input).toHaveValue("Magic link (Recommended)");
    fireEvent.change(input, { target: { value: "Magic link, revisit for SSO" } });
    expect(screen.getByText("PARKED")).toBeInTheDocument();
    expect(receive()).toHaveTextContent(
      'Claude will receive: PARKED — proceed assuming "Magic link, revisit for SSO"; this is logged in PARKED.md.',
    );
    key(input, "Escape");
    expect(document.activeElement).toBe(card);
    key(card, "Enter");
    expect(onAnswer).toHaveBeenCalledWith([
      {
        questionId: "Q1",
        selected: ["Password"],
        modifier: "parked",
        assumption: "Magic link, revisit for SSO",
        answeredAt: FIXED_NOW,
      },
    ]);
  });

  it("P with no selection parks the question and counts as answered", () => {
    const { card, onAnswer } = renderSingle(3);
    key(card, "p");
    const input = screen.getByRole("textbox", { name: /assumption/i });
    expect(input).toHaveValue("Postgres (Recommended)");
    expect(receive()).toHaveTextContent(
      'Claude will receive: PARKED — proceed assuming "Postgres (Recommended)"; this is logged in PARKED.md.',
    );
    key(input, "Enter");
    expect(onAnswer).toHaveBeenCalledWith([
      {
        questionId: "Q4",
        selected: [],
        modifier: "parked",
        assumption: "Postgres (Recommended)",
        answeredAt: FIXED_NOW,
      },
    ]);
  });

  it("P pre-fills an empty assumption when no option is recommended", () => {
    const { card } = renderSingle(1);
    key(card, "p");
    expect(screen.getByRole("textbox", { name: /assumption/i })).toHaveValue("");
    expect(receive()).toHaveTextContent(
      'Claude will receive: PARKED — proceed assuming "your recommended option"; this is logged in PARKED.md.',
    );
  });

  it("P again un-parks the question", () => {
    const { card } = renderSingle(0);
    key(card, "p");
    const input = screen.getByRole("textbox", { name: /assumption/i });
    key(input, "Escape");
    key(card, "p");
    expect(screen.queryByText("PARKED")).toBeNull();
    expect(screen.queryByRole("textbox", { name: /assumption/i })).toBeNull();
  });
});
