import type { ConversationBranch } from "@octogent/octoplan-protocol";
import { gitGraphSchema } from "@octogent/octoplan-protocol";
import { describe, expect, it } from "vitest";
import { createIntegrations } from "../../server/integrations";
import { createFakeExec, fail, fixture, gitRoutes, ok } from "./fakeExec";

const repo = "C:\\repos\\fixture";
const b1: ConversationBranch = {
  id: "B1",
  title: "Try swimlanes",
  sessionId: "s2",
  parentSessionId: "s1",
  gitBranch: "feat/x",
  status: "exploring",
  body: "",
};

describe("createIntegrations().buildGraph", () => {
  it("combines git, gh and conversation branches into a valid GitGraph", async () => {
    const { exec } = createFakeExec({
      ...gitRoutes(),
      "gh pr list": ok(fixture("prList.json")),
      "gh pr checks": ok(fixture("checks-12.json")),
    });
    const graph = await createIntegrations({ exec }).buildGraph(repo, [b1]);
    expect(() => gitGraphSchema.parse(graph)).not.toThrow();
    expect(graph.repoPath).toBe(repo);
    expect(graph.commits).toHaveLength(7);
    expect(graph.ghAvailable).toBe(true);
    expect(graph.prs.map((p) => p.number)).toEqual([12, 13, 14, 15, 9]);
    expect(graph.lanes.map((l) => l.tentacleId)).toEqual(["api", "my-todo-app"]);
    expect(graph.conversationBranches).toEqual([b1]);
  });

  it("keeps the git graph and adds a hint when gh is missing", async () => {
    const { exec } = createFakeExec({ ...gitRoutes(), gh: fail(127, "command not found: gh") });
    const graph = await createIntegrations({ exec }).buildGraph(repo, []);
    expect(graph.commits).toHaveLength(7);
    expect(graph.ghAvailable).toBe(false);
    expect(graph.prs).toEqual([]);
    expect(graph.hint).toMatch(/gh/);
  });

  it("returns an empty graph outside a git repo without calling gh", async () => {
    const { exec, calls } = createFakeExec({ git: fail(128, "fatal: not a git repository") });
    const graph = await createIntegrations({ exec }).buildGraph(repo, [b1]);
    expect(graph.commits).toEqual([]);
    expect(graph.hint).toMatch(/not a git repository/);
    expect(graph.conversationBranches).toEqual([b1]);
    expect(calls.some((c) => c.command === "gh")).toBe(false);
  });
});
