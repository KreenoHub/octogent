// @vitest-environment jsdom
import type { Answer } from "@octogent/octoplan-protocol";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionRoundCard } from "../../web/src/qcards";
import { FIXED_NOW, fourQuestionRound, makeAnswer } from "./fixtures";

const answers: Answer[] = [
  makeAnswer({ questionId: "Q1", selected: ["Password"], answeredAt: "2026-09-25T11:00:00.000Z" }),
  makeAnswer({ questionId: "Q2", selected: ["Web"], otherText: "Desktop" }),
  makeAnswer({ questionId: "Q3", selected: ["Top bar"], modifier: "tentative" }),
  makeAnswer({ questionId: "Q4", modifier: "parked", assumption: "Postgres (Recommended)" }),
  // A revision of Q1, newer than the original.
  makeAnswer({ questionId: "Q1", selected: ["OAuth"], revisionOf: "Q1" }),
];

const chipRows = () =>
  within(screen.getByRole("list", { name: "Answered round 1" })).getAllByRole(
    "listitem",
  ) as HTMLElement[];

const renderCard = (props: { compact?: boolean; onRevise?: (answer: Answer) => void } = {}) =>
  render(
    <QuestionRoundCard
      round={fourQuestionRound}
      answered={answers}
      onAnswer={vi.fn()}
      onRevise={props.onRevise ?? vi.fn()}
      {...(props.compact === undefined ? {} : { compact: props.compact })}
    />,
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(FIXED_NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("QuestionRoundCard answer chips (D25)", () => {
  it("renders one chip per question with header → answer, badges and a revised marker", () => {
    renderCard();
    expect(screen.queryByRole("listbox")).toBeNull();
    const rows = chipRows();
    expect(rows.map((row) => row.getAttribute("data-question-id"))).toEqual([
      "Q1",
      "Q2",
      "Q3",
      "Q4",
    ]);
    const [q1, q2, q3, q4] = rows as [HTMLElement, HTMLElement, HTMLElement, HTMLElement];
    expect(within(q1).getByText("Auth → OAuth")).toBeInTheDocument();
    expect(within(q1).getByText("revised")).toBeInTheDocument();
    expect(within(q2).getByText("Platforms → Web, Desktop")).toBeInTheDocument();
    expect(within(q2).queryByText("revised")).toBeNull();
    expect(within(q3).getByText("Layout → Top bar")).toBeInTheDocument();
    expect(within(q3).getByText("TENTATIVE")).toBeInTheDocument();
    expect(within(q4).getByText("Data → parked: Postgres (Recommended)")).toBeInTheDocument();
    expect(within(q4).getByText("PARKED")).toBeInTheDocument();
  });

  it("clicking a chip expands the full card on that question, and R revises it", () => {
    const onRevise = vi.fn<(answer: Answer) => void>();
    renderCard({ onRevise });
    fireEvent.click(within(chipRows()[2] as HTMLElement).getByRole("button"));
    const list = screen.getByRole("listbox", { name: "Answered round 1" });
    expect(document.activeElement).toBe(list);
    expect(within(list).getByRole("option", { selected: true })).toHaveAttribute(
      "data-question-id",
      "Q3",
    );
    expect(screen.getByText("↑/↓ select · R revise")).toBeInTheDocument();

    fireEvent.keyDown(list, { key: "r" });
    const editor = screen.getByRole("form", { name: "Revise Q3" });
    fireEvent.keyDown(editor, { key: "t" });
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(onRevise).toHaveBeenCalledWith({
      questionId: "Q3",
      selected: ["Top bar"],
      modifier: "none",
      revisionOf: "Q3",
      answeredAt: FIXED_NOW,
    });

    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(chipRows()).toHaveLength(4);
  });

  it("R on a focused chip opens its revise editor; Expand is a button", () => {
    renderCard();
    const chip = within(chipRows()[1] as HTMLElement).getByRole("button");
    chip.focus();
    fireEvent.keyDown(chip, { key: "R" });
    const editor = screen.getByRole("form", { name: "Revise Q2" });
    expect(document.activeElement).toBe(editor);
    expect(within(editor).getByRole("textbox", { name: /other/i })).toHaveValue("Desktop");

    fireEvent.keyDown(editor, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByRole("listbox", { name: "Answered round 1" })).toBeInTheDocument();
  });

  it("compact={false} always shows the full answered card", () => {
    renderCard({ compact: false });
    expect(screen.queryByRole("list", { name: "Answered round 1" })).toBeNull();
    expect(screen.queryByRole("button", { name: /expand|collapse/i })).toBeNull();
    const list = screen.getByRole("listbox", { name: "Answered round 1" });
    expect(within(list).getAllByRole("option")).toHaveLength(4);
    expect(within(list).getAllByRole("list", { name: "Revision chain" })).toHaveLength(4);
  });

  it("pending rounds still render the editor", () => {
    render(<QuestionRoundCard round={fourQuestionRound} onAnswer={vi.fn()} onRevise={vi.fn()} />);
    expect(screen.getByRole("form", { name: "Question round 1" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Answered round 1" })).toBeNull();
  });
});

describe("option description clamp (D43)", () => {
  const descriptionOf = (name: string) => {
    const id = screen.getByRole("radio", { name }).getAttribute("aria-describedby") ?? "";
    return document.getElementById(id) as HTMLElement;
  };

  it("clamps descriptions to one line and shows the full text when the option has focus", () => {
    render(<QuestionRoundCard round={fourQuestionRound} onAnswer={vi.fn()} onRevise={vi.fn()} />);
    const password = descriptionOf("Password");
    expect(password).toHaveClass("qc-option-desc--clamped");
    expect(password).toHaveAttribute("title", "Classic email and password.");
    expect(password).toHaveTextContent("Classic email and password.");

    act(() => screen.getByRole("radio", { name: "Password" }).focus());
    expect(password).not.toHaveClass("qc-option-desc--clamped");
    expect(descriptionOf("OAuth")).toHaveClass("qc-option-desc--clamped");

    act(() => screen.getByRole("radio", { name: "Password" }).blur());
    expect(password).toHaveClass("qc-option-desc--clamped");
  });
});
