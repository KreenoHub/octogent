import { describe, expect, it } from "vitest";
import {
  GH_MAX_INTERVAL_MS,
  GH_MIN_INTERVAL_MS,
  createGithubReader,
  mapChecks,
  mapPrState,
} from "../../server/integrations/github";
import { createFakeExec, fail, fixture, ok } from "./fakeExec";

const repo = "C:\\repos\\fixture";

const ghRoutes = () => ({
  "gh pr list": ok(fixture("prList.json")),
  "gh pr checks 12": ok(fixture("checks-12.json")),
  // gh exits non-zero while checks are failing or pending but still prints JSON
  "gh pr checks 13": fail(1, "", fixture("checks-13.json")),
  "gh pr checks 14": fail(8, "", fixture("checks-14.json")),
  "gh pr checks 15": fail(1, "no checks reported on the 'fix/z' branch"),
});

const clock = (start = 1_000_000) => {
  let t = start;
  return {
    now: () => new Date(t),
    advance: (ms: number) => {
      t += ms;
    },
  };
};

describe("check and state mapping", () => {
  it("maps check states to passing / failing / pending / none", () => {
    expect(mapChecks([{ state: "SUCCESS" }, { state: "SKIPPED" }, { state: "NEUTRAL" }])).toBe(
      "passing",
    );
    expect(mapChecks([{ state: "SUCCESS" }, { state: "FAILURE" }, { state: "PENDING" }])).toBe(
      "failing",
    );
    expect(mapChecks([{ state: "SUCCESS" }, { state: "IN_PROGRESS" }])).toBe("pending");
    expect(mapChecks([{ state: "QUEUED" }])).toBe("pending");
    expect(mapChecks([{ state: "CANCELLED" }])).toBe("failing");
    expect(mapChecks([])).toBe("none");
    expect(mapChecks([{ state: "SKIPPED" }])).toBe("none");
  });

  it("maps PR states", () => {
    expect(mapPrState("OPEN")).toBe("open");
    expect(mapPrState("MERGED")).toBe("merged");
    expect(mapPrState("CLOSED")).toBe("closed");
  });
});

