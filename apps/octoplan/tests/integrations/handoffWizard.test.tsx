// @vitest-environment jsdom
import type {
  ClientEvent,
  HandoffPlan,
  PlanSnapshot,
  ServerEvent,
} from "@octogent/octoplan-protocol";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeTransport } from "../../web/src/app/transport";
import { OctoplanProvider } from "../../web/src/app/useOctoplan";
import { HandoffWizard } from "../../web/src/integrations";
import {
  APPLY_AFTER_SAVE_MS,
  SAVE_DEBOUNCE_MS,
} from "../../web/src/integrations/handoff/HandoffWizard";

const REPO = "C:\\repos\\alpha";

const goal: NonNullable<PlanSnapshot["goal"]> = {
  title: "Ship Octoplan v2",
  why: "",
  goals: [],
  nonGoals: [],
  done: [],
};

const draft = (overrides: Partial<HandoffPlan> = {}): HandoffPlan => ({
  status: "draft",
  generatedAt: "2026-09-27T10:00:00Z",
  source: "claude",
  workspace: "C:\\repos\\octogent",
  heading: "Ship Octoplan v2",
  octopusPrompt: "You are the octopus. Coordinate api and web.",
  tentacles: [
    {
      id: "api",
      name: "API",
      description: "Server side",
      owns: ["server/"],
      existing: true,
      todos: [
        { text: "Add route. Done when a test hits it.", decisionIds: ["D1"], wave: "Wave 1" },
        { text: "Drop legacy. Done when gone.", decisionIds: [], wave: "Wave 1" },
      ],
    },
    {
      id: "web",
      name: "Web",
      description: "Client",
      owns: ["web/"],
      existing: false,
      todos: [{ text: "Build page. Done when it renders.", decisionIds: [], wave: "Wave 2" }],
    },
  ],
  ...overrides,
});

const snapshot = (overrides: Partial<PlanSnapshot> = {}): PlanSnapshot => ({
  decisions: [
    {
      id: "D1",
      title: "Routes are REST",
      date: "2026-09-27",
      status: "active",
      source: "interview",
      questionIds: [],
      dependsOn: [],
      body: "",
    },
  ],
  gaps: [],
  risks: [],
  parked: [],
  ideas: [],
  coverage: { dimensions: [] },
  goal,
  ...overrides,
});

/** Renders the wizard once the repo's plan is in the store (the shell only opens it then). */
const open = (initial: PlanSnapshot) => {
  const transport = createFakeTransport();
  const onClose = vi.fn();
  const view = render(
    <OctoplanProvider transport={transport}>
      <span />
    </OctoplanProvider>,
  );
  act(() => transport.emit({ type: "plan", repoPath: REPO, plan: initial }));
  view.rerender(
    <OctoplanProvider transport={transport}>
      <HandoffWizard repoPath={REPO} onClose={onClose} />
    </OctoplanProvider>,
  );
  const emit = (...events: ServerEvent[]) =>
    act(() => {
      for (const event of events) transport.emit(event);
    });
  const sent = (type: ClientEvent["type"]) => transport.sent.filter((e) => e.type === type);
  return { transport, emit, sent, onClose };
};

const card = (name: string) => screen.getByRole("listitem", { name });

afterEach(() => {
  vi.useRealTimers();
});

