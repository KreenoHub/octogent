import type { CanUseTool, Options } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vitest";
import {
  HANDOFF_TOOL,
  HARVEST_TOOL,
  INGEST_MAX_TURNS,
  INGEST_TOOL,
  createHeadlessRunner,
} from "../../server/bridge/headless";
import type { QueryFn } from "../../server/bridge/types";
import { createFakeQuery, result, sdkServerTools } from "./fakes";

const decide = async (options: Options, toolName: string) => {
  const canUseTool = options.canUseTool as CanUseTool;
  const decision = await canUseTool(toolName, {}, {
    signal: new AbortController().signal,
  } as Parameters<CanUseTool>[2]);
  return decision?.behavior;
};

const lockdown = async (options: Options, ownTool: string) => {
  expect(options.cwd).toBe("C:\\repo");
  expect(options.tools).toEqual(["Read", "Glob", "Grep"]);
  expect(options.settingSources).toEqual(["project"]);
  expect(options.maxTurns).toBe(12);
  expect(options.systemPrompt).toEqual(
    expect.objectContaining({ type: "preset", preset: "claude_code" }),
  );
  expect(Object.keys(options.mcpServers ?? {})).toEqual(["octoplan"]);
  expect(sdkServerTools(options).names).toEqual([ownTool]);
  expect(await decide(options, "Read")).toBe("allow");
  expect(await decide(options, "Grep")).toBe("allow");
  expect(await decide(options, `mcp__octoplan__${ownTool}`)).toBe("allow");
  for (const denied of [
    "Bash",
    "Edit",
    "Write",
    "AskUserQuestion",
    "mcp__octoplan__plan_record_decision",
  ]) {
    expect(await decide(options, denied)).toBe("deny");
  }
};

describe("headless runner (D31, D45)", () => {
  it("harvest: one locked-down query with only plan_add_harvest, returning every candidate", async () => {
    const fake = createFakeQuery(async function* ({ options, next }) {
      await next();
      await lockdown(options, HARVEST_TOOL);
      const tools = sdkServerTools(options);
      await tools.call(HARVEST_TOOL, {
        title: "Switch to SQLite",
        body: "abc123 replaced the JSON store",
        source: "abc123",
        sourceKind: "commit",
        contradicts: ["D2"],
      });
      await tools.call(HARVEST_TOOL, {
        title: "",
        body: "",
        source: "x",
        sourceKind: "commit",
        contradicts: [],
      });
      await tools.call(HARVEST_TOOL, {
        title: "Drop the pop-out",
        body: "",
        source: "todo:bridge",
        sourceKind: "todo",
        contradicts: [],
      });
      yield result();
    });
    const runner = createHeadlessRunner({ query: fake.query });
    const candidates = await runner.harvest({ repoPath: "C:\\repo", prompt: "Harvest these." });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.received).toEqual(["Harvest these."]);
    expect(candidates).toEqual([
      {
        title: "Switch to SQLite",
        body: "abc123 replaced the JSON store",
        source: "abc123",
        sourceKind: "commit",
        contradicts: ["D2"],
      },
      {
        title: "Drop the pop-out",
        body: "",
        source: "todo:bridge",
        sourceKind: "todo",
        contradicts: [],
      },
    ]);
  });

  it("proposeHandoff: only plan_propose_handoff, last call wins, loose ids kept for normalizing, malformed entries dropped", async () => {
    const tentacle = {
      id: "bridge",
      name: "Bridge",
      description: "Runs Claude",
      owns: ["apps/octoplan/server/bridge/"],
      existing: true,
      todos: [
        {
          text: "Resume sessions. Done when a test restarts.",
          decisionIds: ["D29"],
          wave: "Wave 3",
        },
      ],
    };
    const fake = createFakeQuery(async function* ({ options, next }) {
      await next();
      await lockdown(options, HANDOFF_TOOL);
      const tools = sdkServerTools(options);
      await tools.call(HANDOFF_TOOL, { tentacles: [{ ...tentacle, id: "old" }] });
      await tools.call(HANDOFF_TOOL, {
        tentacles: [tentacle, { ...tentacle, id: "UI Shell" }, { id: "broken", todos: "nope" }],
      });
      yield result();
    });
    const runner = createHeadlessRunner({ query: fake.query });
    const proposed = await runner.proposeHandoff({ repoPath: "C:\\repo", prompt: "Split it." });
    expect(fake.calls[0]?.received).toEqual(["Split it."]);
    // normalizeHandoff (modes) slugs "UI Shell"; only structurally broken entries are dropped.
    expect(proposed).toEqual([tentacle, { ...tentacle, id: "UI Shell" }]);
  });

  it("returns nothing when Claude calls no tool, and passes maxTurns through", async () => {
    const fake = createFakeQuery(async function* ({ options, next }) {
      await next();
      expect(options.maxTurns).toBe(4);
      yield result();
    });
    const runner = createHeadlessRunner({ query: fake.query, maxTurns: 4 });
    expect(await runner.harvest({ repoPath: "C:\\repo", prompt: "p" })).toEqual([]);
  });

  it("rejects on an SDK error", async () => {
    const failing: QueryFn = () => ({
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(new Error("not logged in")),
      }),
    });
    const runner = createHeadlessRunner({ query: failing });
    await expect(runner.harvest({ repoPath: "C:\\repo", prompt: "p" })).rejects.toThrow(
      "not logged in",
    );
    await expect(runner.proposeHandoff({ repoPath: "C:\\repo", prompt: "p" })).rejects.toThrow(
      "not logged in",
    );
  });

  it("ingest: only plan_ingest, extra folders readable, more turns, last call wins", async () => {
    const fake = createFakeQuery(async function* ({ options, next }) {
      await next();
      expect(options.additionalDirectories).toEqual(["D:/notes"]);
      expect(options.maxTurns).toBe(INGEST_MAX_TURNS);
      expect(sdkServerTools(options).names).toEqual([INGEST_TOOL]);
      expect(await decide(options, "Write")).toBe("deny");
      const tools = sdkServerTools(options);
      await tools.call(INGEST_TOOL, { title: "First", items: [] });
      await tools.call(INGEST_TOOL, {
        title: "Habit",
        maturity: "notes",
        items: [{ kind: "goal", title: "Streaks", evidence: "found", source: "README.md" }],
      });
      yield result();
    });
    const runner = createHeadlessRunner({ query: fake.query });
    const report = await runner.ingest({
      repoPath: "C:/repo",
      prompt: "Import.",
      additionalDirectories: ["D:/notes"],
    });
    expect(fake.calls[0]?.received).toEqual(["Import."]);
    expect(report).toMatchObject({ title: "Habit", maturity: "notes", items: [{ title: "Streaks" }] });
  });

  it("ingest: no extra folders means no additionalDirectories, and no report is null", async () => {
    const fake = createFakeQuery(async function* ({ options, next }) {
      await next();
      expect(options.additionalDirectories).toBeUndefined();
      yield result();
    });
    const runner = createHeadlessRunner({ query: fake.query });
    expect(
      await runner.ingest({ repoPath: "C:/repo", prompt: "p", additionalDirectories: [] }),
    ).toBeNull();
  });

  it("rejects when the run fails before reporting anything", async () => {
    const fake = createFakeQuery(async function* ({ next }) {
      await next();
      yield result("error_during_execution");
    });
    const runner = createHeadlessRunner({ query: fake.query });
    await expect(runner.harvest({ repoPath: "C:\\repo", prompt: "p" })).rejects.toThrow(
      "error_during_execution",
    );
  });
});
