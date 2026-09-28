import { afterEach, describe, expect, it } from "vitest";
import { splitSections, summarizeToolUse } from "../../server/bridge/blocks";
import { createPlanToolHandlers } from "../../server/bridge/planTools";
import { isToolAllowed } from "../../server/bridge/toolPolicy";
import { applyCoverageUpdate } from "../../server/modes";
import { createFsPlanStore } from "../../server/store/fsPlanStore";
import { tempRepo } from "./fakes";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const handlersFor = () => {
  const repo = tempRepo();
  cleanups.push(repo.cleanup);
  const store = createFsPlanStore(repo.dir);
  return {
    store,
    handlers: createPlanToolHandlers({ store, applyCoverageUpdate, today: () => "2026-09-25" }),
  };
};

const text = (r: { content: Array<{ text: string }> }) => r.content[0]?.text;

describe("plan tools", () => {
  it("records decisions, gaps, risks, parked items and ideas with allocated ids", async () => {
    const { store, handlers } = handlersFor();
    expect(
      text(
        await handlers.plan_record_decision({
          title: "Use SQLite",
          body: "Local only",
          questionIds: ["Q2"],
        }),
      ),
    ).toBe("Recorded D1: Use SQLite");
    expect(text(await handlers.plan_add_gap({ title: "Backup story", dimension: "ops" }))).toBe(
      "Recorded G1: Backup story",
    );
    expect(
      text(await handlers.plan_add_risk({ title: "Team later", origin: "Q1 tentative" })),
    ).toBe("Recorded R1: Team later");
    expect(
      text(await handlers.plan_park({ title: "Pricing?", assumption: "free", questionId: "Q3" })),
    ).toContain("Parked P1");
    expect(text(await handlers.plan_add_idea({ title: "Voice answers", tags: ["ux"] }))).toBe(
      "Recorded I1: Voice answers",
    );
    const plan = await store.snapshot();
    expect(plan.decisions[0]).toMatchObject({ id: "D1", questionIds: ["Q2"], status: "active" });
    expect(plan.gaps[0]).toMatchObject({ dimension: "ops", status: "open" });
    expect(plan.parked[0]).toMatchObject({ assumption: "free", date: "2026-09-25" });
  });

  it("applies coverage updates forward-only through the modes engine", async () => {
    const { store, handlers } = handlersFor();
    await handlers.plan_update_coverage({ id: "users", status: "covered", confidence: "high" });
    await handlers.plan_update_coverage({ id: "users", status: "partial" });
    const users = (await store.snapshot()).coverage.dimensions.find((d) => d.id === "users");
    expect(users?.status).toBe("covered");
  });

  it("rejects GOAL.md without checkable done items and writes a valid one", async () => {
    const { store, handlers } = handlersFor();
    const rejected = await handlers.plan_write_goal({ title: "Habits", done: ["it is nice"] });
    expect(rejected.isError).toBe(true);
    const accepted = await handlers.plan_write_goal({
      title: "Habits",
      why: "Streaks keep habits.",
      goals: ["Log a habit"],
      done: ["`habit log` runs and shows today's streak"],
    });
    expect(accepted.isError).toBeUndefined();
    expect((await store.snapshot()).goal?.done).toHaveLength(1);
  });
});

describe("bridge helpers", () => {
  it("splits replies into sections by heading but not inside code fences", () => {
    expect(splitSections("Intro\n## A\none\n```\n# not a heading\n```\n## B\ntwo")).toEqual([
      { heading: "", markdown: "Intro" },
      { heading: "A", markdown: "one\n```\n# not a heading\n```" },
      { heading: "B", markdown: "two" },
    ]);
  });

  it("matches the planning allowlist with wildcards", () => {
    const allowed = ["Read", "AskUserQuestion", "mcp__octoplan__*"];
    expect(isToolAllowed("mcp__octoplan__plan_add_gap", allowed)).toBe(true);
    expect(isToolAllowed("mcp__other__x", allowed)).toBe(false);
    expect(isToolAllowed("Bash", allowed)).toBe(false);
  });

  it("summarizes tool calls on one line", () => {
    expect(summarizeToolUse("Read", { file_path: "README.md" })).toBe("Read · README.md");
    expect(summarizeToolUse("mcp__octoplan__plan_record_decision", { title: "X" })).toBe(
      "plan_record_decision · X",
    );
  });
});
