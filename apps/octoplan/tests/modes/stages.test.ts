import {
  type Decision,
  type GoalDoc,
  parseStage,
  serializeStage,
} from "@octogent/octoplan-protocol";
import { describe, expect, it } from "vitest";
import { buildStages } from "../../server/modes";
import { loadV2Plan } from "./v2Fixture";

const goal: GoalDoc = {
  title: "Team digest",
  why: "People miss updates buried in chat.",
  goals: ["Send a weekly digest email", "Let users opt out"],
  nonGoals: ["Mobile push notifications"],
  done: [
    {
      id: "DOD-1",
      text: "`pnpm test digest` passes with the weekly digest builder covered",
      status: "unknown",
      evidence: "",
    },
    {
      id: "DOD-2",
      text: "The email renders in the preview route `/digest/preview`",
      status: "partial",
      evidence: "",
    },
    {
      id: "DOD-3",
      text: "Opt-out link flips the user's digest setting (API test passes)",
      status: "unknown",
      evidence: "",
    },
    {
      id: "DOD-4",
      text: "Cron job sends the digest on Mondays (scheduler test passes)",
      status: "covered",
      evidence: "ran it",
    },
  ],
};

const decision = (id: string, title: string, status: Decision["status"] = "active"): Decision => ({
  id,
  title,
  date: "2026-09-27",
  status,
  source: "octoplan session",
  questionIds: [],
  dependsOn: [],
  body: "",
});

const decisions = [
  decision("D1", "Digest builder uses MJML templates"),
  decision("D2", "Opt-out lives in the user settings API"),
  decision("D3", "Old SMS idea", "superseded"),
];

describe("buildStages", () => {
  it("produces 2–5 stages indexed from 1", () => {
    const stages = buildStages(goal, decisions);
    expect(stages.length).toBeGreaterThanOrEqual(2);
    expect(stages.length).toBeLessThanOrEqual(5);
    expect(stages.map((s) => s.index)).toEqual(stages.map((_, i) => i + 1));
  });

  it("caps at 5 stages for a long definition of done and still covers every item", () => {
    const long: GoalDoc = {
      ...goal,
      done: Array.from({ length: 11 }, (_, i) => ({
        id: `DOD-${i + 1}`,
        text: `Check number ${i + 1} passes`,
        status: "unknown" as const,
        evidence: "",
      })),
    };
    const stages = buildStages(long, decisions);
    expect(stages).toHaveLength(5);
    const all = stages.map((s) => s.prompt).join("\n");
    for (const item of long.done) expect(all).toContain(item.text);
  });

  it("builds two stages from a single DoD item", () => {
    const one: GoalDoc = { ...goal, done: goal.done.slice(0, 1) };
    expect(buildStages(one, [])).toHaveLength(2);
  });

  it("round-trips every stage through serializeStage/parseStage", () => {
    // STAGE-n.md doesn't store decisionIds (yet); the handoff re-reads them from the prompt.
    for (const { decisionIds: _ids, ...stage } of buildStages(goal, decisions)) {
      expect(parseStage(serializeStage(stage))).toEqual(stage);
    }
  });

  it("makes every prompt self-contained with Done when, DoD items, decision ids and a stop", () => {
    const stages = buildStages(goal, decisions);
    const covered = new Set<string>();
    for (const stage of stages) {
      const { prompt } = stage;
      expect(prompt).toContain("Team digest");
      expect(prompt).toContain("People miss updates buried in chat.");
      expect(prompt).toContain("Mobile push notifications");
      const doneWhen = prompt.split("## Done when")[1] ?? "";
      expect(doneWhen).not.toBe("");
      const checks = doneWhen.split("\n").filter((line) => line.startsWith("- [ ] "));
      expect(checks.length).toBeGreaterThan(0);
      for (const item of goal.done) if (doneWhen.includes(item.text)) covered.add(item.id);
      expect(prompt).toMatch(/\bD[12]\b/);
      expect(prompt).not.toMatch(/\bD3\b/);
      const lastLine = prompt.trim().split("\n").at(-1) ?? "";
      expect(lastLine).toMatch(/^STOP/);
      expect(prompt).toContain(`Stage ${stage.index} of ${stages.length}`);
    }
    expect([...covered].sort()).toEqual(["DOD-1", "DOD-2", "DOD-3", "DOD-4"]);
  });

  it("cites the decisions a stage relies on", () => {
    const stages = buildStages(goal, decisions);
    const optOut = stages.find((s) => s.prompt.includes("Opt-out link flips"));
    expect(optOut?.prompt).toContain("D2 — Opt-out lives in the user settings API");
  });

  it("is deterministic", () => {
    expect(buildStages(goal, decisions)).toEqual(buildStages(goal, decisions));
  });

  it("refuses a goal without definition-of-done items", () => {
    expect(() => buildStages({ ...goal, done: [] }, decisions)).toThrow(/definition of done/i);
  });

  it("titles chunked stages with a few words, never a cut-off line", () => {
    const stages = buildStages(goal, decisions);
    for (const stage of stages) {
      expect(stage.title).not.toMatch(/…$|\.\.\.$/);
      if (stage.index < stages.length) expect(stage.title.split(" ").length).toBeLessThanOrEqual(5);
    }
    expect(stages[0]?.title).toBe("Weekly digest builder covered");
  });

  it("sets decisionIds on every stage, matching the decisions its prompt cites", () => {
    for (const stage of buildStages(goal, decisions)) {
      expect(stage.decisionIds).toBeDefined();
      for (const id of stage.decisionIds ?? []) expect(stage.prompt).toContain(`- ${id} — `);
    }
  });

  it("prefers the D-ids a DoD item cites (plus their depends-on) over shared words", () => {
    const cited: GoalDoc = {
      ...goal,
      done: [{ id: "DOD-1", text: "Digest opt-out works (D5)", status: "unknown", evidence: "" }],
    };
    const withDeps = [
      ...decisions,
      { ...decision("D5", "Opt-out is one click"), dependsOn: ["D2", "D3"] },
    ];
    const [first] = buildStages(cited, withDeps);
    // D5 is cited, D2 is its active dependency; D3 is superseded; D1 only shares a word.
    expect(first?.decisionIds).toEqual(["D2", "D5"]);
  });
});

