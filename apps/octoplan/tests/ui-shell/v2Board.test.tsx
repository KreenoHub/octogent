// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FLASH_MS } from "../../web/src/app/useFlash";
import type { HandoffSlotProps } from "../../web/src/components/slots";
import { aggregatePlan, decision, graph, overview, plan, round, session, stage } from "./fixtures";
import { renderCockpit } from "./renderCockpit";

const ALPHA = "C:\\repos\\alpha";

// The wizard belongs to integrations; a stand-in that shows its props keeps this test on the shell.
vi.mock("../../web/src/components/slots", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../web/src/components/slots")>();
  return {
    ...actual,
    HandoffSlot: ({ repoPath, onClose }: HandoffSlotProps) => (
      <div data-testid="handoff-slot" data-repo={repoPath}>
        <button type="button" onClick={onClose}>
          Close wizard
        </button>
      </div>
    ),
  };
});

afterEach(() => {
  vi.useRealTimers();
});

const board = () => screen.getByRole("complementary", { name: "Plan board" });

const withAggregate = (planOverrides: Parameters<typeof aggregatePlan>[0] = {}) => {
  const view = renderCockpit();
  view.emit(
    {
      type: "sessions",
      sessions: [
        session(),
        session({ id: "s2", title: "Try SQLite", parentSessionId: "s1", claudeSessionId: "c2" }),
        session({ id: "s3", title: "Elsewhere", repoPath: "C:\\repos\\beta" }),
      ],
    },
    { type: "plan", repoPath: ALPHA, plan: aggregatePlan(planOverrides) },
  );
  return view;
};

const openSection = (name: string) => {
  fireEvent.click(within(board()).getByRole("button", { name: new RegExp(`^${name}`) }));
  return within(board()).getByRole("list", { name: `${name} records` });
};

describe("needs-attention list (D9, D17)", () => {
  it("shows stale decisions, unanswered rounds of any repo session, tentative risks and harvest candidates", () => {
    const { emit } = withAggregate();
    emit(
      { type: "question-round", round: round({ id: "r5", sessionId: "s2", index: 3 }) },
      { type: "question-round", round: round({ id: "r6", sessionId: "s3" }) },
    );
    const list = within(board()).getByRole("region", { name: "Needs attention" });
    const kinds = [...list.querySelectorAll("li")].map((li) => li.getAttribute("data-kind"));
    expect(kinds).toEqual(["stale", "round", "risk", "harvest"]);
    expect(list).toHaveTextContent("NEEDS ATTENTION · 4");
    expect(list).toHaveTextContent("D2 Dark only");
    expect(list).toHaveTextContent("Round 3 · Try SQLite · 2Q");
    expect(list).toHaveTextContent("R1 Solo dev only");
    expect(list).not.toHaveTextContent("SDK churn");
    expect(list).toHaveTextContent("H1 Use pnpm workspaces");
    expect(list).toHaveTextContent("commit abc1234");
    expect(list).not.toHaveTextContent("Old one");
  });

  it("accept/reject send resolve-harvest, Harvest now sends run-harvest, a round opens its session", () => {
    const { emit, transport } = withAggregate();
    emit({ type: "question-round", round: round({ id: "r5", sessionId: "s2" }) });
    const list = within(board()).getByRole("region", { name: "Needs attention" });
    fireEvent.click(within(list).getByRole("button", { name: "Accept H1" }));
    fireEvent.click(within(list).getByRole("button", { name: "Reject H1" }));
    fireEvent.click(within(list).getByRole("button", { name: "Harvest now" }));
    expect(transport.sent).toEqual([
      { type: "resolve-harvest", repoPath: ALPHA, harvestId: "H1", action: "accept" },
      { type: "resolve-harvest", repoPath: ALPHA, harvestId: "H1", action: "reject" },
      { type: "run-harvest", repoPath: ALPHA },
    ]);

    fireEvent.click(within(list).getByRole("button", { name: /Round 1 · Try SQLite/ }));
    expect(screen.getByRole("button", { name: /Try SQLite/, current: true })).toBeInTheDocument();
  });

  it("disables Harvest now while a harvest job runs and shows the job in the header", () => {
    const { emit } = withAggregate();
    emit({
      type: "plan-job",
      repoPath: ALPHA,
      job: "harvest",
      state: "running",
      message: "3 commits",
    });
    expect(within(board()).getByRole("button", { name: "Harvesting…" })).toBeDisabled();
    expect(screen.getByTestId("plan-jobs")).toHaveTextContent("Harvesting decisions…");
    emit({ type: "plan-job", repoPath: ALPHA, job: "harvest", state: "done", message: "ok" });
    expect(screen.queryByTestId("plan-jobs")).not.toBeInTheDocument();
    expect(within(board()).getByRole("button", { name: "Harvest now" })).toBeEnabled();
  });

  it("says so when nothing is waiting", () => {
    const { emit } = renderCockpit();
    emit(
      { type: "sessions", sessions: [session()] },
      { type: "plan", repoPath: ALPHA, plan: plan() },
    );
    const list = within(board()).getByRole("region", { name: "Needs attention" });
    expect(list).toHaveTextContent("Nothing waiting.");
  });
});

