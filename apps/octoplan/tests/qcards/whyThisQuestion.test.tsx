// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuestionRoundCard } from "../../web/src/qcards";
import { fourQuestionRound } from "./fixtures";

describe("why this question", () => {
  it("shows the coverage dimension label in a collapsed details element", () => {
    render(<QuestionRoundCard round={fourQuestionRound} onAnswer={vi.fn()} onRevise={vi.fn()} />);
    const q1 = within(screen.getByTestId("qc-question-Q1"));
    const summary = q1.getByText("Why this question");
    const details = summary.closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(q1.getByText("Architecture & stack")).toBeInTheDocument();
  });

  it("renders nothing when the question has no dimension", () => {
    render(<QuestionRoundCard round={fourQuestionRound} onAnswer={vi.fn()} onRevise={vi.fn()} />);
    const q2 = screen.getByTestId("qc-question-Q2");
    expect(within(q2).queryByText("Why this question")).toBeNull();
    expect(q2.querySelector("details")).toBeNull();
  });
});
