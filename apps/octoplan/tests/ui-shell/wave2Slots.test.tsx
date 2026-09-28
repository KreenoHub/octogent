// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { defaultTentacleId, parseTasks, tentacleIdError } from "../../web/src/app/planActions";
import type {
  BrainstormSlotProps,
  BranchGraphSlotProps,
  TerminalSlotProps,
} from "../../web/src/components/slots";
import { graph, idea, plan, session, stage } from "./fixtures";
import { renderCockpit } from "./renderCockpit";

const ALPHA = "C:\\repos\\alpha";

// Stand-ins for the wave-2 slots that expose their props, so these tests pin the shell's wiring
// and keep passing when the octopus swaps the placeholders for the real components.
vi.mock("../../web/src/components/slots", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../web/src/components/slots")>();
  return {
    ...actual,
    BranchGraphSlot: ({
      graph,
      loading,
      onRefresh,
      onLinkBranch,
      onClose,
    }: BranchGraphSlotProps) => (
      <div data-testid="branch-graph-slot">
        {loading ? "Loading…" : `${graph?.commits.length ?? 0} commits`}
        <button type="button" onClick={onRefresh}>
          Refresh
        </button>
        <button type="button" onClick={() => onLinkBranch("B1", "octogent/t1")}>
          Link
        </button>
        <button type="button" onClick={onClose}>
          Close graph
        </button>
      </div>
    ),
    TerminalSlot: ({ sessionId, onClose }: TerminalSlotProps) => (
      <div data-testid="terminal-slot" data-session-id={sessionId}>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    ),
    BrainstormSlot: ({ ideas, onAction, onConverge }: BrainstormSlotProps) => (
      <div data-testid="brainstorm-slot">
        {ideas.length} ideas
        <button type="button" onClick={() => onAction("I1", "star")}>
          Star I1
        </button>
        <button type="button" onClick={() => onAction("I2", "merge", "I1")}>
          Merge I2
        </button>
        <button type="button" onClick={onConverge}>
          Converge
        </button>
      </div>
    ),
  };
});

const withSession = (overrides: Parameters<typeof session>[0] = {}) => {
  const view = renderCockpit();
  view.emit({ type: "sessions", sessions: [session(overrides)] });
  return view;
};

describe("hotkey bar", () => {
  it("lists every global key", () => {
    renderCockpit();
    const nav = screen.getByRole("navigation", { name: "Octoplan hotkeys" });
    expect(
      within(nav)
        .getAllByText(/^\[/)
        .map((el) => el.textContent),
    ).toEqual(["[F] FOCUS", "[I] IDEA", "[B] BRANCH", "[G] GRAPH", "[ESC] CLOSE"]);
  });
});

describe("branch graph (G)", () => {
  it("requests the graph on open, shows loading, refreshes on demand and never while closed", () => {
    const { transport, emit } = withSession();
    fireEvent.keyDown(window, { key: "g" });
    expect(transport.sent).toEqual([{ type: "request-graph", repoPath: ALPHA }]);
    const slot = screen.getByTestId("branch-graph-slot");
    expect(slot).toHaveTextContent("Loading…");

    emit({ type: "graph", graph: graph() });
    expect(screen.getByTestId("branch-graph-slot")).toHaveTextContent("1 commits");

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(screen.getByTestId("branch-graph-slot")).toHaveTextContent("Loading…");
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    expect(transport.sent.slice(1)).toEqual([
      { type: "request-graph", repoPath: ALPHA },
      { type: "link-branch", repoPath: ALPHA, branchId: "B1", gitBranch: "octogent/t1" },
    ]);

    fireEvent.keyDown(window, { key: "g" });
    expect(screen.queryByTestId("branch-graph-slot")).not.toBeInTheDocument();
    expect(transport.sent).toHaveLength(3);

    fireEvent.keyDown(window, { key: "G" });
    expect(transport.sent).toHaveLength(4);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("branch-graph-slot")).not.toBeInTheDocument();
  });

  it("does not open while typing", () => {
    const { transport } = withSession();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Message Claude" }), { key: "g" });
    expect(screen.queryByTestId("branch-graph-slot")).not.toBeInTheDocument();
    expect(transport.sent).toEqual([]);
  });
});