describe("conventions (D28)", () => {
  it("lists conventions, adds one from title + body and removes one", () => {
    const { emit, transport } = withAggregate();
    emit({
      type: "conventions",
      conventions: [{ id: "C1", title: "pnpm only", date: "2026-09-20", body: "No npm." }],
    });
    const section = within(board()).getByRole("region", { name: "Conventions" });
    fireEvent.click(within(section).getByRole("button", { name: /^Conventions/ }));
    expect(within(section).getByText("pnpm only")).toBeInTheDocument();

    fireEvent.change(within(section).getByLabelText("Convention title"), {
      target: { value: "  Biome formats  " },
    });
    fireEvent.change(within(section).getByLabelText("Convention body"), {
      target: { value: "Run biome check --write." },
    });
    fireEvent.click(within(section).getByRole("button", { name: "Add convention" }));
    fireEvent.click(within(section).getByRole("button", { name: "Remove C1" }));
    expect(transport.sent).toEqual([
      { type: "add-convention", title: "Biome formats", body: "Run biome check --write." },
      { type: "remove-convention", conventionId: "C1" },
    ]);
    expect(within(section).getByLabelText("Convention title")).toHaveValue("");
  });
});

describe("board sections (D9, D13)", () => {
  it("renders ideas, stages, conversation branches and every session in the repo", () => {
    const { emit } = withAggregate();
    emit(
      { type: "stages", repoPath: ALPHA, stages: [stage(), stage({ index: 2, title: "API" })] },
      {
        type: "graph",
        graph: graph({
          conversationBranches: [
            {
              id: "B1",
              title: "Try SQLite",
              sessionId: "s2",
              parentSessionId: "s1",
              gitBranch: "octogent/sqlite",
              status: "merged",
              body: "",
            },
          ],
        }),
      },
    );

    const ideas = openSection("Ideas");
    expect(
      within(ideas)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["I1Offline modeinbox", "I2Voice answersstarred"]);

    const stages = within(board()).getByRole("region", { name: "Stages" });
    expect(within(stages).getAllByRole("listitem")).toHaveLength(2);

    const branches = openSection("Branches");
    const [branch] = within(branches).getAllByRole("listitem");
    expect(branch).toHaveTextContent("octogent/sqlite");
    expect(branch).toHaveTextContent("Try SQLite");
    expect(branch).toHaveTextContent("merged");
    expect(branch).toHaveAttribute("title", "Forked from Plan Octoplan");

    const sessions = openSection("Sessions");
    const rows = within(sessions).getAllByRole("listitem");
    // Two session logs plus the two live sessions of this repo that are not logged yet.
    expect(rows.map((li) => li.textContent)).toEqual([
      "2026-09-25Plan Octoplandeep-interview",
      "2026-09-26Pricingquick-align",
      "2026-09-25Plan Octoplanlive",
      "2026-09-25Try SQLitelive",
    ]);
    expect(rows[0]).toHaveAttribute("title", expect.stringContaining("12 answers · 1 parked"));
    fireEvent.click(within(rows[3] as HTMLElement).getByRole("button", { name: "Try SQLite" }));
    expect(screen.getByRole("button", { name: /Try SQLite/, current: true })).toBeInTheDocument();
  });

  it("flashes a section when a plan tool changes its count", () => {
    vi.useFakeTimers();
    const { emit } = withAggregate();
    const decisions = () =>
      within(board())
        .getByRole("button", { name: /^Decisions/ })
        .closest("li") as HTMLElement;
    expect(decisions()).not.toHaveClass("op-board-section--flash");
    emit({
      type: "plan",
      repoPath: ALPHA,
      plan: aggregatePlan({ decisions: [decision(), decision({ id: "D9", title: "New" })] }),
    });
    expect(decisions()).toHaveClass("op-board-section--flash");
    act(() => {
      vi.advanceTimersByTime(FLASH_MS);
    });
    expect(decisions()).not.toHaveClass("op-board-section--flash");
  });
});

