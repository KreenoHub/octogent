import type { ServerEvent } from "@octogent/octoplan-protocol";
import { describe, expect, it } from "vitest";
import {
  MAX_NOTICES,
  type PlanClientAction,
  type PlanClientState,
  initialPlanClientState,
  planClientReducer,
} from "../../web/src/app/planClientReducer";
import { graph, idea, stage } from "./fixtures";

const run = (...events: PlanClientAction[]): PlanClientState =>
  events.reduce(planClientReducer, initialPlanClientState);

const ALPHA = "C:\\repos\\alpha";

describe("planClientReducer · wave 2", () => {
  it("notice queues toasts with increasing ids and keeps an optional session id", () => {
    const state = run(
      { type: "notice", message: "Captured I4" },
      { type: "notice", message: "Branched", sessionId: "s1" },
    );
    expect(state.notices).toEqual([
      { id: 1, message: "Captured I4" },
      { id: 2, message: "Branched", sessionId: "s1" },
    ]);
  });

  it("caps the notice queue without reusing ids", () => {
    const events: ServerEvent[] = Array.from({ length: MAX_NOTICES + 5 }, (_, i) => ({
      type: "notice",
      message: `n${i}`,
    }));
    const state = run(...events);
    expect(state.notices).toHaveLength(MAX_NOTICES);
    expect(state.notices[0]?.id).toBe(6);
    expect(state.notices.at(-1)?.id).toBe(MAX_NOTICES + 5);
  });

  it("ideas replaces the latest search result", () => {
    const state = run(
      { type: "ideas", query: "old", results: [] },
      { type: "ideas", query: "offline", results: [{ repoPath: ALPHA, idea: idea() }] },
    );
    expect(state.ideaSearch?.query).toBe("offline");
    expect(state.ideaSearch?.results[0]?.idea.id).toBe("I1");
  });

  it("stages are kept per repo", () => {
    const state = run(
      { type: "stages", repoPath: ALPHA, stages: [stage()] },
      { type: "stages", repoPath: "C:\\repos\\beta", stages: [] },
      { type: "stages", repoPath: ALPHA, stages: [stage(), stage({ index: 2, title: "Two" })] },
    );
    expect(state.stagesByRepo[ALPHA]?.map((s) => s.index)).toEqual([1, 2]);
    expect(state.stagesByRepo["C:\\repos\\beta"]).toEqual([]);
  });

  it("export-result appends with a sequence shared with notices", () => {
    const state = run(
      { type: "notice", message: "hi" },
      { type: "export-result", repoPath: ALPHA, tentacleId: "alpha", ok: true, message: "5 tasks" },
    );
    expect(state.exportResults).toEqual([
      { seq: 2, repoPath: ALPHA, tentacleId: "alpha", ok: true, message: "5 tasks" },
    ]);
  });

  it("graph stores the graph per repo and clears its loading flag", () => {
    const requested = run({ type: "local/graph-requested", repoPath: ALPHA });
    expect(requested.graphLoadingByRepo[ALPHA]).toBe(true);
    const loaded = planClientReducer(requested, { type: "graph", graph: graph() });
    expect(loaded.graphByRepo[ALPHA]?.commits).toHaveLength(1);
    expect(loaded.graphLoadingByRepo[ALPHA]).toBeUndefined();
  });

  it("a server error clears stuck graph loading flags", () => {
    const state = run(
      { type: "local/graph-requested", repoPath: ALPHA },
      { type: "error", message: "git not found" },
    );
    expect(state.graphLoadingByRepo).toEqual({});
    expect(state.errors).toEqual([{ message: "git not found" }]);
  });
});
