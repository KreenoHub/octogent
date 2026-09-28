// @vitest-environment jsdom
import type {
  ClientEvent,
  IngestDraft,
  PlanSnapshot,
  ServerEvent,
} from "@octogent/octoplan-protocol";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeTransport } from "../../web/src/app/transport";
import { OctoplanProvider, useOctoplan } from "../../web/src/app/useOctoplan";
import { CockpitLayout } from "../../web/src/components/CockpitLayout";
import { HomeScreen, suggestName } from "../../web/src/components/home/HomeScreen";
import {
  INGEST_SAVE_DEBOUNCE_MS,
  IngestReview,
} from "../../web/src/integrations/ingest/IngestReview";

const REPO = "C:\\repos\\habit";

afterEach(() => {
  vi.useRealTimers();
});

const mount = (ui: React.ReactNode) => {
  const transport = createFakeTransport();
  const view = render(<OctoplanProvider transport={transport}>{ui}</OctoplanProvider>);
  const emit = (...events: ServerEvent[]) =>
    act(() => {
      for (const event of events) transport.emit(event);
    });
  const sent = (type: ClientEvent["type"]) => transport.sent.filter((e) => e.type === type);
  return { emit, sent, view, transport };
};

const hello: ServerEvent = {
  type: "hello",
  protocolVersion: 1,
  serverVersion: "0.0.0",
  defaultProjectsDir: "C:\\Users\\me\\Projects",
};

