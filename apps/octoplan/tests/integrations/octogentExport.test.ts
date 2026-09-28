import { mkdirSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Decision, GoalDoc } from "@octogent/octoplan-protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DONE_WHEN_FALLBACK,
  exportToTentacle,
  toTodoLine,
} from "../../server/integrations/octogentExport";
import { createFakeExec, fail, ok } from "./fakeExec";

const goal: GoalDoc = {
  title: "Octoplan Cockpit",
  why: "Plan before building.\nEvery answer lands in docs/plan.",
  goals: ["Ask questions as cards", "Write GOAL.md"],
  nonGoals: ["Multi-user"],
  done: [{ id: "G1", text: "pnpm test passes", status: "covered", evidence: "CI run" }],
};

const decision = (id: string, title: string, status: Decision["status"]): Decision => ({
  id,
  title,
  date: "2026-09-25",
  status,
  source: "interview",
  questionIds: [],
  dependsOn: [],
  body: `${title} because reasons.\nSecond line.`,
});

const decisions = [
  decision("D1", "Dark only", "active"),
  decision("D2", "Old choice", "superseded"),
  decision("D3", "Local only", "active"),
];

const MANAGED = [
  "<!-- octogent:suggested-skills:start -->",
  "## Suggested Skills",
  "",
  "You can use these skills if you need to.",
  "",
  "- `code-review`",
  "<!-- octogent:suggested-skills:end -->",
].join("\n");

let repoPath: string;
const tentacleDir = () => join(repoPath, ".octogent", "tentacles", "cockpit");

beforeEach(async () => {
  repoPath = await mkdtemp(join(tmpdir(), "octoplan-export-"));
});
afterEach(async () => {
  await rm(repoPath, { recursive: true, force: true });
});

describe("toTodoLine", () => {
  it("makes one line that ends in a Done-when clause", () => {
    expect(toTodoLine("  Build the  graph\n view. Done when the test passes. ")).toBe(
      "- [ ] Build the graph view. Done when the test passes.",
    );
    expect(toTodoLine("- [ ] Add the route")).toBe(`- [ ] Add the route. ${DONE_WHEN_FALLBACK}`);
    expect(toTodoLine("   ")).toBeNull();
  });
});

