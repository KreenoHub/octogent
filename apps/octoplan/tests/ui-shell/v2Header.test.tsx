// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OVERVIEW_DEBOUNCE_MS, OVERVIEW_POLL_MS } from "../../web/src/app/useOverview";
import type { BranchGraphSlotProps, TentacleCardsSlotProps } from "../../web/src/components/slots";
import { overview, plan, session, tentacle } from "./fixtures";
import { renderCockpit } from "./renderCockpit";

const ALPHA = "C:\\repos\\alpha";
const BETA = "C:\\repos\\beta";

vi.mock("../../web/src/components/slots", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../web/src/components/slots")>();
  return {
    ...actual,
    TentacleCardsSlot: ({ tentacles, workspace, loading, onRefresh }: TentacleCardsSlotProps) => (
      <div data-testid="tentacle-cards-slot" data-workspace={workspace ?? ""}>
        {loading ? "Loading tentacles…" : tentacles.map((t) => t.tentacleId).join(",")}
        <button type="button" onClick={onRefresh}>
          Refresh tentacles
        </button>
      </div>
    ),
    BranchGraphSlot: ({ onClose }: BranchGraphSlotProps) => (
      <div data-testid="branch-graph-slot">
        <button type="button" onClick={onClose}>
          Close graph
        </button>
      </div>
    ),
  };
});

afterEach(() => {
  vi.useRealTimers();
});

const request = (repoPath: string) => ({ type: "request-overview", repoPath });

const openSession = (repo: string) =>
  fireEvent.click(
    within(screen.getByRole("region", { name: repo })).getByRole("button", {
      name: /^Plan Octoplan/,
    }),
  );

describe("Tentacles n/m header button (D42)", () => {
  it("shows aggregate todo progress from the overview and opens G on click", () => {
    const { emit, transport } = renderCockpit();
    expect(screen.queryByTestId("tentacles-button")).not.toBeInTheDocument();
    emit({ type: "sessions", sessions: [session()] });
    expect(screen.getByTestId("tentacles-button")).toHaveTextContent("TENTACLES …");

    emit({ type: "overview", overview: overview() });
    const button = screen.getByTestId("tentacles-button");
    expect(button).toHaveTextContent("TENTACLES 5/12");
    expect(button).not.toHaveClass("op-tentacles--pulse");

    fireEvent.click(button);
    const graph = screen.getByRole("dialog", { name: "Branch graph" });
    const cards = within(graph).getByTestId("tentacle-cards-slot");
    expect(cards).toHaveTextContent("ui-shell,qcards");
    expect(cards).toHaveAttribute("data-workspace", ALPHA);
    // Tentacle cards first, the commit graph below as the drill-down.
    const slots = within(graph).getAllByTestId(/-slot$/);
    expect(slots.map((el) => el.dataset.testid)).toEqual([
      "tentacle-cards-slot",
      "branch-graph-slot",
    ]);
    expect(transport.sent).toEqual([{ type: "request-graph", repoPath: ALPHA }]);
  });

  it("pulses when the done count changes, not on the first overview or a repo switch", () => {
    const { emit } = renderCockpit();
    emit(
      { type: "sessions", sessions: [session(), session({ id: "s2", repoPath: BETA })] },
      { type: "overview", overview: overview() },
    );
    const button = () => screen.getByTestId("tentacles-button");
    emit({
      type: "overview",
      overview: overview({ tentacles: [tentacle({ done: 3, total: 9 }), tentacle({ done: 2 })] }),
    });
    expect(button()).toHaveTextContent("5/17");
    expect(button()).not.toHaveClass("op-tentacles--pulse");

    emit({
      type: "overview",
      overview: overview({ tentacles: [tentacle({ done: 4 }), tentacle({ done: 2 })] }),
    });
    expect(button()).toHaveTextContent("6/16");
    expect(button()).toHaveClass("op-tentacles--pulse");
    fireEvent.animationEnd(button());
    expect(button()).not.toHaveClass("op-tentacles--pulse");

    emit({ type: "overview", overview: overview({ repoPath: BETA, tentacles: [tentacle()] }) });
    openSession("beta");
    expect(button()).toHaveTextContent("3/8");
    expect(button()).not.toHaveClass("op-tentacles--pulse");
  });

  it("requests the overview on repo change, after plan changes (debounced) and every 30 s", () => {
    vi.useFakeTimers();
    const { emit, overviewRequests } = renderCockpit();
    emit({ type: "sessions", sessions: [session(), session({ id: "s2", repoPath: BETA })] });
    expect(overviewRequests).toEqual([request(ALPHA)]);

    emit({ type: "plan", repoPath: ALPHA, plan: plan() });
    emit({ type: "plan", repoPath: ALPHA, plan: plan() });
    act(() => {
      vi.advanceTimersByTime(OVERVIEW_DEBOUNCE_MS);
    });
    expect(overviewRequests).toEqual([request(ALPHA), request(ALPHA)]);
    // A plan for another repo is not this repo's change.
    emit({ type: "plan", repoPath: BETA, plan: plan() });
    act(() => {
      vi.advanceTimersByTime(OVERVIEW_DEBOUNCE_MS);
    });
    expect(overviewRequests).toHaveLength(2);

    act(() => {
      vi.advanceTimersByTime(OVERVIEW_POLL_MS);
    });
    expect(overviewRequests).toHaveLength(3);

    openSession("beta");
    expect(overviewRequests.at(-1)).toEqual(request(BETA));
  });

  it("G's tentacle cards show loading until the overview arrives and refresh on demand", () => {
    const { emit, overviewRequests } = renderCockpit();
    emit({ type: "sessions", sessions: [session()] });
    fireEvent.keyDown(window, { key: "g" });
    const cards = screen.getByTestId("tentacle-cards-slot");
    expect(cards).toHaveTextContent("Loading tentacles…");
    emit({ type: "overview", overview: overview() });
    expect(cards).toHaveTextContent("ui-shell,qcards");

    fireEvent.click(within(cards).getByRole("button", { name: "Refresh tentacles" }));
    expect(overviewRequests.at(-1)).toEqual(request(ALPHA));
    expect(cards).toHaveTextContent("Loading tentacles…");
    emit({ type: "error", message: "gh missing" });
    expect(cards).not.toHaveTextContent("Loading tentacles…");
  });
});
