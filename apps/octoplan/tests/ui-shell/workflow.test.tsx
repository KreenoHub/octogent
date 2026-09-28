// @vitest-environment jsdom
import { COVERAGE_DIMENSION_LABELS, type CoverageDimensionId } from "@octogent/octoplan-protocol";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WRITE_GOAL_REQUEST } from "../../web/src/components/CockpitLayout";
import { plan, round, session, stage } from "./fixtures";
import { renderCockpit } from "./renderCockpit";

const ALPHA = "C:\\repos\\alpha";
const covered = (Object.keys(COVERAGE_DIMENSION_LABELS) as CoverageDimensionId[]).map((id) => ({
  id,
  status: "covered" as const,
  confidence: "high" as const,
  questionIds: [],
  note: "",
}));
const goal = {
  title: "Alpha",
  why: "Because.",
  goals: ["Ship it"],
  nonGoals: [],
  done: [{ id: "DOD1", text: "Run pnpm test", status: "unknown" as const, evidence: "" }],
};

const setup = () => {
  const view = renderCockpit();
  view.emit({ type: "sessions", sessions: [session()] });
  const steps = () => screen.getByRole("list", { name: "Workflow steps" });
  const bar = () => screen.getByRole("contentinfo", { name: "Next step" });
  const sent = (type: string) => view.transport.sent.filter((e) => e.type === type);
  return { ...view, steps, bar, sent };
};

describe("stepper and next action (D62–D64)", () => {
  it("walks the steps as the plan fills in, with one next action each", () => {
    const { emit, steps, bar, sent } = setup();
    emit({ type: "plan", repoPath: ALPHA, plan: plan() });
    const current = () =>
      within(steps())
        .getAllByRole("button")
        .find((b) => b.getAttribute("aria-current") === "step")?.textContent ?? "";

    expect(current()).toMatch(/Interview/);
    expect(bar()).toHaveTextContent("12 dimensions still unknown.");
    expect(within(steps()).getByRole("button", { name: /Understand/ })).toHaveTextContent(
      "skipped: Nothing was imported.",
    );

    emit({ type: "question-round", round: round() });
    expect(bar()).toHaveTextContent("A question is waiting for your answer.");
    expect(within(bar()).getByRole("button", { name: "Answer the question" })).toBeInTheDocument();
    emit({ type: "round-answered", sessionId: "s1", roundId: "r1", answers: [] });

    emit({ type: "plan", repoPath: ALPHA, plan: plan({ coverage: { dimensions: covered } }) });
    expect(current()).toMatch(/Goal/);
    expect(screen.getByRole("region", { name: "Goal" })).toHaveTextContent("No GOAL.md yet");
    fireEvent.click(within(bar()).getByRole("button", { name: "Ask Claude to write GOAL.md" }));
    expect(sent("send-message")).toEqual([
      { type: "send-message", sessionId: "s1", text: WRITE_GOAL_REQUEST },
    ]);

    emit({
      type: "plan",
      repoPath: ALPHA,
      plan: plan({ goal, coverage: { dimensions: covered } }),
    });
    expect(current()).toMatch(/Stages/);
    fireEvent.click(within(bar()).getByRole("button", { name: "Generate stages" }));
    expect(sent("generate-stages")).toEqual([{ type: "generate-stages", repoPath: ALPHA }]);
    expect(screen.getByRole("region", { name: "Stages" })).toBeInTheDocument();

    emit({ type: "stages", repoPath: ALPHA, stages: [stage()] });
    expect(current()).toMatch(/Hand off/);
    fireEvent.click(within(bar()).getByRole("button", { name: "Hand off to Octogent" }));
    expect(screen.getByRole("region", { name: "Hand off step" })).toBeInTheDocument();

    emit({
      type: "plan",
      repoPath: ALPHA,
      plan: plan({
        goal,
        coverage: { dimensions: covered },
        handoff: {
          status: "applied",
          generatedAt: "t",
          appliedAt: "t2",
          source: "claude",
          workspace: ALPHA,
          heading: "Alpha",
          tentacles: [],
          octopusPrompt: "",
        },
      }),
    });
    expect(current()).toMatch(/Build/);
    fireEvent.click(within(bar()).getByRole("button", { name: "Run Octogent" }));
    expect(sent("launch-octogent")).toEqual([{ type: "launch-octogent", repoPath: ALPHA }]);
    expect(screen.getByRole("region", { name: "Build step" })).toBeInTheDocument();

    emit({
      type: "octogent-status",
      status: {
        repoPath: ALPHA,
        workspace: ALPHA,
        state: "running",
        url: "http://127.0.0.1:8791",
        port: 8791,
        cliAvailable: true,
        message: "ok",
      },
    });
    expect(within(bar()).getByRole("link", { name: "Open Octogent" })).toHaveAttribute(
      "href",
      "http://127.0.0.1:8791",
    );
  });

  it("never blocks: any step opens, and a pick lasts until the workflow moves on", () => {
    const { emit, steps } = setup();
    emit({ type: "plan", repoPath: ALPHA, plan: plan() });
    fireEvent.click(within(steps()).getByRole("button", { name: /Build/ }));
    expect(screen.getByRole("region", { name: "Build step" })).toBeInTheDocument();
    emit({ type: "plan", repoPath: ALPHA, plan: plan({ coverage: { dimensions: covered } }) });
    expect(screen.getByRole("region", { name: "Goal" })).toBeInTheDocument();
  });

  it("Start goes back to the home screen", () => {
    const { emit, steps } = setup();
    emit({ type: "plan", repoPath: ALPHA, plan: plan() });
    fireEvent.click(within(steps()).getByRole("button", { name: /Start/ }));
    expect(screen.getByTestId("home-screen")).toBeInTheDocument();
  });

  it("starts an interview when the repo has none", () => {
    const view = renderCockpit();
    view.emit({ type: "focus-repo", repoPath: ALPHA });
    view.emit({ type: "plan", repoPath: ALPHA, plan: plan({ goal: { ...goal, done: [] } }) });
    const bar = screen.getByRole("contentinfo", { name: "Next step" });
    fireEvent.click(within(bar).getByRole("button", { name: "Start the interview" }));
    expect(view.transport.sent.filter((e) => e.type === "start-session")).toEqual([
      { type: "start-session", repoPath: ALPHA, mode: "deep-interview", topic: "Alpha" },
    ]);
  });
});
