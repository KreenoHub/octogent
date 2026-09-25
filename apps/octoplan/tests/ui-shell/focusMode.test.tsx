// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { answer, plan, round, session } from "./fixtures";
import { renderCockpit } from "./renderCockpit";

const setup = () => {
  const view = renderCockpit();
  view.emit(
    { type: "sessions", sessions: [session()] },
    {
      type: "plan",
      repoPath: session().repoPath,
      plan: plan({
        coverage: {
          dimensions: [
            { id: "problem", status: "covered", confidence: "high", questionIds: [], note: "" },
            { id: "users", status: "covered", confidence: "high", questionIds: [], note: "" },
            { id: "scope", status: "partial", confidence: "low", questionIds: [], note: "" },
          ],
        },
      }),
    },
    { type: "question-round", round: round({ id: "r0", index: 0 }) },
    {
      type: "round-answered",
      sessionId: "s1",
      roundId: "r0",
      answers: [answer("Q1"), answer("Q2")],
    },
    { type: "question-round", round: round({ id: "r1", index: 1 }) },
  );
  return view;
};

const focus = () => screen.queryByRole("dialog", { name: "Focus mode" });

describe("focus mode", () => {
  it("toggles on F and exits on F or Escape", () => {
    setup();
    expect(focus()).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "f" });
    expect(focus()).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(focus()).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "F" });
    expect(focus()).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "F" });
    expect(focus()).not.toBeInTheDocument();
  });

  it("ignores F while typing in the composer", () => {
    setup();
    const composer = screen.getByRole("textbox", { name: "Message Claude" });
    composer.focus();
    fireEvent.keyDown(composer, { key: "f" });
    expect(focus()).not.toBeInTheDocument();
  });

  it("shows one question at a time with n / ~m progress and the coverage bar", () => {
    setup();
    fireEvent.keyDown(window, { key: "f" });
    const overlay = focus() as HTMLElement;
    // 2 answered earlier + 2 pending in r1 -> question 3 of ~4.
    expect(within(overlay).getByTestId("focus-progress")).toHaveTextContent("3 / ~4");
    // 2 of 12 dimensions covered.
    const bar = within(overlay).getByRole("progressbar", { name: "Coverage" });
    expect(bar).toHaveAttribute("value", "17");
    expect(overlay).toHaveTextContent("COVERAGE 17%");
    const slot = within(overlay).getByTestId("question-round-slot");
    expect(within(slot).getByText(/Who is the primary user/)).toBeInTheDocument();
    expect(within(slot).queryByText(/What is out of scope/)).not.toBeInTheDocument();

    fireEvent.click(within(overlay).getByRole("button", { name: "Skip →" }));
    expect(within(overlay).getByTestId("focus-progress")).toHaveTextContent("4 / ~4");
    expect(within(overlay).getByText(/What is out of scope/)).toBeInTheDocument();
  });

  it("collects answers per question and sends one answer-round at the end", () => {
    const { transport } = setup();
    fireEvent.keyDown(window, { key: "f" });
    const overlay = focus() as HTMLElement;
    fireEvent.click(within(overlay).getByRole("button", { name: "Answer with first options" }));
    expect(transport.sent).toEqual([]);
    expect(within(overlay).getByTestId("focus-progress")).toHaveTextContent("4 / ~4");
    fireEvent.click(within(overlay).getByRole("button", { name: "Answer with first options" }));
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({
      type: "answer-round",
      sessionId: "s1",
      roundId: "r1",
      answers: [{ questionId: "Q1" }, { questionId: "Q2" }],
    });
  });

  it("says so when nothing is pending", () => {
    const { emit } = renderCockpit();
    emit({ type: "sessions", sessions: [session()] });
    fireEvent.keyDown(window, { key: "f" });
    expect(focus()).toHaveTextContent("No unanswered questions");
  });
});
