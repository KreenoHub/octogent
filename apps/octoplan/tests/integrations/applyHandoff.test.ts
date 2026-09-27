import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Decision, GoalDoc, HandoffPlan } from "@octogent/octoplan-protocol";
import { afterEach, describe, expect, it } from "vitest";
import { createIntegrations } from "../../server/integrations";
import { type ExecCall, createFakeExec, fail, ok } from "./fakeExec";
import { makeWorkspace, plainRepoGit } from "./workspaceFixture";

const goal: GoalDoc = {
  title: "Octoplan v2",
  why: "Plans that survive the build.",
  goals: ["Hand off to Octogent"],
  nonGoals: [],
  done: [],
};

const decision = (id: string, title: string): Decision => ({
  id,
  title,
  date: "2026-09-27",
  status: "active",
  source: "octoplan session",
  questionIds: [],
  dependsOn: [],
  body: `${title}.`,
});
const decisions = [
  decision("D36", "Managed block"),
  decision("D44", "Wizard"),
  decision("D9", "Other"),
];

const SKILLS = [
  "<!-- octogent:suggested-skills:start -->",
  "## Suggested Skills",
  "- `code-review`",
  "<!-- octogent:suggested-skills:end -->",
].join("\n");
const HAND_CONTEXT = `# API\n\nThe HTTP API, written by hand.\n\n## Owns\n- \`apps/api/\`\n\n## Rules\nNo ORMs.\n\n${SKILLS}\n`;
const HAND_TODO = "# Todo\n\n## v1\n\n- [x] Old work. Done when old.\n";

const plan: HandoffPlan = {
  status: "draft",
  generatedAt: "2026-09-27T10:00:00Z",
  source: "claude",
  workspace: "",
  heading: "v2",
  octopusPrompt: "go",
  tentacles: [
    {
      id: "api",
      name: "API",
      description: "The HTTP API.",
      owns: ["apps/api/"],
      existing: true,
      todos: [
        { text: "Add routes. Done when curl works.", decisionIds: ["D44"], wave: "" },
        { text: "Write block. Done when test passes.", decisionIds: ["D36"], wave: "Wave 4" },
        { text: "Harvest. Done when harvested.", decisionIds: [], wave: "Wave 5" },
      ],
    },
    {
      id: "cards",
      name: "Tentacle Cards",
      description: "Pixel cards for G.",
      owns: ["apps/web/src/cards/"],
      existing: false,
      todos: [
        { text: "Draw cards. Done when rendered.", decisionIds: ["D44", "D36"], wave: "Wave 5" },
      ],
    },
  ],
};

let ws: ReturnType<typeof makeWorkspace>;
afterEach(() => ws?.cleanup());

const setup = (options: { project?: boolean } = {}) => {
  ws = makeWorkspace([{ id: "api", context: HAND_CONTEXT, todo: HAND_TODO }], options);
  const fake = createFakeExec({
    ...plainRepoGit(ws.root),
    "octogent tentacle create": (call: ExecCall) => {
      const dir = join(call.cwd, ".octogent", "tentacles", call.args[2] as string);
      if (existsSync(dir)) return fail(1, "Error: 400 tentacle already exists");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "CONTEXT.md"), `# ${call.args[2]}\n\n${call.args[4]}`);
      writeFileSync(join(dir, "todo.md"), "# Todo\n");
      return ok(`Created tentacle "${call.args[2]}"`);
    },
  });
  const integrations = createIntegrations({
    exec: fake.exec,
    octogentUrl: "http://localhost:9999",
  });
  const apply = () => integrations.applyHandoff({ repoPath: ws.root, plan, goal, decisions });
  return { fake, apply };
};

const read = (id: string, file: string) => readFileSync(join(ws.dir(id), file), "utf8");
const outsideBlock = (text: string) =>
  text.replace(/<!-- octoplan:start -->[\s\S]*<!-- octoplan:end -->\n?/, "");

