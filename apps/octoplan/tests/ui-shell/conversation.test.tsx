// @vitest-environment jsdom
import type { ServerEvent } from "@octogent/octoplan-protocol";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { answer, round, sectionBlock, session } from "./fixtures";
import { answerFirstOptions, renderCockpit } from "./renderCockpit";

const roundBlock: ServerEvent = {
  type: "block",
  sessionId: "s1",
  block: { kind: "question-round", id: "b-r1", roundId: "r1", at: "x" },
};

const withSession = () => {
  const view = renderCockpit();
  view.emit({ type: "sessions", sessions: [session()] });
  return view;
};

describe("conversation stream", () => {
  it("collapses long sections to heading + first line and toggles them", () => {
    const { emit } = withSession();
    emit(
      { type: "block", sessionId: "s1", block: sectionBlock("b1", "Short", 3) },
      { type: "block", sessionId: "s1", block: sectionBlock("b2", "Long", 20) },
    );
    const long = screen.getByRole("article", { name: "Long" });
    expect(within(long).getByText("line 1 of Long")).toBeInTheDocument();
    expect(within(long).queryByText(/line 20 of Long/)).not.toBeInTheDocument();

    fireEvent.click(within(long).getByRole("button", { name: "Expand" }));
    expect(within(long).getByText(/line 20 of Long/)).toBeInTheDocument();
    fireEvent.click(within(long).getByRole("button", { name: "Collapse" }));
    expect(within(long).queryByText(/line 20 of Long/)).not.toBeInTheDocument();

    const short = screen.getByRole("article", { name: "Short" });
    expect(within(short).getByText(/line 3 of Short/)).toBeInTheDocument();
    expect(within(short).queryByRole("button", { name: "Expand" })).not.toBeInTheDocument();
  });

  it("renders tool blocks as one-line rows and user blocks as bubbles", () => {
    const { emit } = withSession();
    emit(
      {
        type: "block",
        sessionId: "s1",
        block: { kind: "tool", id: "t1", name: "Read", summary: "docs/SPEC.md", at: "x" },
      },
      {
        type: "block",
        sessionId: "s1",
        block: { kind: "user", id: "u1", text: "Hello Claude", at: "x" },
      },
    );
    expect(screen.getByTestId("tool-row")).toHaveTextContent("Read");
    expect(screen.getByTestId("tool-row")).toHaveTextContent("docs/SPEC.md");
    expect(screen.getByText("Hello Claude").closest(".op-bubble")).not.toBeNull();
  });

  it("keeps pending rounds in the Unanswered tray until round-answered arrives", () => {
    const { emit } = withSession();
    emit({ type: "question-round", round: round() }, roundBlock);
    const tray = screen.getByRole("region", { name: "Unanswered" });
    expect(within(tray).getAllByRole("listitem")).toHaveLength(1);
    expect(within(tray).getByText(/Users/)).toBeInTheDocument();
    expect(screen.getAllByTestId("question-round-slot")).toHaveLength(1);

    emit({
      type: "round-answered",
      sessionId: "s1",
      roundId: "r1",
      answers: [answer("Q1"), answer("Q2", { selected: ["Cloud"] })],
    });
    expect(screen.queryByRole("region", { name: "Unanswered" })).not.toBeInTheDocument();
  });

  it("wires the question slot to answer-round", () => {
    const { emit, transport } = withSession();
    emit({ type: "question-round", round: round() }, roundBlock);
    answerFirstOptions(screen.getByTestId("question-round-slot"));
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({
      type: "answer-round",
      sessionId: "s1",
      roundId: "r1",
      answers: [
        { questionId: "Q1", selected: ["Solo dev"] },
        { questionId: "Q2", selected: ["Mobile"] },
      ],
    });
  });

  it("composer sends on Enter and keeps Shift+Enter for newlines", () => {
    const { transport } = withSession();
    const composer = screen.getByRole("textbox", { name: "Message Claude" });
    fireEvent.change(composer, { target: { value: "first line" } });
    fireEvent.keyDown(composer, { key: "Enter", shiftKey: true });
    expect(transport.sent).toEqual([]);

    fireEvent.change(composer, { target: { value: "  Plan the MVP  " } });
    fireEvent.keyDown(composer, { key: "Enter" });
    expect(transport.sent).toEqual([
      { type: "send-message", sessionId: "s1", text: "Plan the MVP" },
    ]);
    expect(composer).toHaveValue("");

    fireEvent.keyDown(composer, { key: "Enter" });
    expect(transport.sent).toHaveLength(1);
  });

  it("disables the composer without a session", () => {
    renderCockpit();
    expect(screen.getByRole("textbox", { name: "Message Claude" })).toBeDisabled();
  });
});