describe("home screen (D50–D52)", () => {
  it("creates a project from an idea in the default folder, with a suggested name", () => {
    const { emit, sent } = mount(<HomeScreen />);
    emit(hello);
    fireEvent.click(screen.getByRole("button", { name: /New project from an idea/ }));
    fireEvent.change(screen.getByLabelText(/The idea/), {
      target: { value: "A tiny habit tracker for one person." },
    });
    expect(screen.getByLabelText("Project name")).toHaveValue("tiny habit tracker");
    expect(screen.getByLabelText("Create it in")).toHaveValue("C:\\Users\\me\\Projects");
    expect(screen.getByText("C:\\Users\\me\\Projects\\tiny-habit-tracker")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create and start planning" }));
    expect(sent("create-project")).toEqual([
      {
        type: "create-project",
        parentDir: "C:\\Users\\me\\Projects",
        name: "tiny habit tracker",
        idea: "A tiny habit tracker for one person.",
      },
    ]);
    expect(screen.getByRole("button", { name: "Creating…" })).toBeDisabled();
  });

  it("imports a main folder plus extra paths and pasted text, skipping empty rows", () => {
    const { sent } = mount(<HomeScreen />);
    fireEvent.click(screen.getByRole("button", { name: /Import something that exists/ }));
    fireEvent.click(screen.getByRole("button", { name: "Import and read" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/main folder is required/);
    fireEvent.change(screen.getByLabelText(/Main folder/), { target: { value: ` "${REPO}" ` } });
    fireEvent.click(screen.getByRole("button", { name: "Add a file or folder" }));
    fireEvent.click(screen.getByRole("button", { name: "Add a file or folder" }));
    fireEvent.change(screen.getByLabelText("Extra path 1"), { target: { value: "D:\\notes" } });
    fireEvent.click(screen.getByRole("button", { name: "Paste text" }));
    fireEvent.change(screen.getByLabelText("Pasted text 1"), { target: { value: "sync?" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Import and read" }));
    expect(sent("start-import")).toEqual([
      {
        type: "start-import",
        mainPath: REPO,
        extraPaths: ["D:\\notes"],
        pastes: ["sync?"],
        gitInit: false,
      },
    ]);
  });

  it("suggests a name from the idea's first words", () => {
    expect(suggestName("The best, simplest habit tracker ever")).toBe("best simplest habit");
    expect(suggestName("")).toBe("");
  });
});

const draft = (overrides: Partial<IngestDraft> = {}): IngestDraft => ({
  status: "draft",
  createdAt: "2026-09-28T10:00:00.000Z",
  title: "Habit tracker",
  why: "Keep a streak.",
  maturity: "partial-plan",
  maturityReasons: "A spec and a half-built CLI.",
  coverage: [],
  sources: [
    {
      id: "S1",
      path: REPO,
      kind: "folder",
      main: true,
      maturity: "built",
      note: "A CLI.",
      skipped: ["design.docx"],
    },
  ],
  items: [
    {
      id: "I1",
      kind: "decision",
      title: "JSON storage",
      body: "",
      evidence: "found",
      source: "SPEC.md",
      quote: "Store habits as JSON",
      keep: true,
      tentative: false,
      disagreement: false,
    },
    {
      id: "I2",
      kind: "goal",
      title: "Weekly streak",
      body: "",
      evidence: "inferred",
      reason: "The README screenshot",
      keep: true,
      tentative: true,
      disagreement: false,
    },
    {
      id: "I3",
      kind: "decision",
      title: "Existing one",
      body: "",
      evidence: "found",
      source: "x",
      keep: false,
      tentative: false,
      inPlan: "D1",
      disagreement: false,
    },
    {
      id: "I4",
      kind: "gap",
      title: "Sources disagree on storage",
      body: "",
      evidence: "found",
      source: "SPEC.md, notes",
      keep: true,
      tentative: false,
      disagreement: true,
      resolution: "open",
    },
  ],
  ...overrides,
});

const snapshot = (ingest: IngestDraft | null): PlanSnapshot => ({
  decisions: [],
  gaps: [],
  risks: [],
  parked: [],
  ideas: [],
  coverage: { dimensions: [] },
  goal: null,
  ingest,
});

describe("What I understood (D56)", () => {
  it("shows maturity, sources, evidence and blocks apply until the disagreement is settled", () => {
    const { emit, sent } = mount(<IngestReview repoPath={REPO} onClose={() => {}} />);
    emit({ type: "plan", repoPath: REPO, plan: snapshot(draft()) });
    expect(screen.getByText("Partial plan")).toBeInTheDocument();
    expect(screen.getByText(/Not read: design\.docx/)).toBeInTheDocument();
    const found = screen.getByRole("article", { name: "I1 JSON storage" });
    expect(within(found).getByText("Store habits as JSON")).toBeInTheDocument();
    const inferred = screen.getByRole("article", { name: "I2 Weekly streak" });
    expect(within(inferred).getByText("assumption")).toBeInTheDocument();
    const inPlan = screen.getByRole("article", { name: "I3 Existing one" });
    expect(within(inPlan).getByRole("checkbox")).toBeDisabled();
    expect(within(inPlan).getByText("already in plan (D1)")).toBeInTheDocument();

    const apply = screen.getByRole("button", { name: /Apply 3 items/ });
    expect(apply).toBeDisabled();
    expect(screen.getByText(/resolve or park "Sources disagree on storage"/)).toBeInTheDocument();
    const gap = screen.getByRole("article", { name: "I4 Sources disagree on storage" });
    fireEvent.change(within(gap).getByRole("combobox"), { target: { value: "parked" } });
    fireEvent.click(within(inferred).getByRole("checkbox"));
    const applyNow = screen.getByRole("button", { name: /Apply 2 items/ });
    expect(applyNow).toBeEnabled();
    fireEvent.click(applyNow);
    const [event] = sent("apply-ingest") as Array<Extract<ClientEvent, { type: "apply-ingest" }>>;
    expect(event?.draft?.items.find((i) => i.id === "I4")?.resolution).toBe("parked");
    expect(event?.draft?.items.find((i) => i.id === "I2")?.keep).toBe(false);
  });

  it("autosaves edits after the debounce", () => {
    vi.useFakeTimers();
    const { emit, sent } = mount(<IngestReview repoPath={REPO} onClose={() => {}} />);
    emit({ type: "plan", repoPath: REPO, plan: snapshot(draft()) });
    fireEvent.change(screen.getByLabelText("I1 title"), { target: { value: "JSON file storage" } });
    expect(sent("save-ingest")).toHaveLength(0);
    act(() => vi.advanceTimersByTime(INGEST_SAVE_DEBOUNCE_MS));
    const [saved] = sent("save-ingest") as Array<Extract<ClientEvent, { type: "save-ingest" }>>;
    expect(saved?.draft.items[0]?.title).toBe("JSON file storage");
  });

  it("shows the running pass with its job message", () => {
    const { emit } = mount(<IngestReview repoPath={REPO} onClose={() => {}} />);
    emit(
      { type: "plan", repoPath: REPO, plan: snapshot(draft({ status: "running", items: [] })) },
      {
        type: "plan-job",
        repoPath: REPO,
        job: "ingest",
        state: "running",
        message: "Claude is reading 2 sources…",
      },
    );
    expect(screen.getByText("Claude is reading 2 sources…")).toBeInTheDocument();
  });
});

describe("cockpit wiring (D50, D56)", () => {
  it("moves to the imported repo on focus-repo and opens the review; Later hides it", () => {
    const Probe = () => {
      const { activeRepo, home } = useOctoplan();
      return <output data-testid="probe">{`${activeRepo}|${home}`}</output>;
    };
    const { emit } = mount(
      <>
        <CockpitLayout />
        <Probe />
      </>,
    );
    emit(hello);
    expect(screen.getByTestId("home-screen")).toBeInTheDocument();
    emit(
      { type: "focus-repo", repoPath: REPO },
      { type: "plan", repoPath: REPO, plan: snapshot(draft()) },
    );
    expect(screen.getByTestId("probe")).toHaveTextContent(`${REPO}|false`);
    expect(screen.getByRole("dialog", { name: "What I understood" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(screen.queryByRole("dialog", { name: "What I understood" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Review import" }));
    expect(screen.getByRole("dialog", { name: "What I understood" })).toBeInTheDocument();
    // Applied: the review goes away by itself.
    emit({
      type: "plan",
      repoPath: REPO,
      plan: snapshot(draft({ status: "applied", appliedAt: "2026-09-28T11:00:00.000Z" })),
    });
    expect(screen.queryByRole("dialog", { name: "What I understood" })).toBeNull();
  });
});