describe("buildStages on the real v2 plan (docs/plan GOAL.md + DECISIONS.md)", () => {
  const { goal: v2Goal, decisions: v2Decisions } = loadV2Plan();
  const stages = buildStages(v2Goal, v2Decisions);

  it("makes one stage per D41 wave, in order, named after the wave", () => {
    expect(stages.slice(0, 3).map((s) => s.title)).toEqual([
      "Wave 3 — focus",
      "Wave 4 — memory",
      "Wave 5 — overview",
    ]);
    expect(stages[0]?.prompt).toContain("- answer chips");
    expect(stages[1]?.prompt).toContain("- recap");
    expect(stages[2]?.prompt).toContain("- History tab");
    expect(stages.at(-1)?.title).toBe("Integrate and verify end to end");
  });

  it("keeps gate items (e2e, full test runs, the week of real use) for the final stage", () => {
    const buildDone = stages
      .slice(0, -1)
      .map((s) => s.prompt.split("## Done when")[1] ?? "")
      .join("\n");
    for (const id of ["DOD1", "DOD2", "DOD3", "DOD5", "DOD8", "DOD10", "DOD11"]) {
      expect(buildDone).not.toContain(`${id}:`);
    }
    expect(stages[1]?.prompt).toContain("DOD4:");
    expect(stages[2]?.prompt).toContain("DOD9:");
    const finalDone = stages.at(-1)?.prompt.split("## Done when")[1] ?? "";
    for (const item of v2Goal.done) expect(finalDone).toContain(`${item.id}:`);
  });

  it("puts the wave's own decisions in its stage", () => {
    expect(stages[0]?.decisionIds).toEqual(expect.arrayContaining(["D14", "D25", "D43"]));
    expect(stages[1]?.decisionIds).toEqual(expect.arrayContaining(["D16", "D28", "D31"]));
    expect(stages[2]?.decisionIds).toEqual(expect.arrayContaining(["D24", "D42"]));
  });

  it("lists at most 12 decisions per stage, and every stage has decisionIds", () => {
    for (const stage of stages) {
      expect(stage.decisionIds?.length ?? 0).toBeGreaterThan(0);
      expect(stage.decisionIds?.length).toBeLessThanOrEqual(12);
      const listed = (stage.prompt.split("## Decisions this stage relies on")[1] ?? "")
        .split("## Done when")[0]
        ?.split("\n")
        .filter((line) => /^- D\d+ — /.test(line));
      expect(listed?.length).toBe(stage.decisionIds?.length);
    }
  });

  it("never titles a stage with an ellipsis", () => {
    for (const stage of stages) expect(stage.title).not.toMatch(/…$/);
  });

  it("gives work no wave claims (the handoff goal) its own stage before the final one", () => {
    const rest = stages.find((s) => s.title === "Remaining goals");
    expect(rest?.index).toBe(stages.length - 1);
    expect(rest?.decisionIds).toEqual(expect.arrayContaining(["D44", "D45", "D47"]));
  });
});