describe("exportToTentacle", () => {
  it("creates a missing tentacle through the CLI with an argument array", async () => {
    const fake = createFakeExec({
      "octogent tentacle create": (call) => {
        // what the real API does on create
        const dir = join(call.cwd, ".octogent", "tentacles", call.args[2] as string);
        createLikeTheApi(dir, call.args[4] as string);
        return ok(`Created tentacle "cockpit"`);
      },
    });
    const result = await exportToTentacle(fake.exec, {
      repoPath,
      tentacleId: "cockpit",
      goal,
      decisions,
      tasks: ["Build the graph"],
    });

    expect(result.ok).toBe(true);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]).toEqual({
      command: "octogent",
      args: ["tentacle", "create", "cockpit", "--description", "Plan before building."],
      cwd: repoPath,
    });
    expect(result.message).toMatch(/created/i);
    expect(result.message).toMatch(/1 task/);
  });

  it("tells the user to start Octogent when the API is unreachable", async () => {
    const fake = createFakeExec({
      octogent: fail(
        1,
        "Error: Could not reach API at http://localhost:8787. Start Octogent in this project first.",
      ),
    });
    const result = await exportToTentacle(fake.exec, {
      repoPath,
      tentacleId: "cockpit",
      goal,
      decisions,
      tasks: [],
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Start Octogent in this repo first (run `octogent` there)");
  });

  it("explains when the octogent CLI is not installed", async () => {
    const fake = createFakeExec({ octogent: fail(127, "command not found: octogent") });
    const result = await exportToTentacle(fake.exec, {
      repoPath,
      tentacleId: "cockpit",
      goal,
      decisions,
      tasks: [],
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/octogent.*not found|install/i);
  });

  it("rejects tentacle ids that would escape the tentacles folder", async () => {
    const fake = createFakeExec({});
    const result = await exportToTentacle(fake.exec, {
      repoPath,
      tentacleId: "../evil",
      goal,
      decisions,
      tasks: [],
    });
    expect(result.ok).toBe(false);
    expect(fake.calls).toHaveLength(0);
  });

  it("rewrites the human part of CONTEXT.md and keeps the managed skills block", async () => {
    await mkdir(tentacleDir(), { recursive: true });
    await writeFile(
      join(tentacleDir(), "CONTEXT.md"),
      `# Old name\n\nOld description.\n\n## Notes\nstale\n\n${MANAGED}\n`,
    );
    const fake = createFakeExec({});
    const result = await exportToTentacle(fake.exec, {
      repoPath,
      tentacleId: "cockpit",
      goal,
      decisions,
      tasks: [],
    });
    expect(result.ok).toBe(true);
    expect(fake.calls).toHaveLength(0); // already exists: no CLI call

    const context = await readFile(join(tentacleDir(), "CONTEXT.md"), "utf8");
    const lines = context.split("\n");
    expect(lines[0]).toBe("# Octoplan Cockpit");
    expect(lines[1]).toBe("");
    expect(lines[2]).toBe("Plan before building. Every answer lands in docs/plan.");
    expect(context).not.toContain("Old description");
    expect(context).not.toContain("stale");
    expect(context).toContain("- Ask questions as cards");
    expect(context).toContain("- Multi-user");
    expect(context).toContain("pnpm test passes");
    expect(context).toContain("**D1 — Dark only**");
    expect(context).toContain("**D3 — Local only**");
    expect(context).not.toContain("Old choice");
    expect(context).toContain(MANAGED);
    expect(context.indexOf(MANAGED)).toBeGreaterThan(context.indexOf("D3"));
    expect(context.match(/octogent:suggested-skills:start/g)).toHaveLength(1);
  });

  it("appends one-line todos ending in Done when, skipping exact duplicates", async () => {
    await mkdir(tentacleDir(), { recursive: true });
    await writeFile(join(tentacleDir(), "CONTEXT.md"), "# x\n");
    await writeFile(
      join(tentacleDir(), "todo.md"),
      "# Todo\n\n- [x] Ship it. Done when it ships.\n- [ ] Wire routes. Done when curl works.",
    );
    const fake = createFakeExec({});
    const result = await exportToTentacle(fake.exec, {
      repoPath,
      tentacleId: "cockpit",
      goal: null,
      decisions: [],
      tasks: [
        "Wire routes. Done when curl works.",
        "Ship it. Done when it ships.",
        "Draw the graph",
        "Draw the graph",
        "Add badges. Done when badges render.",
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/2 tasks added, 3 skipped/);

    const todo = await readFile(join(tentacleDir(), "todo.md"), "utf8");
    expect(todo).toBe(
      [
        "# Todo",
        "",
        "- [x] Ship it. Done when it ships.",
        "- [ ] Wire routes. Done when curl works.",
        `- [ ] Draw the graph. ${DONE_WHEN_FALLBACK}`,
        "- [ ] Add badges. Done when badges render.",
        "",
      ].join("\n"),
    );
    for (const line of todo.split("\n").filter((l) => l.startsWith("- ["))) {
      expect(line).toMatch(/Done when .+/);
    }
  });

  it("creates todo.md when it is missing and uses the tentacle id when there is no goal", async () => {
    await mkdir(tentacleDir(), { recursive: true });
    const fake = createFakeExec({});
    await exportToTentacle(fake.exec, {
      repoPath,
      tentacleId: "cockpit",
      goal: null,
      decisions: [],
      tasks: ["One"],
    });
    const context = await readFile(join(tentacleDir(), "CONTEXT.md"), "utf8");
    expect(context.startsWith("# cockpit\n\n")).toBe(true);
    const todo = await readFile(join(tentacleDir(), "todo.md"), "utf8");
    expect(todo).toBe(`# Todo\n\n- [ ] One. ${DONE_WHEN_FALLBACK}\n`);
  });
});

/** What the Octogent API writes when it creates a tentacle. */
function createLikeTheApi(dir: string, description: string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "CONTEXT.md"), `# cockpit\n\n${description}\n`);
  writeFileSync(join(dir, "todo.md"), "# Todo\n");
}
