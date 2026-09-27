import type { Decision, HandoffTentacle } from "@octogent/octoplan-protocol";
import { describe, expect, it } from "vitest";
import type { ExistingTentacle } from "../../server/integrations/types";
import {
  DONE_WHEN_FALLBACK,
  buildHandoffPrompt,
  buildHarvestPrompt,
  buildOctopusPrompt,
  fallbackHandoff,
  normalizeHandoff,
  slugId,
} from "../../server/modes/handoff";
import { buildStages } from "../../server/modes/stages";
import type { HandoffPromptInput } from "../../server/modes/v2Types";
import { v2Snapshot } from "./v2Fixture";

const snapshot = v2Snapshot();
const goal = snapshot.goal;
if (!goal) throw new Error("fixture has no goal");
const stages = buildStages(goal, snapshot.decisions);
const knownIds = new Set(snapshot.decisions.map((d) => d.id));

const input = (overrides: Partial<HandoffPromptInput> = {}): HandoffPromptInput => ({
  snapshot,
  stages,
  existing: [],
  repoTree: [
    "apps/octoplan",
    "apps/octoplan/server",
    "apps/octoplan/web",
    "packages/octoplan-protocol",
  ],
  heading: "Octoplan v2",
  ...overrides,
});

const existingModes: ExistingTentacle = {
  id: "modes",
  name: "Octoplan Modes",
  description: "Interview presets",
  owns: ["apps/octoplan/server/modes/"],
  todoDone: 3,
  todoTotal: 5,
};

const decision = (id: string, title: string): Decision => ({
  id,
  title,
  date: "2026-09-27",
  status: "active",
  source: "octoplan session",
  questionIds: [],
  dependsOn: [],
  body: "",
});

const tentacle = (overrides: Partial<HandoffTentacle>): HandoffTentacle => ({
  id: "t",
  name: "T",
  description: "",
  owns: [],
  existing: false,
  todos: [],
  ...overrides,
});

describe("fallbackHandoff on the v2 plan", () => {
  const tentacles = normalizeHandoff(fallbackHandoff(input()), [], snapshot.decisions);

  it("makes one tentacle per stage, named and waved after the stage", () => {
    // Every stage contributes; the final stage only keeps the gate items no build stage had.
    expect(tentacles.map((t) => t.id)).toEqual(stages.map((s) => slugId(s.title)));
    expect(tentacles[0]?.id).toBe("wave-3-focus");
    expect(tentacles[0]?.name).toBe("Wave 3 — focus");
    for (const [i, t] of tentacles.entries()) {
      expect(t.existing).toBe(false);
      expect(t.todos.length).toBeGreaterThan(0);
      for (const todo of t.todos) expect(todo.wave).toBe(stages[i]?.title);
    }
  });

  it("stamps every todo with the stage's known D-ids and a Done-when clause", () => {
    for (const [i, t] of tentacles.entries()) {
      for (const todo of t.todos) {
        expect(todo.decisionIds.length).toBeGreaterThan(0);
        for (const id of todo.decisionIds) expect(knownIds.has(id)).toBe(true);
        expect(todo.text).toMatch(/\bDone when\b/);
        expect(todo.text).not.toContain("\n");
      }
      const stageIds = new Set(stages[i]?.decisionIds);
      const cited = t.todos.flatMap((todo) =>
        todo.decisionIds.filter((id) => !todo.text.includes(id)),
      );
      for (const id of cited) expect(stageIds.has(id)).toBe(true);
    }
  });

  it("gives each DoD item to exactly one tentacle", () => {
    const texts = tentacles.flatMap((t) => t.todos.map((todo) => todo.text));
    for (const item of goal.done) {
      expect(texts.filter((text) => text.includes(item.text))).toHaveLength(1);
    }
  });

  it("reads decision ids from the prompt when a stage was re-read from disk without them", () => {
    const fromDisk = stages.map(({ decisionIds: _ids, ...stage }) => stage);
    expect(fallbackHandoff(input({ stages: fromDisk }))).toEqual(fallbackHandoff(input()));
  });

  it("keeps existing tentacles and hands them a stage that names their folder", () => {
    const kept = fallbackHandoff(input({ existing: [existingModes] }));
    expect(kept[0]).toMatchObject({ id: "modes", existing: true, todos: [] });
    const [first, ...rest] = stages;
    if (!first) throw new Error("no stages");
    const naming = { ...first, prompt: `${first.prompt}\nTouch apps/octoplan/server/modes/ only.` };
    const reused = fallbackHandoff(input({ existing: [existingModes], stages: [naming, ...rest] }));
    expect(reused[0]?.id).toBe("modes");
    expect(reused[0]?.todos.length).toBeGreaterThan(0);
    expect(reused.some((t) => t.id === "wave-3-focus")).toBe(false);
  });
});

