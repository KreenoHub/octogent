// @vitest-environment jsdom
import { DIGEST_HEADING } from "@octogent/octoplan-protocol";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { session } from "./fixtures";
import { renderCockpit } from "./renderCockpit";

const kickoff = [
  DIGEST_HEADING,
  "",
  "Decisions:",
  "- D1 JSON",
  "",
  "Open gaps:",
  "- G1 users",
  "- G2 sync",
].join("\n");

describe("long user turns fold (D5)", () => {
  it("shows the kickoff plan context as one line, expandable", () => {
    const { emit } = renderCockpit();
    emit({ type: "sessions", sessions: [session()] });
    emit({
      type: "block",
      sessionId: "s1",
      block: { kind: "user", id: "b1", text: kickoff, at: "t" },
    });
    emit({
      type: "block",
      sessionId: "s1",
      block: { kind: "user", id: "b2", text: "short\nnote", at: "t" },
    });
    expect(
      screen.getByText("Plan context sent to Claude (8 lines: what's settled, what's open)"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/G2 sync/)).toBeNull();
    expect(screen.getByText(/short/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show all 8 lines" }));
    expect(screen.getByText(/G2 sync/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fold" }));
    expect(screen.queryByText(/G2 sync/)).toBeNull();
  });
});
