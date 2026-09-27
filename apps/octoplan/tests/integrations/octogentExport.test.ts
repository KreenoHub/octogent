import { mkdirSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Decision, GoalDoc } from "@octogent/octoplan-protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DONE_WHEN_FALLBACK,
  START_OCTOGENT_MESSAGE,
  appendTodos,
  exportToTentacle,
  mergeContext,
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

const SKILLS_BLOCK = [
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
/** No git here: resolveWorkspace falls back to the repo itself. */
const noGit = { git: fail(128, "fatal: not a git repository") };
const octogentCalls = (calls: { command: string }[]) =>
  calls.filter((c) => c.command === "octogent");

beforeEach(async () => {
  repoPath = await mkdtemp(join(tmpdir(), "octoplan-export-"));
});
afterEach(async () => {
  await rm(repoPath, { recursive: true, force: true });
});

/** Octogent running in this repo: the CLI finds it through `.octogent/project.json`. */
const markOctogentProject = () => {
  mkdirSync(join(repoPath, ".octogent"), { recursive: true });
  writeFileSync(join(repoPath, ".octogent", "project.json"), '{"id":"p1"}');
};

describe("toTodoLine", () => {
  it("makes one line that ends in a Done-when clause", () => {
    expect(toTodoLine("  Build the  graph\n view. Done when the test passes. ")).toBe(
      "- [ ] Build the graph view. Done when the test passes.",
    );
    expect(toTodoLine("- [ ] Add the route")).toBe(`- [ ] Add the route. ${DONE_WHEN_FALLBACK}`);
    expect(toTodoLine("   ")).toBeNull();
  });

  it("stamps D-ids in front of the text (D26)", () => {
    expect(toTodoLine("Dock it. Done when docked.", ["D14", "D29", "D14"])).toBe(
      "- [ ] [D14, D29] Dock it. Done when docked.",
    );
    expect(toTodoLine("[D3,D4] Dock it. Done when docked.")).toBe(
      "- [ ] [D3, D4] Dock it. Done when docked.",
    );
  });
});

describe("exportToTentacle", () => {
  it("creates a missing tentacle through the CLI with an argument array", async () => {
    markOctogentProject();
    const fake = createFakeExec({
      ...noGit,
      "octogent tentacle create": (call) => {
        createLikeTheApi(call.cwd, call.args[2] as string, call.args[4] as string);
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
    expect(octogentCalls(fake.calls)).toEqual([
      {
        command: "octogent",
        args: ["tentacle", "create", "cockpit", "--description", "Plan before building."],
        cwd: repoPath,
      },
    ]);
    expect(result.message).toMatch(/created/i);
    expect(result.message).toMatch(/1 task/);

    // The stub heading becomes the plan's name and stays the first line for Deck.
    const context = await readFile(join(tentacleDir(), "CONTEXT.md"), "utf8");
    expect(context.split("\n").slice(0, 3)).toEqual([
      "# Octoplan Cockpit",
      "",
      "Plan before building.",
    ]);
    expect(context).toContain("<!-- octoplan:start -->");
  });

  it("never calls the CLI when this workspace has no Octogent project (no project.json)", async () => {
    const fake = createFakeExec({ ...noGit, octogent: ok("Created") });
    const result = await exportToTentacle(fake.exec, {
      repoPath,
      tentacleId: "cockpit",
      goal,
      decisions,
      tasks: [],
    });
    expect(result).toEqual({ ok: false, message: START_OCTOGENT_MESSAGE });
    expect(octogentCalls(fake.calls)).toHaveLength(0);
  });

  it("tells the user to start Octogent when the API is unreachable", async () => {
    markOctogentProject();
    const fake = createFakeExec({
      ...noGit,
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
    markOctogentProject();
    const fake = createFakeExec({ ...noGit, octogent: fail(127, "command not found: octogent") });
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

  it("exporting twice keeps hand notes and Octogent's block byte-identical (D36)", async () => {
    await mkdir(tentacleDir(), { recursive: true });
    const handTop =
      "# Cockpit\n\nThe cockpit UI.\n\n## Owns\n- `apps/web/`\n\n## Rules\nNo globals.\n";
    const handTail = "\n## Notes\nHand-written, keep me.\n";
    await writeFile(join(tentacleDir(), "CONTEXT.md"), `${handTop}\n${SKILLS_BLOCK}\n${handTail}`);
    const fake = createFakeExec(noGit);
    const run = (ds: Decision[]) =>
      exportToTentacle(fake.exec, {
        repoPath,
        tentacleId: "cockpit",
        goal,
        decisions: ds,
        tasks: [],
      });

    expect((await run(decisions)).ok).toBe(true);
    const first = await readFile(join(tentacleDir(), "CONTEXT.md"), "utf8");
    expect(first.startsWith(`${handTop}\n${SKILLS_BLOCK}\n${handTail}`)).toBe(true);
    expect(first).toContain("**D1 — Dark only**");
    expect(first).toContain("**D3 — Local only**");
    expect(first).not.toContain("Old choice");
    expect(first).toContain("- Ask questions as cards");

    // Second export with a changed decision set: only the octoplan block changes.
    expect((await run([decision("D9", "New call", "active")])).ok).toBe(true);
    const second = await readFile(join(tentacleDir(), "CONTEXT.md"), "utf8");
    const outside = (text: string) =>
      text.replace(/<!-- octoplan:start -->[\s\S]*<!-- octoplan:end -->/, "<BLOCK>");
    expect(outside(second)).toBe(outside(first));
    expect(second).toContain("**D9 — New call**");
    expect(second).not.toContain("Dark only");
    expect(second.match(/octoplan:start/g)).toHaveLength(1);
    expect(second.match(/octogent:suggested-skills:start/g)).toHaveLength(1);
    expect(octogentCalls(fake.calls)).toHaveLength(0); // already existed: no CLI call
  });

  it("appends one-line todos ending in Done when, deduped by text without the stamp", async () => {
    await mkdir(tentacleDir(), { recursive: true });
    await writeFile(join(tentacleDir(), "CONTEXT.md"), "# x\n");
    await writeFile(
      join(tentacleDir(), "todo.md"),
      "# Todo\n\n- [x] [D1] Ship it. Done when it ships.\n- [ ] Wire routes. Done when curl works.",
    );
    const fake = createFakeExec(noGit);
    const result = await exportToTentacle(fake.exec, {
      repoPath,
      tentacleId: "cockpit",
      goal: null,
      decisions: [],
      tasks: [
        "[D4] Wire routes. Done when curl works.",
        "Ship it. Done when it ships.",
        "Draw the graph",
        "Draw the graph",
        "[D2] Add badges. Done when badges render.",
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/2 tasks added, 3 skipped/);

    const todo = await readFile(join(tentacleDir(), "todo.md"), "utf8");
    expect(todo).toBe(
      [
        "# Todo",
        "",
        "- [x] [D1] Ship it. Done when it ships.",
        "- [ ] Wire routes. Done when curl works.",
        `- [ ] Draw the graph. ${DONE_WHEN_FALLBACK}`,
        "- [ ] [D2] Add badges. Done when badges render.",
        "",
      ].join("\n"),
    );
  });

  it("puts todos under an existing `## heading`, at the end of that section", async () => {
    await mkdir(tentacleDir(), { recursive: true });
    await writeFile(join(tentacleDir(), "CONTEXT.md"), "# x\n");
    await writeFile(
      join(tentacleDir(), "todo.md"),
      "# Todo\n\n## v1\n\n- [x] Old. Done when old.\n\n## v2\n\n- [ ] A. Done when a.\n\n## Later\n\n- [ ] Z. Done when z.\n",
    );
    const fake = createFakeExec(noGit);
    await exportToTentacle(fake.exec, {
      repoPath,
      tentacleId: "cockpit",
      goal: null,
      decisions: [],
      tasks: ["B. Done when b.", "A. Done when a."],
      heading: "v2",
    });
    const todo = await readFile(join(tentacleDir(), "todo.md"), "utf8");
    expect(todo).toBe(
      "# Todo\n\n## v1\n\n- [x] Old. Done when old.\n\n## v2\n\n- [ ] A. Done when a.\n- [ ] B. Done when b.\n\n## Later\n\n- [ ] Z. Done when z.\n",
    );
  });

  it("creates a missing `## heading` at the end of todo.md", async () => {
    await mkdir(tentacleDir(), { recursive: true });
    await writeFile(join(tentacleDir(), "todo.md"), "# Todo\n\n- [ ] Old. Done when old.\n");
    const fake = createFakeExec(noGit);
    await exportToTentacle(fake.exec, {
      repoPath,
      tentacleId: "cockpit",
      goal: null,
      decisions: [],
      tasks: ["New. Done when new."],
      heading: "v2",
    });
    const todo = await readFile(join(tentacleDir(), "todo.md"), "utf8");
    expect(todo).toBe(
      "# Todo\n\n- [ ] Old. Done when old.\n\n## v2\n\n- [ ] New. Done when new.\n",
    );
  });

  it("creates todo.md when it is missing and uses the tentacle id when there is no goal", async () => {
    await mkdir(tentacleDir(), { recursive: true });
    const fake = createFakeExec(noGit);
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

describe("mergeContext / appendTodos details", () => {
  it("keeps CRLF files CRLF outside the block", () => {
    const existing = "# X\r\n\r\nHand.\r\n";
    const merged = mergeContext(existing, "<!-- octoplan:start -->\nhi\n<!-- octoplan:end -->");
    expect(merged).toBe(
      "# X\r\n\r\nHand.\r\n\r\n<!-- octoplan:start -->\r\nhi\r\n<!-- octoplan:end -->\r\n",
    );
  });

  it("puts wave todos under `### wave` and wave-less ones before the first subsection", () => {
    let content: string | null = "# Todo\n";
    content = appendTodos(content, ["- [ ] W1. Done when w1."], {
      heading: "v2",
      wave: "Wave 1",
    }).content;
    content = appendTodos(content, ["- [ ] Top. Done when top."], {
      heading: "v2",
      wave: "",
    }).content;
    content = appendTodos(content, ["- [ ] W2. Done when w2."], {
      heading: "v2",
      wave: "Wave 2",
    }).content;
    content = appendTodos(content, ["- [ ] W1b. Done when w1b."], {
      heading: "v2",
      wave: "Wave 1",
    }).content;
    expect(content).toBe(
      [
        "# Todo",
        "",
        "## v2",
        "",
        "- [ ] Top. Done when top.",
        "",
        "### Wave 1",
        "",
        "- [ ] W1. Done when w1.",
        "- [ ] W1b. Done when w1b.",
        "",
        "### Wave 2",
        "",
        "- [ ] W2. Done when w2.",
        "",
      ].join("\n"),
    );
  });
});

/** What the Octogent API writes when it creates a tentacle. */
function createLikeTheApi(cwd: string, id: string, description: string) {
  const dir = join(cwd, ".octogent", "tentacles", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "CONTEXT.md"), `# ${id}\n\n${description}`);
  writeFileSync(join(dir, "todo.md"), "# Todo\n");
}
