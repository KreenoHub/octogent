import { describe, expect, it } from "vitest";
import { DIGEST_HEADING, type PlanSnapshot, buildPlanDigest } from "../src";

const decision = (n: number, status: "active" | "stale" | "superseded" = "active") => ({
  id: `D${n}`,
  title: `Decision number ${n}`,
  date: "2026-09-27",
  status,
  source: "test",
  questionIds: [],
  dependsOn: [],
  body: "Long reasoning that must not appear in the digest.",
});

const empty: PlanSnapshot = {
  decisions: [],
  gaps: [],
  risks: [],
  parked: [],
  ideas: [],
  coverage: { dimensions: [] },
  goal: null,
};

describe("buildPlanDigest", () => {
  it("is empty for a repo with no plan", () => {
    expect(buildPlanDigest(empty)).toBe("");
  });

  it("lists ids, titles and status newest first, without bodies or superseded decisions", () => {
    const digest = buildPlanDigest({
      ...empty,
      decisions: [decision(1), decision(2, "stale"), decision(3, "superseded")],
    });
    expect(digest.startsWith(DIGEST_HEADING)).toBe(true);
    expect(digest).toContain("- D2 [stale] Decision number 2");
    expect(digest.indexOf("D2 [stale]")).toBeLessThan(digest.indexOf("D1 [active]"));
    expect(digest).not.toContain("D3");
    expect(digest).not.toContain("Long reasoning");
  });

  it("caps a big plan at 60 lines and says how many were left out", () => {
    const digest = buildPlanDigest(
      {
        ...empty,
        goal: { title: "Big plan", why: "", goals: [], nonGoals: [], done: [] },
        decisions: Array.from({ length: 80 }, (_, i) => decision(i + 1)),
        gaps: Array.from({ length: 10 }, (_, i) => ({
          id: `G${i + 1}`,
          title: `Gap ${i + 1}`,
          status: "open" as const,
          body: "",
        })),
      },
      [{ id: "C1", title: "Use pnpm", date: "2026-09-27", body: "" }],
    );
    const lines = digest.split("\n");
    expect(lines.length).toBeLessThanOrEqual(60);
    expect(digest).toContain("- D80 [active]");
    expect(digest).toMatch(/…and \d+ more in docs\/plan/);
    expect(digest).toContain("G10 Gap 10");
    expect(digest).toContain("C1 Use pnpm");
  });
});
