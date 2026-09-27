// D37: a fork PR headed at `main` must not badge local main.
import type { GitGraph } from "@octogent/octoplan-protocol";
import { describe, expect, it } from "vitest";
import { createIntegrations } from "../../server/integrations";
import { fetchGithub, ownerFromRemote } from "../../server/integrations/github";
import { prForBranch } from "../../web/src/integrations/graphLayout";
import { createFakeExec, fail, gitRoutes, ok } from "./fakeExec";

const repo = "C:\\repos\\fixture";

/** Recorded `gh pr list` with headRepositoryOwner: #31 is a fork PR from someone's `main`. */
const prList = (withCrossRepoField: boolean) =>
  JSON.stringify([
    {
      number: 31,
      title: "Fork contribution",
      headRefName: "main",
      headRepositoryOwner: { id: "U_1", login: "someone" },
      ...(withCrossRepoField ? { isCrossRepository: true } : {}),
      state: "OPEN",
      isDraft: false,
      url: "https://github.com/KreenoHub/octogent/pull/31",
    },
    {
      number: 32,
      title: "Own branch",
      headRefName: "feat/x",
      headRepositoryOwner: { id: "U_2", login: "KreenoHub" },
      ...(withCrossRepoField ? { isCrossRepository: false } : {}),
      state: "OPEN",
      isDraft: false,
      url: "https://github.com/KreenoHub/octogent/pull/32",
    },
  ]);

const ghRoutes = (withCrossRepoField: boolean) => ({
  "gh pr list": ok(prList(withCrossRepoField)),
  "gh pr checks": ok(JSON.stringify([{ state: "SUCCESS" }])),
  "gh repo view --json owner": ok(JSON.stringify({ owner: { id: "O_1", login: "kreenohub" } })),
});

describe("fork PR badges (D37)", () => {
  it("asks gh for headRepositoryOwner and marks fork heads as owner:branch", async () => {
    const { exec, calls } = createFakeExec(ghRoutes(false));
    const result = await fetchGithub(exec, repo);
    expect(calls[0]?.args[3]).toContain("headRepositoryOwner");
    expect(calls.some((c) => c.args.join(" ") === "repo view --json owner")).toBe(true);
    expect(result.prs.map((p) => [p.number, p.headRef])).toEqual([
      [31, "someone:main"],
      [32, "feat/x"],
    ]);
  });

  it("uses isCrossRepository when gh returns it (no extra repo lookup)", async () => {
    const { exec, calls } = createFakeExec(ghRoutes(true));
    const result = await fetchGithub(exec, repo);
    expect(calls.some((c) => c.args[0] === "repo")).toBe(false);
    expect(result.prs.find((p) => p.number === 31)?.headRef).toBe("someone:main");
  });

  it("falls back to the origin remote's owner when gh repo view fails", async () => {
    const { exec } = createFakeExec({
      ...ghRoutes(false),
      "gh repo view --json owner": fail(1, "no default repo"),
      "git remote get-url origin": ok("git@github.com:KreenoHub/octogent.git\n"),
    });
    const result = await fetchGithub(exec, repo);
    expect(result.prs.find((p) => p.number === 31)?.headRef).toBe("someone:main");
    expect(ownerFromRemote("https://github.com/KreenoHub/octogent")).toBe("KreenoHub");
  });

  it("shows no PR badge on local main in the graph", async () => {
    const { exec } = createFakeExec({ ...gitRoutes(), ...ghRoutes(false) });
    const graph: GitGraph = await createIntegrations({ exec }).buildGraph(repo, []);
    expect(graph.branches.some((b) => b.name === "main" && !b.isRemote)).toBe(true);
    expect(prForBranch(graph, "main", false)).toBeUndefined();
    expect(prForBranch(graph, "origin/main", true)).toBeUndefined();
    expect(prForBranch(graph, "feat/x", false)?.number).toBe(32);
  });
});
