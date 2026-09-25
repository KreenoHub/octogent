// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { decision, plan, session } from "./fixtures";
import { renderCockpit } from "./renderCockpit";

const repoPath = "C:\\repos\\alpha";

const count = (board: HTMLElement, section: string) =>
  within(board).getByRole("button", { name: new RegExp(`^${section}`) }).textContent;

describe("live plan board", () => {
  it("updates counts and the stale badge across two plan events", () => {
    const { emit } = renderCockpit();
    emit({ type: "sessions", sessions: [session({ repoPath })] });
    emit({
      type: "plan",
      repoPath,
      plan: plan({
        decisions: [decision({ id: "D1" }), decision({ id: "D2", title: "Dark only" })],
        gaps: [{ id: "G1", title: "No auth story", status: "open", body: "" }],
        goal: {
          title: "Octoplan",
          why: "",
          goals: ["Kill buried questions"],
          nonGoals: [],
          done: [],
        },
      }),
    });
    const board = screen.getByRole("complementary", { name: "Plan board" });
    expect(count(board, "Goals")).toContain("1");
    expect(count(board, "Decisions")).toContain("2");
    expect(count(board, "Gaps")).toContain("1");
    expect(count(board, "Parked")).toContain("0");
    expect(count(board, "Risks")).toContain("0");

    fireEvent.click(within(board).getByRole("button", { name: /^Decisions/ }));
    expect(within(board).getByText("Dark only")).toBeInTheDocument();
    expect(within(board).queryByText("stale")).not.toBeInTheDocument();

    emit({
      type: "plan",
      repoPath,
      plan: plan({
        decisions: [
          decision({ id: "D1" }),
          decision({ id: "D2", title: "Dark only", status: "stale" }),
          decision({ id: "D3", title: "Keyboard first" }),
        ],
        risks: [
          {
            id: "R1",
            title: "SDK churn",
            likelihood: "medium",
            impact: "high",
            origin: "",
            status: "open",
            body: "",
          },
        ],
      }),
    });
    expect(count(board, "Decisions")).toContain("3");
    expect(count(board, "Risks")).toContain("1");
    expect(count(board, "Goals")).toContain("0");
    const stale = within(board).getByText("stale");
    expect(stale).toHaveClass("op-badge--stale");
    expect(within(board).getByText("D2")).toBeInTheDocument();
  });

  it("ignores plans for other repos and shows the coverage slot", () => {
    const { emit } = renderCockpit();
    emit({ type: "sessions", sessions: [session({ repoPath })] });
    emit({ type: "plan", repoPath: "C:\\other", plan: plan({ decisions: [decision()] }) });
    const board = screen.getByRole("complementary", { name: "Plan board" });
    expect(count(board, "Decisions")).toContain("0");
    expect(within(board).getByTestId("coverage-slot")).toBeInTheDocument();
  });
});
