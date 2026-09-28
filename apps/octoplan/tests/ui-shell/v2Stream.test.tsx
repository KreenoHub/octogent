// @vitest-environment jsdom
import type { MessageBlock, ServerEvent } from "@octogent/octoplan-protocol";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { groupStream, summarizeTools } from "../../web/src/app/streamView";
import { answer, round, sectionBlock, session, toolBlock } from "./fixtures";
import { renderCockpit } from "./renderCockpit";

const block = (b: MessageBlock): ServerEvent => ({ type: "block", sessionId: "s1", block: b });

const roundBlock = (roundId: string, id = `b-${roundId}`) =>
  block({ kind: "question-round", id, roundId, at: "x" });

const withSession = (overrides: Parameters<typeof session>[0] = {}) => {
  const view = renderCockpit();
  view.emit({ type: "sessions", sessions: [session(overrides)] });
  return view;
};

/** 4 reads and 3 recorded decisions, in one turn. */
const SEVEN_TOOLS = [
  toolBlock("t1", "Read", "Read · docs/SPEC.md"),
  toolBlock("t2", "Read", "Read · docs/GOAL.md"),
  toolBlock("t3", "mcp__octoplan__plan_record_decision", "plan_record_decision · Dock"),
  toolBlock("t4", "Read", "Read · DECISIONS.md"),
  toolBlock("t5", "mcp__octoplan__plan_record_decision", "plan_record_decision · Digest"),
  toolBlock("t6", "Read", "Read · RISKS.md"),
  toolBlock("t7", "mcp__octoplan__plan_record_decision", "plan_record_decision · Chips"),
];