describe("normalizeHandoff", () => {
  const decisions = [decision("D1", "One"), decision("D2", "Two")];

  it("slugs ids, caps them at 40 chars, and never returns an empty id", () => {
    const out = normalizeHandoff(
      [
        tentacle({ id: "Wave 3 — Focus!", todos: [{ text: "x", decisionIds: [], wave: "" }] }),
        tentacle({ id: "a".repeat(60), todos: [{ text: "y", decisionIds: [], wave: "" }] }),
        tentacle({ id: "—", name: "", todos: [{ text: "z", decisionIds: [], wave: "" }] }),
      ],
      [],
      decisions,
    );
    expect(out.map((t) => t.id)).toEqual(["wave-3-focus", "a".repeat(40), "tentacle-3"]);
    for (const t of out) expect(t.id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
  });

  it("makes todos one line with a Done-when clause, keeping one that has it", () => {
    const [t] = normalizeHandoff(
      [
        tentacle({
          todos: [
            { text: "Add the dock\n  panel", decisionIds: [], wave: " Wave 3 " },
            { text: "Add chips. Done when the test passes.", decisionIds: [], wave: "Wave 3" },
            { text: "   ", decisionIds: [], wave: "" },
          ],
        }),
      ],
      [],
      decisions,
    );
    expect(t?.todos.map((todo) => todo.text)).toEqual([
      `Add the dock panel. ${DONE_WHEN_FALLBACK}`,
      "Add chips. Done when the test passes.",
    ]);
    expect(t?.todos[0]?.wave).toBe("Wave 3");
  });

  it("keeps only decision ids that exist", () => {
    const [t] = normalizeHandoff(
      [tentacle({ todos: [{ text: "x", decisionIds: ["D1", "D9", "D1", "G1"], wave: "" }] })],
      [],
      decisions,
    );
    expect(t?.todos[0]?.decisionIds).toEqual(["D1"]);
  });

  it("merges duplicate ids, joining owns and todos without repeats", () => {
    const out = normalizeHandoff(
      [
        tentacle({
          id: "ui",
          name: "UI",
          owns: ["web/"],
          todos: [{ text: "a", decisionIds: [], wave: "" }],
        }),
        tentacle({
          id: "UI",
          name: "Other",
          description: "The web app",
          owns: ["web/", "styles/"],
          todos: [
            { text: "a", decisionIds: [], wave: "" },
            { text: "b", decisionIds: [], wave: "" },
          ],
        }),
      ],
      [],
      decisions,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "ui", name: "UI", description: "The web app" });
    expect(out[0]?.owns).toEqual(["web/", "styles/"]);
    expect(out[0]?.todos).toHaveLength(2);
  });

  it("marks existing from the workspace list and drops empty new tentacles", () => {
    const out = normalizeHandoff(
      [
        tentacle({ id: "modes", name: "  ", existing: false }),
        tentacle({ id: "claimed", existing: true }),
        tentacle({ id: "empty", todos: [] }),
      ],
      [existingModes],
      decisions,
    );
    expect(out).toEqual([
      expect.objectContaining({
        id: "modes",
        existing: true,
        name: "Octoplan Modes",
        owns: ["apps/octoplan/server/modes/"],
      }),
    ]);
  });
});