describe("applyHandoff (D44, D36, D48)", () => {
  it("creates missing tentacles, writes blocks and todos, and is idempotent", async () => {
    const { fake, apply } = setup();
    const first = await apply();

    expect(first.ok).toBe(true);
    expect(first.workspace).toBe(ws.root);
    expect(first.deckUrl).toBe("http://localhost:9999");
    expect(first.tentacles).toEqual([
      expect.objectContaining({
        tentacleId: "api",
        ok: true,
        created: false,
        added: 3,
        skipped: 0,
      }),
      expect.objectContaining({
        tentacleId: "cards",
        ok: true,
        created: true,
        added: 1,
        skipped: 0,
      }),
    ]);
    expect(first.message).toMatch(/2\/2 tentacles.*1 created, 4 todos added/);
    const creates = fake.calls.filter((c) => c.command === "octogent");
    expect(creates).toEqual([
      {
        command: "octogent",
        args: ["tentacle", "create", "cards", "--description", "Pixel cards for G."],
        cwd: ws.root,
      },
    ]);

    // Hand-written tentacle: everything outside the octoplan block is byte-identical.
    const apiContext = read("api", "CONTEXT.md");
    expect(apiContext.startsWith(HAND_CONTEXT)).toBe(true);
    expect(outsideBlock(apiContext)).toBe(`${HAND_CONTEXT}\n`);
    expect(apiContext).toContain("- `apps/api/`");
    expect(apiContext).toContain("**D44 — Wizard**");
    expect(apiContext).toContain("**D36 — Managed block**");
    expect(apiContext).not.toContain("D9 — Other");
    expect(read("api", "todo.md")).toBe(
      [
        "# Todo",
        "",
        "## v1",
        "",
        "- [x] Old work. Done when old.",
        "",
        "## v2",
        "",
        "- [ ] [D44] Add routes. Done when curl works.",
        "",
        "### Wave 4",
        "",
        "- [ ] [D36] Write block. Done when test passes.",
        "",
        "### Wave 5",
        "",
        "- [ ] Harvest. Done when harvested.",
        "",
      ].join("\n"),
    );

    // New tentacle: the display name replaces Octogent's `# <id>` stub, first lines for Deck.
    const cardsContext = read("cards", "CONTEXT.md");
    expect(cardsContext.split("\n").slice(0, 3)).toEqual([
      "# Tentacle Cards",
      "",
      "Pixel cards for G.",
    ]);
    expect(cardsContext).toContain("- `apps/web/src/cards/`");
    expect(read("cards", "todo.md")).toBe(
      "# Todo\n\n## v2\n\n### Wave 5\n\n- [ ] [D44, D36] Draw cards. Done when rendered.\n",
    );

    // Second apply: nothing new, nothing duplicated, hand notes still intact.
    const snapshot = { api: read("api", "todo.md"), cards: read("cards", "todo.md") };
    const apiContextBefore = read("api", "CONTEXT.md");
    const second = await apply();
    expect(second.ok).toBe(true);
    expect(second.tentacles.map((t) => [t.tentacleId, t.created, t.added, t.skipped])).toEqual([
      ["api", false, 0, 3],
      ["cards", false, 0, 1],
    ]);
    expect(read("api", "todo.md")).toBe(snapshot.api);
    expect(read("cards", "todo.md")).toBe(snapshot.cards);
    expect(read("api", "CONTEXT.md")).toBe(apiContextBefore);
    expect(fake.calls.filter((c) => c.command === "octogent")).toHaveLength(1);
  });

  it("reports per-tentacle failures when Octogent isn't running in the workspace", async () => {
    const { fake, apply } = setup({ project: false });
    const result = await apply();
    expect(result.ok).toBe(false);
    expect(result.tentacles.find((t) => t.tentacleId === "api")?.ok).toBe(true);
    const cards = result.tentacles.find((t) => t.tentacleId === "cards");
    expect(cards).toMatchObject({ ok: false, created: false, added: 0 });
    expect(cards?.message).toMatch(/Start Octogent/);
    expect(result.message).toMatch(/1\/2 tentacles.*cards: Start Octogent/);
    expect(fake.calls.filter((c) => c.command === "octogent")).toHaveLength(0);
  });

  it("lists existing tentacles with owns and todo counts", async () => {
    const { fake } = setup();
    const existing = await createIntegrations({ exec: fake.exec }).existingTentacles(ws.root);
    expect(existing).toEqual([
      {
        id: "api",
        name: "API",
        description: "The HTTP API, written by hand.",
        owns: ["apps/api/"],
        todoDone: 1,
        todoTotal: 1,
      },
    ]);
  });
});
