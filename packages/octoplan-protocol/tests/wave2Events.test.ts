import { describe, expect, it } from "vitest";
import {
  TERMINAL_PATH_RE,
  clientEventSchema,
  gitGraphSchema,
  parseClientEvent,
  parseServerEvent,
  terminalClientMessageSchema,
  terminalPath,
  terminalServerMessageSchema,
} from "../src";

const ok = (event: unknown) => clientEventSchema.safeParse(event).success;

describe("wave-2 client events", () => {
  it("accepts branching, converge, ideas, stages, export, graph and link events", () => {
    expect(ok({ type: "branch-session", sessionId: "s1", title: "What if SQLite?" })).toBe(true);
    expect(ok({ type: "converge", sessionId: "s1" })).toBe(true);
    expect(ok({ type: "search-ideas", query: "voice" })).toBe(true);
    expect(
      ok({ type: "update-idea", repoPath: "C:/r", ideaId: "I2", action: "merge", intoId: "I1" }),
    ).toBe(true);
    expect(ok({ type: "update-idea", repoPath: "C:/r", ideaId: "I2", action: "park" })).toBe(true);
    expect(ok({ type: "generate-stages", repoPath: "C:/r" })).toBe(true);
    expect(
      ok({ type: "export-tentacle", repoPath: "C:/r", tentacleId: "habit-cli", tasks: ["a"] }),
    ).toBe(true);
    expect(ok({ type: "request-graph", repoPath: "C:/r" })).toBe(true);
    expect(
      ok({ type: "link-branch", repoPath: "C:/r", branchId: "B1", gitBranch: "octoplan/x" }),
    ).toBe(true);
    expect(ok({ type: "capture-idea", repoPath: "C:/r", title: "t", tags: ["ux"] })).toBe(true);
  });

  it("rejects tentacle ids Octogent would not accept and unknown idea actions", () => {
    expect(ok({ type: "export-tentacle", repoPath: "C:/r", tentacleId: "Bad Id", tasks: [] })).toBe(
      false,
    );
    expect(ok({ type: "update-idea", repoPath: "C:/r", ideaId: "I1", action: "burn" })).toBe(false);
  });
});

describe("wave-2 server events", () => {
  it("round-trips a git graph and the smaller events", () => {
    const graph = {
      repoPath: "C:/r",
      commits: [
        { hash: "a1", parents: [], refs: ["main"], subject: "init", time: 1, lane: 0 },
        {
          hash: "b2",
          parents: ["a1"],
          refs: ["octogent/store-w1"],
          subject: "x",
          time: 2,
          lane: 1,
        },
      ],
      branches: [
        { name: "main", head: "a1", isRemote: false, ahead: 0, behind: 0 },
        {
          name: "octogent/store-w1",
          head: "b2",
          isRemote: false,
          ahead: 1,
          behind: 0,
          tentacleId: "store",
        },
      ],
      prs: [],
      lanes: [{ tentacleId: "store", branches: ["octogent/store-w1"] }],
      conversationBranches: [],
      ghAvailable: false,
      hint: "Install gh and run gh auth login",
    };
    expect(gitGraphSchema.parse(graph)).toEqual(graph);
    expect(parseServerEvent(JSON.stringify({ type: "graph", graph }))).toMatchObject({
      type: "graph",
    });
    expect(parseServerEvent(JSON.stringify({ type: "notice", message: "Captured I4" }))).toEqual({
      type: "notice",
      message: "Captured I4",
    });
    expect(
      parseServerEvent(
        JSON.stringify({
          type: "export-result",
          repoPath: "C:/r",
          tentacleId: "t",
          ok: false,
          message: "Start Octogent in this repo first",
        }),
      ),
    ).toMatchObject({ ok: false });
    expect(parseClientEvent(JSON.stringify({ type: "converge" }))).toBeNull();
  });
});

describe("pop-out terminal channel", () => {
  it("builds and matches the per-session socket path", () => {
    const path = terminalPath("abc 1");
    expect(path).toBe("/ws/terminal/abc%201");
    expect(decodeURIComponent(TERMINAL_PATH_RE.exec(path)?.[1] ?? "")).toBe("abc 1");
  });

  it("validates terminal messages", () => {
    expect(terminalClientMessageSchema.safeParse({ type: "input", data: "ls\r" }).success).toBe(
      true,
    );
    expect(
      terminalClientMessageSchema.safeParse({ type: "resize", cols: 5, rows: 20 }).success,
    ).toBe(false);
    expect(terminalServerMessageSchema.safeParse({ type: "exit", code: null }).success).toBe(true);
  });
});
