// @vitest-environment jsdom
import type { Answer } from "@octogent/octoplan-protocol";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionRoundCard } from "../../web/src/qcards";
import { FIXED_NOW, fourQuestionRound, singleQuestionRound } from "./fixtures";

const key = (target: Element, value: string, init: Partial<KeyboardEventInit> = {}) =>
  fireEvent.keyDown(target, { key: value, ...init });

const renderCard = (round = fourQuestionRound) => {
  const onAnswer = vi.fn<(answers: Answer[]) => void>();
  const onRevise = vi.fn<(answer: Answer) => void>();
  render(<QuestionRoundCard round={round} onAnswer={onAnswer} onRevise={onRevise} />);
  const card = screen.getByRole("form", { name: /question round/i });
  card.focus();
  return { card, onAnswer, onRevise };
};

const question = (id: string) => screen.getByTestId(`qc-question-${id}`);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(FIXED_NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("QuestionRoundCard", () => {
  it("renders header chips, questions, options with descriptions and ARIA groups", () => {
    renderCard();
    expect(screen.getByText("Auth")).toBeInTheDocument();
    expect(screen.getByText("How should users sign in?")).toBeInTheDocument();
    expect(screen.getByText("Email a one-time link.")).toBeInTheDocument();

    const q1 = within(question("Q1"));
    expect(q1.getByRole("radiogroup", { name: "How should users sign in?" })).toBeInTheDocument();
    expect(q1.getAllByRole("radio")).toHaveLength(3);

    const q2 = within(question("Q2"));
    expect(q2.getByRole("group", { name: "Which platforms ship in v1?" })).toBeInTheDocument();
    expect(q2.getAllByRole("checkbox")).toHaveLength(3);
  });

  it("marks the (Recommended) option visually but keeps its label unchanged", () => {
    renderCard();
    const radio = within(question("Q1")).getByRole("radio", { name: "Magic link (Recommended)" });
    expect(radio.closest(".qc-option")).toHaveClass("qc-option--recommended");
    const other = within(question("Q1")).getByRole("radio", { name: "Password" });
    expect(other.closest(".qc-option")).not.toHaveClass("qc-option--recommended");
  });

  it("renders previews monospace beside the options only when a question has previews", () => {
    const { card } = renderCard();
    expect(within(question("Q1")).queryByTestId("qc-preview")).toBeNull();

    key(card, "Tab");
    key(card, "Tab");
    const preview = within(question("Q3")).getByTestId("qc-preview");
    expect(preview.tagName).toBe("PRE");
    expect(preview.textContent).toContain("|nav| main |");

    key(card, "2");
    expect(within(question("Q3")).getByTestId("qc-preview").textContent).toContain("|   nav    |");
  });

  it("keeps Enter disabled until every question is answered", () => {
    const { card, onAnswer } = renderCard();
    key(card, "1");
    key(card, "Enter");
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /confirm round/i })).toBeDisabled();
    expect(screen.getByText("1 / 4 answered")).toBeInTheDocument();
  });

  it("does not treat keys typed into the Other input as shortcuts", () => {
    const { card } = renderCard();
    key(card, "o");
    const input = within(question("Q1")).getByRole("textbox", { name: /other/i });
    expect(document.activeElement).toBe(input);
    key(input, "1");
    key(input, "t");
    expect(
      within(question("Q1")).getByRole("radio", { name: "Magic link (Recommended)" }),
    ).not.toBeChecked();
    expect(within(question("Q1")).queryByText("TENTATIVE")).toBeNull();
    key(input, "Escape");
    expect(document.activeElement).toBe(card);
  });

  it("answers a 4-question round keyboard-only, with one parked and one tentative answer", () => {
    const { card, onAnswer } = renderCard();

    // Q1: single select, pick option 1.
    key(card, "1");
    expect(
      within(question("Q1")).getByRole("radio", { name: "Magic link (Recommended)" }),
    ).toBeChecked();
    expect(within(question("Q1")).getByTestId("qc-receive")).toHaveTextContent(
      "Claude will receive: Magic link (Recommended)",
    );

    // Q2: multi select via numbers, the cursor and Space, plus Other.
    key(card, "Tab");
    key(card, "1");
    key(card, "3");
    key(card, " ");
    key(card, "ArrowUp");
    key(card, " ");
    key(card, "O");
    const other = within(question("Q2")).getByRole("textbox", { name: /other/i });
    expect(document.activeElement).toBe(other);
    fireEvent.change(other, { target: { value: "Desktop  " } });
    key(other, "Escape");
    expect(document.activeElement).toBe(card);
    expect(within(question("Q2")).getByRole("checkbox", { name: "Web" })).toBeChecked();
    expect(within(question("Q2")).getByRole("checkbox", { name: "iOS" })).toBeChecked();
    expect(within(question("Q2")).getByRole("checkbox", { name: "Android" })).not.toBeChecked();
    expect(within(question("Q2")).getByTestId("qc-receive")).toHaveTextContent(
      "Claude will receive: Web, iOS, Desktop",
    );

    // Q3: preview question, pick 2 and mark tentative.
    key(card, "Tab");
    key(card, "2");
    key(card, "T");
    expect(within(question("Q3")).getByText("TENTATIVE")).toBeInTheDocument();

    // Q4: park with an edited assumption, then Enter from inside the input confirms.
    key(card, "Tab");
    key(card, "p");
    const assumption = within(question("Q4")).getByRole("textbox", { name: /assumption/i });
    expect(document.activeElement).toBe(assumption);
    expect(assumption).toHaveValue("Postgres (Recommended)");
    fireEvent.change(assumption, { target: { value: "Postgres with pgvector" } });
    expect(screen.getByText("4 / 4 answered")).toBeInTheDocument();
    key(assumption, "Enter");

    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer.mock.calls[0]?.[0]).toEqual([
      {
        questionId: "Q1",
        selected: ["Magic link (Recommended)"],
        modifier: "none",
        answeredAt: FIXED_NOW,
      },
      {
        questionId: "Q2",
        selected: ["Web", "iOS"],
        otherText: "Desktop",
        modifier: "none",
        answeredAt: FIXED_NOW,
      },
      { questionId: "Q3", selected: ["Top bar"], modifier: "tentative", answeredAt: FIXED_NOW },
      {
        questionId: "Q4",
        selected: [],
        modifier: "parked",
        assumption: "Postgres with pgvector",
        answeredAt: FIXED_NOW,
      },
    ] satisfies Answer[]);
  });

  it("a single-select Other replaces the picked option and Enter in the input confirms", () => {
    const { card, onAnswer } = renderCard(singleQuestionRound(0));
    key(card, "2");
    key(card, "o");
    const other = screen.getByRole("textbox", { name: /other/i });
    fireEvent.change(other, { target: { value: "Passkeys" } });
    expect(screen.getByRole("radio", { name: "Password" })).not.toBeChecked();
    key(other, "Enter");
    expect(onAnswer).toHaveBeenCalledWith([
      {
        questionId: "Q1",
        selected: [],
        otherText: "Passkeys",
        modifier: "none",
        answeredAt: FIXED_NOW,
      },
    ]);
  });

  it("moves between questions with Tab and Shift+Tab", () => {
    const { card } = renderCard();
    expect(question("Q1")).toHaveAttribute("data-active", "true");
    key(card, "Tab");
    expect(question("Q2")).toHaveAttribute("data-active", "true");
    key(card, "Tab", { shiftKey: true });
    expect(question("Q1")).toHaveAttribute("data-active", "true");
  });
});