describe("buildHarvestPrompt", () => {
  const prompt = buildHarvestPrompt({
    inputs: {
      headSha: "abc1234def",
      commits: [
        {
          sha: "abc1234def",
          branch: "octogent/ui/dock",
          subject: "feat: dock uses a portal [D14]",
          body: "Moved the dock\ninto a portal.",
        },
      ],
      todos: [{ tentacleId: "ui-shell", done: ["Dock"], open: ["Chips"] }],
    },
    decisions: [decision("D14", "Pending round lives in a docked answer panel")],
    knownTitles: ["Dock renders in a portal"],
  });

  it("inlines commits, todos and active decisions compactly", () => {
    expect(prompt).toContain("abc1234 (octogent/ui/dock) feat: dock uses a portal [D14]");
    expect(prompt).toContain("Moved the dock into a portal.");
    expect(prompt).toContain("ui-shell: done Dock; open Chips");
    expect(prompt).toContain("- D14 — Pending round lives in a docked answer panel");
  });

  it("excludes known titles and caps the calls", () => {
    expect(prompt).toMatch(/never propose these again\n- Dock renders in a portal/);
    expect(prompt).toContain("plan_add_harvest");
    expect(prompt).toContain("at most 5");
    expect(prompt).toContain("contradicts");
    expect(prompt).toMatch(/read-only/i);
    expect(prompt).toMatch(/nothing new, call nothing/);
  });
});

describe("buildHandoffPrompt", () => {
  const prompt = buildHandoffPrompt(input({ existing: [existingModes] }));

  it("inlines the goal, decisions, stages, existing tentacles and repo tree", () => {
    expect(prompt).toContain(goal.title);
    expect(prompt).toContain("- D44 — Plan → Octogent handoff is a click-through wizard");
    expect(prompt).toContain(
      `- Stage 1: Wave 3 — focus — decisions: ${stages[0]?.decisionIds?.join(", ")}`,
    );
    expect(prompt).toContain("- modes (Octoplan Modes): owns apps/octoplan/server/modes/");
    expect(prompt).toContain("- packages/octoplan-protocol");
  });

  it("states the split rules and the single tool call", () => {
    expect(prompt).toContain("3–8 tentacles");
    expect(prompt).toMatch(/disjoint/);
    expect(prompt).toMatch(/existing=true/);
    expect(prompt).toMatch(/Done when …/);
    expect(prompt).toMatch(/D-ids/);
    expect(prompt).toContain("Call plan_propose_handoff exactly once");
  });
});

describe("buildOctopusPrompt", () => {
  const tentacles = normalizeHandoff(
    fallbackHandoff(input({ existing: [existingModes] })),
    [existingModes],
    snapshot.decisions,
  );
  const prompt = buildOctopusPrompt({
    plan: {
      status: "draft",
      generatedAt: "2026-09-27T10:00:00.000Z",
      source: "fallback",
      workspace: "C:/repo",
      heading: "Octoplan v2",
      tentacles,
    },
    goal,
    decisions: snapshot.decisions,
  });

  it("names every tentacle and every wave, waves in stage order", () => {
    for (const t of tentacles) expect(prompt).toContain(`| ${t.id} |`);
    const positions = stages.map((s) => prompt.indexOf(`**${s.title}**`));
    for (const at of positions) expect(at).toBeGreaterThan(-1);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("carries the goal, the rules and how to start", () => {
    expect(prompt).toContain(`# Octopus — ${goal.title}`);
    expect(prompt).toMatch(/Contracts first/);
    expect(prompt).toMatch(/One worker per tentacle/);
    expect(prompt).toMatch(/cites the D-ids/);
    expect(prompt).toMatch(/Nobody edits docs\/plan/);
    expect(prompt).toMatch(/Stop after each wave/);
    expect(prompt).toMatch(/Deck/);
    expect(prompt).toContain("| modes | apps/octoplan/server/modes/ | 0 | reused |");
  });
});