describe("branch conversation (B)", () => {
  it("asks for a title and sends branch-session for the active session", () => {
    const { transport } = withSession();
    fireEvent.keyDown(window, { key: "b" });
    const dialog = screen.getByRole("dialog", { name: "Branch conversation" });
    const title = within(dialog).getByLabelText("Branch title");
    expect(title).toHaveFocus();
    fireEvent.change(title, { target: { value: " Try SQLite " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Branch" }));
    expect(transport.sent).toEqual([
      { type: "branch-session", sessionId: "s1", title: "Try SQLite" },
    ]);
    expect(screen.queryByRole("dialog", { name: "Branch conversation" })).not.toBeInTheDocument();
  });

  it("explains instead of sending when no session is active", () => {
    const { transport } = renderCockpit();
    fireEvent.keyDown(window, { key: "b" });
    fireEvent.change(screen.getByLabelText("Branch title"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Branch" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Pick a session");
    expect(transport.sent).toEqual([]);
  });
});

describe("terminal panel", () => {
  it("opens the per-session terminal in a bottom panel and closes it", () => {
    withSession();
    fireEvent.click(screen.getByRole("button", { name: "Terminal for Plan Octoplan" }));
    const panel = screen.getByRole("region", { name: "Terminal" });
    expect(within(panel).getByTestId("terminal-slot")).toHaveAttribute("data-session-id", "s1");
    fireEvent.click(within(panel).getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("terminal-slot")).not.toBeInTheDocument();
  });
});

describe("brainstorm board", () => {
  it("shows the brainstorm slot with the repo's ideas only in brainstorm mode", () => {
    const { emit } = withSession();
    emit({ type: "plan", repoPath: ALPHA, plan: plan({ ideas: [idea(), idea({ id: "I2" })] }) });
    expect(screen.queryByTestId("brainstorm-slot")).not.toBeInTheDocument();
    emit({ type: "session-updated", session: session({ mode: "brainstorm" }) });
    expect(screen.getByTestId("brainstorm-slot")).toHaveTextContent("2 ideas");
  });

  it("wires idea actions to update-idea and converge to converge", () => {
    const { emit, transport } = withSession({ mode: "brainstorm" });
    emit({ type: "plan", repoPath: ALPHA, plan: plan({ ideas: [idea(), idea({ id: "I2" })] }) });
    fireEvent.click(screen.getByRole("button", { name: "Star I1" }));
    fireEvent.click(screen.getByRole("button", { name: "Merge I2" }));
    fireEvent.click(screen.getByRole("button", { name: "Converge" }));
    expect(transport.sent).toEqual([
      { type: "update-idea", repoPath: ALPHA, ideaId: "I1", action: "star" },
      { type: "update-idea", repoPath: ALPHA, ideaId: "I2", action: "merge", intoId: "I1" },
      { type: "converge", sessionId: "s1" },
    ]);
  });
});

describe("stages", () => {
  it("sends generate-stages and lists title + goal with a copy button", () => {
    const { transport, emit } = withSession();
    fireEvent.click(screen.getByRole("button", { name: "Stages" }));
    expect(transport.sent).toEqual([{ type: "generate-stages", repoPath: ALPHA }]);
    const stages = screen.getByRole("region", { name: "Stages" });
    expect(stages).toHaveTextContent("Generating stages…");

    emit({ type: "stages", repoPath: ALPHA, stages: [stage(), stage({ index: 2, title: "API" })] });
    const items = within(stages).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Skeleton");
    expect(items[0]).toHaveTextContent("App boots with an empty cockpit");
    expect(
      within(stages).getByRole("button", { name: "Copy prompt for stage 2" }),
    ).toBeInTheDocument();
  });
});

describe("export to Octogent", () => {
  it("validates the tentacle id like the protocol and parses tasks", () => {
    expect(tentacleIdError("alpha-2")).toBeNull();
    expect(tentacleIdError("")).toMatch(/required/);
    expect(tentacleIdError("Alpha")).toMatch(/lowercase/);
    expect(tentacleIdError("-alpha")).toMatch(/lowercase/);
    expect(defaultTentacleId("C:\\repos\\My App_v2")).toBe("my-app-v2");
    expect(parseTasks("- [ ] one\n\n  - two \nthree")).toEqual(["one", "two", "three"]);
  });

  it("prefills from GOAL.md done items, sends export-tentacle and shows the result", () => {
    const { transport, emit } = withSession();
    emit({
      type: "plan",
      repoPath: ALPHA,
      plan: plan({
        goal: {
          title: "Alpha",
          why: "",
          goals: [],
          nonGoals: [],
          done: [
            { id: "DoD1", text: "pnpm test is green", status: "covered", evidence: "" },
            { id: "DoD2", text: "Cockpit serves on :5190", status: "unknown", evidence: "" },
          ],
        },
      }),
    });
    // An older result for the same tentacle must not count as this export's reply.
    emit({
      type: "export-result",
      repoPath: ALPHA,
      tentacleId: "alpha",
      ok: false,
      message: "old",
    });

    fireEvent.click(screen.getByRole("button", { name: "Export to Octogent" }));
    const dialog = screen.getByRole("dialog", { name: "Export to Octogent" });
    const id = within(dialog).getByLabelText("Tentacle id");
    const tasks = within(dialog).getByLabelText("Tasks (one per line)");
    expect(id).toHaveValue("alpha");
    expect(tasks).toHaveValue("pnpm test is green\nCockpit serves on :5190");

    fireEvent.change(id, { target: { value: "Bad Id" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Export" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/lowercase/);
    expect(transport.sent).toEqual([]);

    fireEvent.change(id, { target: { value: "alpha" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Export" }));
    expect(transport.sent).toEqual([
      {
        type: "export-tentacle",
        repoPath: ALPHA,
        tentacleId: "alpha",
        tasks: ["pnpm test is green", "Cockpit serves on :5190"],
      },
    ]);
    expect(within(dialog).getByText("Exporting to alpha…")).toBeInTheDocument();

    emit({
      type: "export-result",
      repoPath: ALPHA,
      tentacleId: "alpha",
      ok: true,
      message: "2 tasks appended",
    });
    expect(within(dialog).getByText("Exported: 2 tasks appended")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Export to Octogent" })).not.toBeInTheDocument();
  });
});
