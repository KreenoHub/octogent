import { parseGoalDoc, serializeGoalDoc } from "@octogent/octoplan-protocol";
import { describe, expect, it } from "vitest";
import { buildGoalDoc, writeGoalInputSchema } from "../../server/modes/goal";

const valid = {
  title: "  Magic-link login  ",
  why: "  Passwords cause 30% of support tickets.  ",
  goals: ["Email magic link", " email magic link ", "Session lasts 30 days", ""],
  nonGoals: ["SSO", "SSO", "  "],
  done: [
    "`pnpm test` passes",
    { text: "POST /api/login returns 202 for a known email", status: "partial" as const },
    { text: "The login page shows a 'check your inbox' notice", evidence: "  e2e run 12 " },
    "`pnpm test` passes",
  ],
};

describe("buildGoalDoc", () => {
  it("normalizes text, dedupes goals and assigns DOD ids", () => {
    const result = buildGoalDoc(valid);
    if (!result.ok) throw new Error(result.error);
    expect(result.goal).toEqual({
      title: "Magic-link login",
      why: "Passwords cause 30% of support tickets.",
      goals: ["Email magic link", "Session lasts 30 days"],
      nonGoals: ["SSO"],
      done: [
        { id: "DOD1", text: "`pnpm test` passes", status: "unknown", evidence: "" },
        {
          id: "DOD2",
          text: "POST /api/login returns 202 for a known email",
          status: "partial",
          evidence: "",
        },
        {
          id: "DOD3",
          text: "The login page shows a 'check your inbox' notice",
          status: "unknown",
          evidence: "e2e run 12",
        },
      ],
    });
  });

  it("keeps valid unique DOD ids and fills the rest", () => {
    const result = buildGoalDoc({
      title: "X",
      done: [
        { id: "DOD7", text: "`pnpm build` passes" },
        { id: "DOD7", text: "The CLI prints the version" },
        { id: "custom", text: "Smoke test runs green" },
      ],
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.goal.done.map((d) => d.id)).toEqual(["DOD7", "DOD8", "DOD9"]);
  });

  it("rejects DoD items without a checkable verb, naming each one", () => {
    const result = buildGoalDoc({
      title: "X",
      done: ["`pnpm test` passes", "Good UX", "Users are happy"],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('"Good UX"');
    expect(result.error).toContain('"Users are happy"');
    expect(result.error).not.toContain("`pnpm test` passes");
    expect(result.error).toMatch(/run.*shows.*returns.*passes/);
    expect(result.error).toContain("plan_write_goal");
  });

  it("rejects a goal without a title or without DoD items", () => {
    const noTitle = buildGoalDoc({ title: "  ", done: ["`pnpm test` passes"] });
    expect(noTitle.ok).toBe(false);
    if (!noTitle.ok) expect(noTitle.error).toMatch(/title/i);
    const noDone = buildGoalDoc({ title: "X", done: [] });
    expect(noDone.ok).toBe(false);
    if (!noDone.ok) expect(noDone.error).toMatch(/definition of done/i);
  });

  it("round-trips through serializeGoalDoc / parseGoalDoc", () => {
    const result = buildGoalDoc(valid);
    if (!result.ok) throw new Error(result.error);
    const parsed = parseGoalDoc(serializeGoalDoc(result.goal));
    expect(parsed.goal).toEqual(result.goal);
    expect(parsed.extra).toBe("");
  });

  it("exposes a zod schema for the plan_write_goal tool input", () => {
    expect(writeGoalInputSchema.safeParse(valid).success).toBe(true);
    expect(writeGoalInputSchema.safeParse({ done: [] }).success).toBe(false);
  });
});
