// @vitest-environment jsdom
import type {
  ClientEvent,
  HandoffPlan,
  OctogentStatus,
  PlanSnapshot,
  ServerEvent,
} from "@octogent/octoplan-protocol";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeTransport } from "../../web/src/app/transport";
import { OctoplanProvider } from "../../web/src/app/useOctoplan";
import { HandoffWizard } from "../../web/src/integrations";
import {
  OctogentLaunch,
  STATUS_POLL_MS,
  TRUST_NOTE,
} from "../../web/src/integrations/octogent/OctogentLaunch";

const REPO = "C:\\repos\\alpha";

afterEach(() => {
  vi.useRealTimers();
});

const status = (state: OctogentStatus["state"], extra: Partial<OctogentStatus> = {}) =>
  ({
    repoPath: REPO,
    workspace: "C:\\repos\\alpha",
    state,
    cliAvailable: true,
    message: `state ${state}`,
    ...extra,
  }) satisfies OctogentStatus;

const mount = (ui: React.ReactNode) => {
  const transport = createFakeTransport();
  render(<OctoplanProvider transport={transport}>{ui}</OctoplanProvider>);
  const emit = (...events: ServerEvent[]) =>
    act(() => {
      for (const event of events) transport.emit(event);
    });
  const sent = (type: ClientEvent["type"]) => transport.sent.filter((e) => e.type === type);
  return { emit, sent };
};

describe("OctogentLaunch (D58–D61)", () => {
  it("asks for the status, runs Octogent, and shows the port and the trust note once up", () => {
    const { emit, sent } = mount(<OctogentLaunch repoPath={REPO} />);
    expect(sent("request-octogent-status")).toEqual([
      { type: "request-octogent-status", repoPath: REPO },
    ]);
    expect(screen.getByRole("status")).toHaveTextContent("Checking…");
    expect(screen.queryByRole("button", { name: "Run Octogent" })).toBeNull();

    emit({ type: "octogent-status", status: status("not-initialized") });
    expect(screen.getByRole("status")).toHaveTextContent("Not set up");
    fireEvent.click(screen.getByRole("button", { name: "Run Octogent" }));
    expect(sent("launch-octogent")).toEqual([{ type: "launch-octogent", repoPath: REPO }]);
    // Pending until the server answers: no double launch.
    expect(screen.getByRole("status")).toHaveTextContent("Starting…");
    expect(screen.queryByRole("button", { name: "Run Octogent" })).toBeNull();

    emit({ type: "octogent-status", status: status("starting") });
    expect(screen.queryByRole("button", { name: "Run Octogent" })).toBeNull();
    emit({
      type: "octogent-status",
      status: status("running", { port: 8791, url: "http://127.0.0.1:8791" }),
    });
    expect(screen.getByRole("status")).toHaveTextContent("Running :8791");
    expect(screen.getByRole("link", { name: "Open Octogent" })).toHaveAttribute(
      "href",
      "http://127.0.0.1:8791",
    );
    expect(screen.getByText(TRUST_NOTE)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run Octogent" })).toBeNull();
  });

  it("re-checks while Octogent is down, and stops once it runs", () => {
    vi.useFakeTimers();
    const { emit, sent } = mount(<OctogentLaunch repoPath={REPO} />);
    emit({ type: "octogent-status", status: status("not-running") });
    act(() => vi.advanceTimersByTime(STATUS_POLL_MS * 2));
    expect(sent("request-octogent-status")).toHaveLength(3);
    emit({ type: "octogent-status", status: status("running", { port: 1, url: "http://x:1" }) });
    const before = sent("request-octogent-status").length;
    act(() => vi.advanceTimersByTime(STATUS_POLL_MS * 3));
    expect(sent("request-octogent-status")).toHaveLength(before);
  });

  it("shows the install hint instead of a button when the CLI is missing", () => {
    const { emit } = mount(<OctogentLaunch repoPath={REPO} />);
    emit({
      type: "octogent-status",
      status: status("not-running", { cliAvailable: false, message: "Install octogent first." }),
    });
    expect(screen.getByText("Install octogent first.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run Octogent" })).toBeNull();
  });

  it("offers the command to copy when no terminal could be opened", () => {
    const { emit } = mount(<OctogentLaunch repoPath={REPO} />);
    emit({
      type: "octogent-status",
      status: status("not-running", { manualCommand: 'cd /d "C:\\repos\\alpha" && octogent' }),
    });
    expect(screen.getByText('cd /d "C:\\repos\\alpha" && octogent')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });
});

describe("handoff Done step with Octogent not running", () => {
  const plan: HandoffPlan = {
    status: "draft",
    generatedAt: "2026-09-28T10:00:00Z",
    source: "fallback",
    workspace: REPO,
    heading: "v3",
    octopusPrompt: "Coordinate.",
    tentacles: [
      {
        id: "api",
        name: "API",
        description: "Server",
        owns: ["server/"],
        existing: false,
        todos: [{ text: "Do it. Done when done.", decisionIds: [], wave: "" }],
      },
    ],
  };
  const snapshot: PlanSnapshot = {
    decisions: [],
    gaps: [],
    risks: [],
    parked: [],
    ideas: [],
    coverage: { dimensions: [] },
    goal: { title: "v3", why: "", goals: [], nonGoals: [], done: [] },
    handoff: { ...plan, status: "applied" },
  };

  it("explains, offers Run Octogent and retries the apply", () => {
    const transport = createFakeTransport();
    const view = render(
      <OctoplanProvider transport={transport}>
        <span />
      </OctoplanProvider>,
    );
    act(() => transport.emit({ type: "plan", repoPath: REPO, plan: snapshot }));
    view.rerender(
      <OctoplanProvider transport={transport}>
        <HandoffWizard repoPath={REPO} onClose={() => {}} />
      </OctoplanProvider>,
    );
    act(() => {
      transport.emit({
        type: "handoff-result",
        repoPath: REPO,
        result: {
          ok: false,
          message: "0/1 tentacles written",
          workspace: REPO,
          tentacles: [
            {
              tentacleId: "api",
              created: false,
              added: 0,
              skipped: 0,
              ok: false,
              message: "Start Octogent in this repo first (run `octogent` there)",
            },
          ],
        },
      });
      transport.emit({ type: "octogent-status", status: status("not-running") });
    });
    expect(screen.getByText(/isn't running in this folder yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run Octogent" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry apply" }));
    expect(transport.sent.some((e) => e.type === "save-handoff")).toBe(true);
  });
});