describe("createGithubReader", () => {
  it("reads PRs and checks with the documented gh args", async () => {
    const { exec, calls } = createFakeExec(ghRoutes());
    const reader = createGithubReader({ exec, now: clock().now });
    const result = await reader.read(repo);

    expect(result.ghAvailable).toBe(true);
    expect(result.hint).toBeUndefined();
    expect(calls[0]?.args).toEqual([
      "pr",
      "list",
      "--json",
      "number,title,headRefName,state,isDraft,url",
      "--state",
      "all",
      "--limit",
      "30",
    ]);
    expect(calls[0]?.cwd).toBe(repo);
    expect(calls.find((c) => c.args.includes("12"))?.args).toEqual([
      "pr",
      "checks",
      "12",
      "--json",
      "state",
    ]);
    // only open PRs get a checks call
    expect(calls.some((c) => c.args[1] === "checks" && c.args[2] === "9")).toBe(false);

    const byNumber = Object.fromEntries(result.prs.map((p) => [p.number, p]));
    expect(byNumber[12]).toEqual({
      number: 12,
      title: "Feat X",
      headRef: "feat/x",
      state: "open",
      isDraft: false,
      checks: "passing",
      url: "https://github.com/o/r/pull/12",
    });
    expect(byNumber[13]).toMatchObject({ isDraft: true, checks: "failing" });
    expect(byNumber[14]?.checks).toBe("pending");
    expect(byNumber[15]?.checks).toBe("none");
    expect(byNumber[9]).toMatchObject({ state: "merged", checks: "none" });
  });

  it("degrades to ghAvailable=false with an install hint when gh is missing", async () => {
    const { exec } = createFakeExec({ gh: fail(127, "command not found: gh") });
    const reader = createGithubReader({ exec, now: clock().now });
    const result = await reader.read(repo);
    expect(result).toMatchObject({ ghAvailable: false, prs: [] });
    expect(result.hint).toMatch(/install.*gh/i);
  });

  it("hints at gh auth login when gh is not signed in", async () => {
    const { exec } = createFakeExec({
      gh: fail(4, "To get started with GitHub CLI, please run:  gh auth login"),
    });
    const result = await createGithubReader({ exec, now: clock().now }).read(repo);
    expect(result.ghAvailable).toBe(false);
    expect(result.hint).toMatch(/gh auth login/);
  });

  it("hints at gh repo set-default when the repo has several remotes", async () => {
    const { exec } = createFakeExec({
      gh: fail(1, "X No default remote repository has been set. please run `gh repo set-default`"),
    });
    const result = await createGithubReader({ exec, now: clock().now }).read(repo);
    expect(result.hint).toMatch(/gh repo set-default/);
  });

  it("caches for 60 s, then backs off while nothing changes, and resets on change", async () => {
    let prList = fixture("prList.json");
    const { exec, calls } = createFakeExec({ ...ghRoutes(), "gh pr list": () => ok(prList) });
    const time = clock();
    const reader = createGithubReader({ exec, now: time.now });
    const listCalls = () => calls.filter((c) => c.args[1] === "list").length;

    await reader.read(repo);
    expect(listCalls()).toBe(1);

    time.advance(GH_MIN_INTERVAL_MS - 1);
    const cached = await reader.read(repo);
    expect(listCalls()).toBe(1);
    expect(cached.prs).toHaveLength(5);

    time.advance(1);
    await reader.read(repo); // unchanged -> next interval doubles to 120 s
    expect(listCalls()).toBe(2);
    time.advance(GH_MIN_INTERVAL_MS);
    await reader.read(repo);
    expect(listCalls()).toBe(2);
    time.advance(GH_MIN_INTERVAL_MS);
    await reader.read(repo);
    expect(listCalls()).toBe(3);

    // backoff never exceeds 10 minutes
    for (let i = 0; i < 8; i += 1) {
      time.advance(GH_MAX_INTERVAL_MS);
      await reader.read(repo);
    }
    const before = listCalls();
    time.advance(GH_MAX_INTERVAL_MS);
    await reader.read(repo);
    expect(listCalls()).toBe(before + 1);

    // a change resets the interval to 60 s
    prList = "[]";
    time.advance(GH_MAX_INTERVAL_MS);
    const changed = await reader.read(repo);
    expect(changed.prs).toEqual([]);
    time.advance(GH_MIN_INTERVAL_MS);
    await reader.read(repo);
    expect(listCalls()).toBe(before + 3);
  });

  it("force-refresh bypasses the cache but still respects the 60 s floor", async () => {
    const { exec, calls } = createFakeExec(ghRoutes());
    const time = clock();
    const reader = createGithubReader({ exec, now: time.now });
    await reader.read(repo);
    time.advance(GH_MIN_INTERVAL_MS * 3);
    await reader.read(repo); // interval is now 120 s
    time.advance(GH_MIN_INTERVAL_MS);
    await reader.read(repo, { force: true });
    expect(calls.filter((c) => c.args[1] === "list")).toHaveLength(3);
    await reader.read(repo, { force: true });
    expect(calls.filter((c) => c.args[1] === "list")).toHaveLength(3);
  });

  it("backs off after a failure too", async () => {
    const { exec, calls } = createFakeExec({ gh: fail(127, "command not found: gh") });
    const time = clock();
    const reader = createGithubReader({ exec, now: time.now });
    await reader.read(repo);
    time.advance(GH_MIN_INTERVAL_MS);
    await reader.read(repo);
    time.advance(GH_MIN_INTERVAL_MS);
    const third = await reader.read(repo);
    expect(calls).toHaveLength(2);
    expect(third.ghAvailable).toBe(false);
  });
});