describe("drift badges and History tab (D24)", () => {
  it("shows implemented / untouched / diverged on decisions with evidence tooltips", () => {
    const { emit } = withAggregate();
    emit({
      type: "overview",
      overview: overview({
        drift: [
          { decisionId: "D1", status: "implemented", evidence: ["abc1234 feat: dock [D1]"] },
          { decisionId: "D2", status: "untouched", evidence: [] },
          { decisionId: "D3", status: "diverged", evidence: ["H3", "todo ticked in ui-shell"] },
        ],
      }),
    });
    const decisions = openSection("Decisions");
    expect(within(decisions).getByTestId("drift-D1")).toHaveTextContent("implemented");
    expect(within(decisions).getByTestId("drift-D1")).toHaveClass("op-drift--implemented");
    expect(within(decisions).getByTestId("drift-D1")).toHaveAttribute(
      "title",
      "abc1234 feat: dock [D1]",
    );
    expect(within(decisions).getByTestId("drift-D2")).toHaveTextContent("untouched");
    expect(within(decisions).getByTestId("drift-D3")).toHaveTextContent("diverged");
    expect(within(decisions).getByTestId("drift-D3")).toHaveAttribute(
      "title",
      "H3\ntodo ticked in ui-shell",
    );
  });

  it("shows the timeline in date order, newest last", () => {
    const { emit } = withAggregate();
    emit({
      type: "overview",
      overview: overview({
        history: [
          { at: "2026-09-27T09:00:00Z", kind: "revision", refId: "A7", title: "Revised Q3" },
          { at: "2026-09-25", kind: "session", refId: "2026-09-25-plan.md", title: "Plan" },
          { at: "2026-09-26T12:00:00Z", kind: "decision", refId: "D2", title: "Dark only" },
          { at: "2026-09-26T15:30:00Z", kind: "branch", refId: "B1", title: "Try SQLite" },
        ],
      }),
    });
    fireEvent.click(within(board()).getByRole("tab", { name: "History" }));
    expect(within(board()).getByRole("tab", { name: "History" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const items = within(within(board()).getByRole("list", { name: "History" })).getAllByRole(
      "listitem",
    );
    expect(items.map((li) => li.getAttribute("data-kind"))).toEqual([
      "session",
      "decision",
      "branch",
      "revision",
    ]);
    expect(items[1]).toHaveTextContent("2026-09-26 12:00decisionD2Dark only");
    fireEvent.click(within(board()).getByRole("tab", { name: "Board" }));
    expect(within(board()).getByRole("region", { name: "Needs attention" })).toBeInTheDocument();
  });
});

describe("hand off to Octogent (D44)", () => {
  it("shows the button only with a GOAL.md, opens the wizard in a modal and closes it", () => {
    const { emit } = withAggregate({ goal: null });
    expect(
      within(board()).queryByRole("button", { name: "Hand off to Octogent" }),
    ).not.toBeInTheDocument();

    emit({ type: "plan", repoPath: ALPHA, plan: aggregatePlan() });
    fireEvent.click(within(board()).getByRole("button", { name: "Hand off to Octogent" }));
    const dialog = screen.getByRole("dialog", { name: "Hand off to Octogent" });
    expect(within(dialog).getByTestId("handoff-slot")).toHaveAttribute("data-repo", ALPHA);
    fireEvent.click(within(dialog).getByRole("button", { name: "Close wizard" }));
    expect(screen.queryByRole("dialog", { name: "Hand off to Octogent" })).not.toBeInTheDocument();

    fireEvent.click(within(board()).getByRole("button", { name: "Hand off to Octogent" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("handoff-slot")).not.toBeInTheDocument();
  });
});
