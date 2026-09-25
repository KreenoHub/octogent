// @vitest-environment jsdom
import type { Answer } from "@octogent/octoplan-protocol";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnsweredQuestions, QuestionRoundCard } from "../../web/src/qcards";
import { FIXED_NOW, fourQuestionRound, makeAnswer } from "./fixtures";

const key = (target: Element, value: string) => fireEvent.keyDown(target, { key: value });

const history: Answer[] = [
  makeAnswer({ questionId: "Q1", selected: ["Password"], answeredAt: "2026-09-25T11:00:00.000Z" }),
  makeAnswer({
    questionId: "Q3",
    selected: ["Top bar"],
    modifier: "tentative",
    answeredAt: "2026-09-25T11:05:00.000Z",
  }),
  makeAnswer({
    questionId: "Q4",
    modifier: "parked",
    assumption: "Postgres (Recommended)",
    answeredAt: "2026-09-25T11:02:00.000Z",
  }),
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(FIXED_NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AnsweredQuestions", () => {
  it("lists answered questions newest first with answers and modifier badges", () => {
    render(<AnsweredQuestions rounds={[fourQuestionRound]} answers={history} onRevise={vi.fn()} />);
    const list = screen.getByRole("listbox", { name: "Answered questions" });
    const entries = within(list).getAllByRole("option");
    expect(entries.map((entry) => entry.getAttribute("data-question-id"))).toEqual([
      "Q3",
      "Q4",
      "Q1",
    ]);
    expect(within(entries[0] as HTMLElement).getByText("TENTATIVE")).toBeInTheDocument();
    expect(within(entries[1] as HTMLElement).getByText("PARKED")).toBeInTheDocument();
    expect(
      within(entries[1] as HTMLElement).getByText(/Postgres \(Recommended\)/),
    ).toBeInTheDocument();
    expect(within(entries[2] as HTMLElement).getByText("Password")).toBeInTheDocument();
    expect(entries[0]).toHaveAttribute("aria-selected", "true");
  });

  it("shows an empty state when nothing is answered", () => {
    render(<AnsweredQuestions rounds={[fourQuestionRound]} answers={[]} onRevise={vi.fn()} />);
    expect(screen.getByText("No answered questions yet.")).toBeInTheDocument();
  });

  it("revises a tentative answer to a plain one and renders the revision chain", () => {
    const onRevise = vi.fn<(answer: Answer) => void>();
    const { rerender } = render(
      <AnsweredQuestions rounds={[fourQuestionRound]} answers={history} onRevise={onRevise} />,
    );
    const list = screen.getByRole("listbox", { name: "Answered questions" });
    list.focus();
    key(list, "ArrowDown");
    key(list, "ArrowUp");
    key(list, "r");

    const editor = screen.getByRole("form", { name: "Revise Q3" });
    expect(document.activeElement).toBe(editor);
    expect(within(editor).getByRole("radio", { name: "Top bar" })).toBeChecked();
    expect(within(editor).getByText("TENTATIVE")).toBeInTheDocument();

    key(editor, "t");
    expect(within(editor).getByTestId("qc-receive")).toHaveTextContent(
      "Claude will receive: Top bar",
    );
    key(editor, "Enter");

    const revised: Answer = {
      questionId: "Q3",
      selected: ["Top bar"],
      modifier: "none",
      revisionOf: "Q3",
      answeredAt: FIXED_NOW,
    };
    expect(onRevise).toHaveBeenCalledTimes(1);
    expect(onRevise).toHaveBeenCalledWith(revised);
    expect(screen.queryByRole("form", { name: "Revise Q3" })).toBeNull();

    rerender(
      <AnsweredQuestions
        rounds={[fourQuestionRound]}
        answers={[...history, revised]}
        onRevise={onRevise}
      />,
    );
    const entry = within(screen.getByRole("listbox", { name: "Answered questions" })).getAllByRole(
      "option",
    )[0] as HTMLElement;
    expect(entry).toHaveAttribute("data-question-id", "Q3");
    const chain = within(entry).getByRole("list", { name: "Revision chain" });
    const steps = within(chain).getAllByRole("listitem");
    expect(steps).toHaveLength(2);
    expect(steps[0]?.querySelector("s")).toHaveTextContent("Top bar");
    expect(steps[0]).toHaveTextContent("TENTATIVE");
    expect(steps[1]?.querySelector("s")).toBeNull();
    expect(steps[1]).toHaveTextContent("Top bar");
    expect(steps[1]).not.toHaveTextContent("TENTATIVE");
  });

  it("Esc closes the revise editor without emitting", () => {
    const onRevise = vi.fn();
    render(
      <AnsweredQuestions rounds={[fourQuestionRound]} answers={history} onRevise={onRevise} />,
    );
    const list = screen.getByRole("listbox", { name: "Answered questions" });
    list.focus();
    key(list, "R");
    const editor = screen.getByRole("form", { name: "Revise Q3" });
    key(editor, "Escape");
    expect(screen.queryByRole("form", { name: "Revise Q3" })).toBeNull();
    expect(document.activeElement).toBe(list);
    expect(onRevise).not.toHaveBeenCalled();
  });

  it("clicking an entry selects it", () => {
    render(<AnsweredQuestions rounds={[fourQuestionRound]} answers={history} onRevise={vi.fn()} />);
    const entries = screen.getAllByRole("option");
    fireEvent.click(entries[2] as HTMLElement);
    expect(entries[2]).toHaveAttribute("aria-selected", "true");
  });
});

describe("QuestionRoundCard answered state", () => {
  it("shows chosen labels and badges, and R on the selected question revises it", () => {
    const onRevise = vi.fn<(answer: Answer) => void>();
    render(
      <QuestionRoundCard
        round={fourQuestionRound}
        answered={[
          ...history,
          makeAnswer({ questionId: "Q2", selected: ["Web"], otherText: "Desktop" }),
        ]}
        onAnswer={vi.fn()}
        onRevise={onRevise}
      />,
    );
    expect(screen.queryByRole("form", { name: /question round/i })).toBeNull();
    const list = screen.getByRole("listbox", { name: /answered round/i });
    const entries = within(list).getAllByRole("option");
    expect(entries.map((entry) => entry.getAttribute("data-question-id"))).toEqual([
      "Q1",
      "Q2",
      "Q3",
      "Q4",
    ]);
    expect(within(entries[1] as HTMLElement).getByText("Web, Desktop")).toBeInTheDocument();

    list.focus();
    key(list, "ArrowDown");
    key(list, "r");
    const editor = screen.getByRole("form", { name: "Revise Q2" });
    expect(within(editor).getByRole("checkbox", { name: "Web" })).toBeChecked();
    expect(within(editor).getByRole("textbox", { name: /other/i })).toHaveValue("Desktop");
    key(editor, "2");
    key(editor, "Enter");
    expect(onRevise).toHaveBeenCalledWith({
      questionId: "Q2",
      selected: ["Web", "iOS"],
      otherText: "Desktop",
      modifier: "none",
      revisionOf: "Q2",
      answeredAt: FIXED_NOW,
    });
  });
});