describe("docked answer panel (D14)", () => {
  it("keeps the pending round in a dock above the composer, however long the stream", () => {
    const { emit } = withSession();
    const long = Array.from({ length: 30 }, (_, i) =>
      block(sectionBlock(`s${i}`, `Part ${i}`, 25)),
    );
    emit(...long, { type: "question-round", round: round() }, roundBlock("r1"));
    emit(block(sectionBlock("tail", "Why this matters", 12)));

    const pane = screen.getByRole("region", { name: "Conversation" });
    const stream = within(pane).getByTestId("stream");
    const dock = within(pane).getByRole("region", { name: "Answer dock" });
    const composer = within(pane).getByRole("textbox", { name: "Message Claude" });
    // Outside the scrolling stream, between it and the composer.
    expect(stream.contains(dock)).toBe(false);
    expect(stream.compareDocumentPosition(dock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dock.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(dock).getByTestId("question-round-slot")).toHaveAttribute("data-round-id", "r1");
    expect(within(dock).getByText("ANSWER · ROUND 1")).toBeInTheDocument();
    // R3: the latest prose digest line sits above the round.
    expect(within(dock).getByTestId("dock-digest")).toHaveTextContent(
      "Why this mattersline 1 of Why this matters",
    );
    // The stream keeps a one-line stub that jumps to the dock.
    const stub = within(stream).getByTestId("round-stub");
    expect(stub).toHaveTextContent("ROUND 1");
    fireEvent.click(stub);
    expect(dock.contains(document.activeElement)).toBe(true);
  });

  it("docks the oldest pending round and counts the rest", () => {
    const { emit } = withSession();
    emit(
      { type: "question-round", round: round() },
      roundBlock("r1"),
      { type: "question-round", round: round({ id: "r2", index: 2 }) },
      roundBlock("r2"),
    );
    const dock = screen.getByRole("region", { name: "Answer dock" });
    expect(within(dock).getByTestId("question-round-slot")).toHaveAttribute("data-round-id", "r1");
    expect(within(dock).getByText("+1 more waiting")).toBeInTheDocument();
    expect(screen.getAllByTestId("round-stub")).toHaveLength(2);

    emit({ type: "round-answered", sessionId: "s1", roundId: "r1", answers: [answer("Q1")] });
    expect(within(dock).getByTestId("question-round-slot")).toHaveAttribute("data-round-id", "r2");
    expect(screen.getAllByTestId("round-stub")).toHaveLength(1);
  });

  it("shows only the active session's rounds", () => {
    const { emit } = renderCockpit();
    emit(
      { type: "sessions", sessions: [session(), session({ id: "s2", title: "Other" })] },
      { type: "question-round", round: round({ id: "r9", sessionId: "s2" }) },
    );
    expect(screen.queryByRole("region", { name: "Answer dock" })).not.toBeInTheDocument();
  });
});

describe("one-line prose digest (D15)", () => {
  it("renders a 40-line reply as one line and the full text after a click", () => {
    const { emit } = withSession();
    const reply = sectionBlock("b1", "Architecture", 40);
    emit(block(reply));
    const card = screen.getByRole("article", { name: "Architecture" });
    const digest = within(card).getByTestId("prose-digest");
    expect(digest).toHaveTextContent("Architectureline 1 of Architecture");
    expect(within(card).queryByText(/line 2 of Architecture/)).not.toBeInTheDocument();

    fireEvent.click(digest);
    const text = card.querySelector(".op-card-body")?.textContent ?? "";
    for (let i = 1; i <= 40; i++) expect(text).toContain(`line ${i} of Architecture`);
  });

  it("falls back to the first line when a section has no heading", () => {
    const { emit } = withSession();
    emit(block({ kind: "section", id: "b1", heading: "", markdown: "First.\nSecond.", at: "x" }));
    expect(screen.getByTestId("prose-digest")).toHaveTextContent(/^First\.$/);
  });
});

describe("grouped tool rows (D19)", () => {
  it("summarizes calls per kind in first-seen order", () => {
    const tools = SEVEN_TOOLS.flatMap((b) => (b.kind === "tool" ? [b] : []));
    expect(summarizeTools(tools)).toBe("Read 4 files, recorded 3 decisions");
    expect(summarizeTools(tools.slice(0, 1))).toBe("Read 1 file");
    const items = groupStream([...SEVEN_TOOLS, sectionBlock("x", "X", 1), toolBlock("t8", "Read")]);
    expect(items.map((item) => item.kind)).toEqual(["tools", "block", "block"]);
  });

  it("turns 7 tool calls into one row with the right counts that expands", () => {
    const { emit } = withSession();
    emit(...SEVEN_TOOLS.map(block));
    const groups = screen.getAllByTestId("tool-group");
    expect(groups).toHaveLength(1);
    const toggle = within(groups[0] as HTMLElement).getByRole("button");
    expect(toggle).toHaveTextContent("7 tools");
    expect(toggle).toHaveTextContent("Read 4 files, recorded 3 decisions");
    expect(screen.queryAllByTestId("tool-row")).toHaveLength(0);

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const rows = within(groups[0] as HTMLElement).getAllByTestId("tool-row");
    expect(rows).toHaveLength(7);
    expect(rows[2]).toHaveTextContent("plan_record_decision");
  });

  it("starts a new group after prose", () => {
    const { emit } = withSession();
    emit(
      block(toolBlock("t1", "Read")),
      block(toolBlock("t2", "Grep")),
      block(sectionBlock("p", "Found it", 1)),
      block(toolBlock("t3", "Read")),
    );
    expect(screen.getAllByTestId("tool-group")).toHaveLength(1);
    expect(screen.getAllByTestId("tool-row")).toHaveLength(1);
  });
});

describe("expand-all hotkey (R3)", () => {
  it("E expands every digest, tool group and answered round, and E again folds them", () => {
    const { emit } = withSession();
    emit(
      block(sectionBlock("p1", "Context", 20)),
      ...SEVEN_TOOLS.slice(0, 3).map(block),
      { type: "question-round", round: round() },
      roundBlock("r1"),
      { type: "round-answered", sessionId: "s1", roundId: "r1", answers: [answer("Q1")] },
    );
    const stream = screen.getByTestId("stream");
    const folded = () => {
      expect(within(stream).getByTestId("prose-digest")).toBeInTheDocument();
      expect(within(stream).getByTestId("tool-group").querySelector("button")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      expect(within(stream).getByTestId("question-round-slot")).toHaveAttribute(
        "data-compact",
        "true",
      );
    };
    folded();

    fireEvent.keyDown(window, { key: "e" });
    expect(within(stream).queryByTestId("prose-digest")).not.toBeInTheDocument();
    expect(within(stream).getByText(/line 20 of Context/)).toBeInTheDocument();
    expect(within(stream).getAllByTestId("tool-row")).toHaveLength(3);
    expect(within(stream).getByTestId("question-round-slot")).toHaveAttribute(
      "data-compact",
      "false",
    );

    fireEvent.keyDown(window, { key: "E" });
    folded();
  });

  it("new blocks arriving while expanded open expanded, and E is ignored while typing", () => {
    const { emit } = withSession();
    fireEvent.keyDown(window, { key: "e" });
    emit(block(sectionBlock("p1", "Late", 5)));
    expect(screen.queryByTestId("prose-digest")).not.toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Message Claude" }), { key: "e" });
    expect(screen.queryByTestId("prose-digest")).not.toBeInTheDocument();
  });
});

describe("restored sessions (D29)", () => {
  it("marks sessions rebuilt after a restart", () => {
    const { emit } = renderCockpit();
    emit({
      type: "sessions",
      sessions: [session({ restored: true }), session({ id: "s2", title: "Fresh" })],
    });
    const sidebar = screen.getByRole("complementary", { name: "Projects and sessions" });
    expect(within(sidebar).getAllByText("restored")).toHaveLength(1);
    expect(
      within(sidebar).getByRole("button", { name: /Plan Octoplan.*restored/ }),
    ).toBeInTheDocument();
  });
});
