import {
  type Decision,
  type GoalDoc,
  parseStage,
  serializeStage,
} from "@octogent/octoplan-protocol";
import { describe, expect, it } from "vitest";
import { buildStages } from "../../server/modes";

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
    for (const stage of buildStages(goal, decisions)) {
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
});