describe("HandoffWizard", () => {
  it("walks Generate -> Review -> Apply -> Done with save-handoff and apply-handoff", async () => {
    const { emit, sent, transport } = open(snapshot({ handoff: null }));
    expect(screen.getByRole("button", { name: /1 Generate/ })).toHaveAttribute(
      "aria-current",
      "step",
    );
    // Heading defaults to the goal title; the user edits it before generating.
    const heading = screen.getByRole("textbox", { name: /todo heading/i });
    expect(heading).toHaveValue("Ship Octoplan v2");
    fireEvent.change(heading, { target: { value: "Octoplan v2" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate plan" }));
    expect(sent("generate-handoff")).toEqual([
      { type: "generate-handoff", repoPath: REPO, heading: "Octoplan v2" },
    ]);

    // Spinner from the plan job, then the draft arrives through a `plan` event -> Review.
    emit({
      type: "plan-job",
      repoPath: REPO,
      job: "handoff-generate",
      state: "running",
      message: "Claude is splitting the plan…",
    });
    expect(screen.getByRole("status")).toHaveTextContent("Claude is splitting the plan…");
    emit({ type: "plan", repoPath: REPO, plan: snapshot({ handoff: draft() }) });
    expect(screen.getByRole("button", { name: /2 Review/ })).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(screen.getByText("C:\\repos\\octogent")).toBeInTheDocument();
    expect(within(card("API")).getByText("existing")).toBeInTheDocument();
    expect(within(card("Web")).getByText("new")).toBeInTheDocument();

    // D-id chip shows the decision title.
    fireEvent.click(within(card("API")).getByRole("button", { name: "D1" }));
    expect(within(card("API")).getByText("D1: Routes are REST")).toBeInTheDocument();

    // Rename API, move its first todo to Web, delete the second one, then Save.
    fireEvent.change(within(card("API")).getByRole("textbox", { name: "Name" }), {
      target: { value: "Backend" },
    });
    const backend = card("Backend");
    const [move] = within(backend).getAllByRole("combobox", { name: /move todo/i });
    const [toWeb] = within(backend).getAllByRole("option", { name: "Web" });
    if (!move || !toWeb) throw new Error("move controls missing");
    fireEvent.change(move, { target: { value: toWeb.getAttribute("value") } });
    fireEvent.click(within(card("Backend")).getByRole("button", { name: "Delete todo" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Saved")).toBeInTheDocument();

    const saves = sent("save-handoff");
    expect(saves).toHaveLength(1);
    const saved = (saves[0] as Extract<ClientEvent, { type: "save-handoff" }>).plan;
    expect(saved.heading).toBe("Ship Octoplan v2");
    expect(saved.tentacles.map((t) => [t.id, t.name, t.todos.map((d) => d.text)])).toEqual([
      ["api", "Backend", []],
      ["web", "Web", ["Build page. Done when it renders.", "Add route. Done when a test hits it."]],
    ]);
    expect(saved.tentacles[1]?.todos[1]).toEqual({
      text: "Add route. Done when a test hits it.",
      decisionIds: ["D1"],
      wave: "Wave 1",
    });

    // Apply: summary, then save-handoff followed by apply-handoff once the save echoes back.
    fireEvent.click(screen.getByRole("button", { name: "Next: Apply" }));
    expect(screen.getByText("2 (1 new / 1 reused)")).toBeInTheDocument();
    expect(screen.getByText("## Ship Octoplan v2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply to Octogent" }));
    expect(sent("save-handoff")).toHaveLength(2);
    expect(sent("apply-handoff")).toHaveLength(0);
    emit({ type: "plan", repoPath: REPO, plan: snapshot({ handoff: { ...saved } }) });
    expect(sent("apply-handoff")).toEqual([{ type: "apply-handoff", repoPath: REPO }]);
    const order = transport.sent.map((e) => e.type);
    expect(order.lastIndexOf("save-handoff")).toBeLessThan(order.indexOf("apply-handoff"));

    emit({
      type: "plan-job",
      repoPath: REPO,
      job: "handoff-apply",
      state: "running",
      message: "Writing 2 tentacles…",
    });
    expect(screen.getByText("Writing 2 tentacles…")).toHaveClass("op-hw-spinner");

    // Result -> Done with per-tentacle results, deck link and the copy button.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    emit(
      {
        type: "plan",
        repoPath: REPO,
        plan: snapshot({
          handoff: { ...saved, status: "applied", appliedAt: "2026-09-27T11:00:00Z" },
        }),
      },
      {
        type: "handoff-result",
        repoPath: REPO,
        result: {
          ok: true,
          message: "Applied 2 tentacles",
          workspace: "C:\\repos\\octogent",
          deckUrl: "http://localhost:8787",
          tentacles: [
            { tentacleId: "api", created: false, added: 0, skipped: 0, ok: true, message: "" },
            { tentacleId: "web", created: true, added: 2, skipped: 0, ok: true, message: "" },
          ],
        },
      },
    );
    expect(screen.getByRole("button", { name: /4 Done/ })).toHaveAttribute("aria-current", "step");
    const results = screen.getByRole("list", { name: "Tentacle results" });
    expect(within(results).getAllByRole("listitem")).toHaveLength(2);
    expect(within(results).getByText("created")).toBeInTheDocument();
    expect(within(results).getByText("2 added, 0 skipped")).toBeInTheDocument();
    const deck = screen.getByRole("link", { name: "Open Octogent" });
    expect(deck).toHaveAttribute("href", "http://localhost:8787");
    expect(deck).toHaveAttribute("target", "_blank");
    expect(screen.getByLabelText("Octopus prompt")).toHaveTextContent("You are the octopus.");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy octopus prompt" }));
    });
    expect(writeText).toHaveBeenCalledWith("You are the octopus. Coordinate api and web.");
    expect(screen.getByText("Copied the octopus prompt.")).toBeInTheDocument();
  });

  it("disables generating when there is no GOAL.md", () => {
    const { sent } = open(snapshot({ goal: null, handoff: null }));
    expect(screen.getByRole("alert")).toHaveTextContent(/no GOAL\.md/);
    const button = screen.getByRole("button", { name: "Generate plan" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(sent("generate-handoff")).toHaveLength(0);
  });

  it("offers the existing draft, autosaves edits after the debounce and validates ids", () => {
    vi.useFakeTimers();
    const { sent } = open(snapshot({ handoff: draft() }));
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Review existing draft" }));

    fireEvent.change(within(card("Web")).getByRole("textbox", { name: "Id" }), {
      target: { value: "Web UI" },
    });
    act(() => vi.advanceTimersByTime(SAVE_DEBOUNCE_MS));
    expect(sent("save-handoff")).toHaveLength(0);
    expect(within(card("Web")).getByRole("alert")).toHaveTextContent(/lowercase/i);

    fireEvent.change(within(card("Web")).getByRole("textbox", { name: "Id" }), {
      target: { value: "web-ui" },
    });
    fireEvent.click(within(card("Web")).getByRole("button", { name: "Remove folder web/" }));
    const folder = within(card("Web")).getByRole("textbox", { name: "Add folder to Web" });
    fireEvent.change(folder, { target: { value: "apps/web/" } });
    fireEvent.keyDown(folder, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "+ Add tentacle" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove tentacle Tentacle 3" }));
    act(() => vi.advanceTimersByTime(SAVE_DEBOUNCE_MS - 1));
    expect(sent("save-handoff")).toHaveLength(0);
    act(() => vi.advanceTimersByTime(1));
    const saves = sent("save-handoff");
    expect(saves).toHaveLength(1);
    const plan = (saves[0] as Extract<ClientEvent, { type: "save-handoff" }>).plan;
    expect(plan.tentacles.map((t) => [t.id, t.owns])).toEqual([
      ["api", ["server/"]],
      ["web-ui", ["apps/web/"]],
    ]);
  });

  it("applies after a timeout when the save never echoes, and shows a failed apply", () => {
    vi.useFakeTimers();
    const { emit, sent } = open(snapshot({ handoff: draft() }));
    fireEvent.click(screen.getByRole("button", { name: /3 Apply/ }));
    fireEvent.click(screen.getByRole("button", { name: "Apply to Octogent" }));
    act(() => vi.advanceTimersByTime(APPLY_AFTER_SAVE_MS));
    expect(sent("apply-handoff")).toHaveLength(1);
    emit({
      type: "plan-job",
      repoPath: REPO,
      job: "handoff-apply",
      state: "failed",
      message: "Octogent is not running in C:\\repos\\octogent",
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Octogent is not running");
    fireEvent.click(screen.getByRole("button", { name: "Back to review" }));
    expect(screen.getByRole("button", { name: /2 Review/ })).toHaveAttribute(
      "aria-current",
      "step",
    );
  });

  it("opens an applied plan on Done with a way to start over", () => {
    const { sent } = open(
      snapshot({ handoff: draft({ status: "applied", appliedAt: "2026-09-27T11:00:00Z" }) }),
    );
    expect(screen.getByRole("button", { name: /4 Done/ })).toHaveAttribute("aria-current", "step");
    expect(screen.getByText(/was applied to/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start a new handoff" }));
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(sent("generate-handoff")).toHaveLength(1);
  });
});
