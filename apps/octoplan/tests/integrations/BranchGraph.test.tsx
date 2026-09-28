// @vitest-environment jsdom
import type { ConversationBranch, GitGraph } from "@octogent/octoplan-protocol";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createIntegrations } from "../../server/integrations";
import { AUTO_REFRESH_MS, BranchGraph } from "../../web/src/integrations";
import { createFakeExec, fail, fixture, gitRoutes, ok } from "./fakeExec";

const convo = (id: string, gitBranch?: string): ConversationBranch => ({
  id,
  title: `Branch ${id}`,
  sessionId: `s-${id}`,
  parentSessionId: "s0",
  status: "exploring",
  body: "",
  ...(gitBranch ? { gitBranch } : {}),
});

let graph: GitGraph;

beforeAll(async () => {
  const { exec } = createFakeExec({
    ...gitRoutes(),
    "gh pr list": ok(fixture("prList.json")),
    "gh pr checks 12": ok(fixture("checks-12.json")),
    "gh pr checks 13": fail(1, "", fixture("checks-13.json")),
    "gh pr checks": fail(1, "no checks reported"),
  });
  graph = await createIntegrations({ exec }).buildGraph("C:\\repos\\fixture", [
    convo("B1", "feat/x"),
    convo("B2"),
  ]);
});

afterEach(() => {
  vi.useRealTimers();
});

const renderGraph = (overrides: Partial<Parameters<typeof BranchGraph>[0]> = {}) => {
  const props = {
    graph,
    loading: false,
    onRefresh: vi.fn(),
    onLinkBranch: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<BranchGraph {...props} />);
  return props;
};

describe("BranchGraph", () => {
  it("draws one dot per commit across the allocated lanes, with parent lines", () => {
    renderGraph();
    const dots = screen.getAllByTestId("bg-commit");
    expect(dots).toHaveLength(7);
    expect(new Set(dots.map((d) => d.getAttribute("data-lane")))).toEqual(new Set(["0", "1", "2"]));
    const svg = screen.getByRole("img", { name: /commit graph, 7 commits/i });
    // 7 commits: c9 has two parents, c3 none -> 7 parent edges
    expect(svg.querySelectorAll("path.op-bg-edge")).toHaveLength(7);
    expect(screen.getByTestId("bg-counts")).toHaveTextContent("7 commits · 7 branches · 5 PRs");
  });

  it("labels commits with their refs", () => {
    renderGraph();
    const refs = screen.getAllByTestId("bg-ref").map((r) => r.textContent);
    expect(refs).toEqual(
      expect.arrayContaining(["main", "origin/main", "feat/x", "octogent/api-swarm-0"]),
    );
    expect(refs).not.toContain("HEAD");
    const rows = screen.getAllByTestId("bg-row");
    expect(rows[5]).toHaveTextContent("v0.1");
    expect(rows[5]).toHaveTextContent("base");
  });

  it("groups octogent/* branches into tentacle swimlanes with ahead/behind chips", () => {
    renderGraph();
    const lanes = screen.getAllByTestId("bg-swimlane");
    expect(lanes.map((l) => l.getAttribute("data-tentacle"))).toEqual(["api", "my-todo-app"]);
    const api = lanes[0] as HTMLElement;
    const names = within(api)
      .getAllByTestId("bg-branch")
      .map((b) => b.getAttribute("data-branch"));
    expect(names).toEqual([
      "octogent/api-swarm-0",
      "octogent/api-todo-2",
      "origin/octogent/api-swarm-0",
    ]);
    const swarm0 = within(api).getAllByTestId("bg-branch")[0] as HTMLElement;
    expect(within(swarm0).getByTestId("bg-ahead-behind")).toHaveTextContent("↑1 ↓3");
  });

  it("puts PR and CI badges on branch nodes", () => {
    renderGraph();
    const branches = screen.getByRole("region", { name: "Branches" });
    const feat = within(branches)
      .getAllByTestId("bg-branch")
      .find((b) => b.getAttribute("data-branch") === "feat/x") as HTMLElement;
    const badge = within(feat).getByTestId("bg-pr-badge");
    expect(badge).toHaveTextContent("#12");
    expect(badge).toHaveAttribute("data-checks", "passing");
    expect(badge).toHaveAttribute("href", "https://github.com/o/r/pull/12");

    const lane = screen.getAllByTestId("bg-swimlane")[0] as HTMLElement;
    const worker = within(lane).getAllByTestId("bg-pr-badge");
    expect(worker[0]).toHaveTextContent("#13 draft");
    expect(worker[0]).toHaveAttribute("data-checks", "failing");
  });

  it("draws a conversation branch next to its git branch", () => {
    renderGraph();
    const featRef = screen.getAllByTestId("bg-ref").find((r) => r.textContent === "feat/x");
    const group = featRef?.parentElement as HTMLElement;
    expect(within(group).getByTestId("bg-convo-marker")).toHaveTextContent("B1");
    const convos = screen.getAllByTestId("bg-convo");
    expect(within(convos[0] as HTMLElement).getByTestId("bg-convo-link")).toHaveTextContent(
      "→ feat/x",
    );
  });

  it("links an unlinked conversation branch to a git branch", () => {
    const props = renderGraph();
    const b2 = screen.getAllByTestId("bg-convo")[1] as HTMLElement;
    const link = within(b2).getByRole("button", { name: "Link" });
    expect(link).toBeDisabled();
    fireEvent.change(within(b2).getByLabelText("Git branch for B2"), {
      target: { value: "octogent/api-swarm-0" },
    });
    fireEvent.click(link);
    expect(props.onLinkBranch).toHaveBeenCalledWith("B2", "octogent/api-swarm-0");
  });

  it("shows branch details on click", () => {
    renderGraph();
    const feat = screen.getAllByTestId("bg-ref").find((r) => r.textContent === "feat/x");
    fireEvent.click(feat as HTMLElement);
    const details = screen.getByTestId("bg-details");
    expect(details).toHaveTextContent("feat/x");
    expect(details).toHaveTextContent("2 ahead · 1 behind");
    expect(details).toHaveTextContent("B1 Branch B1");
  });

  it("wires Refresh and Close, and refreshes every minute while open", () => {
    vi.useFakeTimers();
    const props = renderGraph();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(props.onRefresh).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(AUTO_REFRESH_MS);
    });
    expect(props.onRefresh).toHaveBeenCalledTimes(2);
  });

  it("shows a loading state before the first graph arrives", () => {
    renderGraph({ graph: null, loading: true });
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
    expect(screen.getByText("Reading git history…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled();
  });

  it("shows the gh hint and no badges when gh is unavailable", () => {
    renderGraph({
      graph: { ...graph, prs: [], ghAvailable: false, hint: "Run `gh auth login`." },
    });
    expect(screen.getByTestId("bg-hint")).toHaveTextContent("gh auth login");
    expect(screen.queryAllByTestId("bg-pr-badge")).toHaveLength(0);
  });

  it("shows an empty state outside a git repo", () => {
    renderGraph({
      graph: { ...graph, commits: [], branches: [], lanes: [], hint: "No git history here" },
    });
    expect(screen.getByText("No git history here yet.")).toBeInTheDocument();
    expect(screen.queryByTestId("bg-commit")).toBeNull();
  });
});
