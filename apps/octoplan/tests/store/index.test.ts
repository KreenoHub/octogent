import { PLAN_FILES } from "@octogent/octoplan-protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFsPlanStore } from "../../server/store/fsPlanStore";
import { PlanIndex } from "../../server/store/index";
import { type TempRepo, makeTempRepo } from "./helpers";

let repo: TempRepo;

beforeEach(async () => {
  repo = await makeTempRepo();
  await repo.write(
    PLAN_FILES.decisions.path,
    [
      "# Decisions",
      "",
      "<!-- op:id=D1 -->",
      "## D1 — Markdown store",
      "- date: 2026-09-25",
      "- status: active",
      "- questions: Q1, Q2",
      "",
      "<!-- op:id=D2 -->",
      "## D2 — Watch files",
      "- date: 2026-09-25",
      "- status: stale",
      "- depends-on: D1, Q2",
      "",
    ].join("\n"),
  );
  await repo.write(
    PLAN_FILES.coverage.path,
    "# Coverage\n\n<!-- op:id=data -->\n## data — Data\n- status: partial\n- confidence: medium\n- questions: Q1\n\n<!-- op:id=users -->\n## users — Users\n- status: covered\n- confidence: high\n- questions: Q1, Q3\n",
  );
  await repo.write(
    PLAN_FILES.gaps.path,
    "# Gaps\n\n<!-- op:id=G1 -->\n## G1 — Auth\n- status: open\n\n<!-- op:id=G2 -->\n## G2 — Done\n- status: closed\n",
  );
  await repo.write(
    PLAN_FILES.parked.path,
    "# Parked\n\n<!-- op:id=P1 -->\n## P1 — Budget\n- assumption: small\n- date: 2026-09-25\n- status: parked\n",
  );
});

afterEach(async () => {
  await repo.cleanup();
});

describe("PlanIndex", () => {
  it("derives links and open counts from the files", async () => {
    const data = await new PlanIndex(repo.repoPath).rebuild();
    expect(data.decisionsByQuestion).toEqual({ Q1: ["D1"], Q2: ["D1", "D2"] });
    expect(data.questionsByDecision).toEqual({ D1: ["Q1", "Q2"], D2: ["Q2"] });
    expect(data.dimensionsByQuestion).toEqual({ Q1: ["users", "data"], Q3: ["users"] });
    expect(data.questionsByDimension).toMatchObject({ data: ["Q1"], users: ["Q1", "Q3"], ux: [] });
    expect(data.openCounts).toEqual({
      activeDecisions: 1,
      staleDecisions: 1,
      openGaps: 1,
      openRisks: 0,
      parked: 1,
      inboxIdeas: 0,
      uncoveredDimensions: 11,
    });
  });

  it("rebuilds an identical index from disk after the old one is discarded", async () => {
    let index: PlanIndex | null = new PlanIndex(repo.repoPath);
    const first = structuredClone(await index.rebuild());
    index = null;
    const rebuilt = await new PlanIndex(repo.repoPath).rebuild();
    expect(rebuilt).toEqual(first);
  });

  it("re-reads only what changed and matches a full rebuild", async () => {
    const index = new PlanIndex(repo.repoPath);
    await index.rebuild();
    await repo.write(
      PLAN_FILES.gaps.path,
      "# Gaps\n\n<!-- op:id=G1 -->\n## G1 — Auth\n- status: closed\n",
    );
    const refreshed = await index.refresh([PLAN_FILES.gaps.path, "sessions/ignored.md"]);
    expect(refreshed.openCounts.openGaps).toBe(0);
    expect(refreshed).toEqual(await new PlanIndex(repo.repoPath).rebuild());
  });

  it("is what PlanStore.snapshot() and dependentDecisions() read from", async () => {
    const store = createFsPlanStore(repo.repoPath);
    try {
      const index = new PlanIndex(repo.repoPath);
      expect(await store.snapshot()).toEqual((await index.rebuild()).snapshot);
      expect((await store.dependentDecisions("Q2")).map((d) => d.id)).toEqual(["D1"]);
    } finally {
      await store.dispose();
    }
  });
});
