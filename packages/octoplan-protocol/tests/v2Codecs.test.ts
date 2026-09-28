import { describe, expect, it } from "vitest";
import {
  CONVENTIONS_PREAMBLE,
  type Convention,
  HARVEST_MARK_KEY,
  type HandoffPlan,
  type HarvestCandidate,
  PLAN_FILES,
  type Stage,
  conventionCodec,
  getPreambleMeta,
  harvestCodec,
  parseHandoffDoc,
  parseRecordDoc,
  parseStage,
  readItems,
  serializeHandoffDoc,
  serializeRecordDoc,
  serializeStage,
  setPreambleMeta,
  upsertItem,
} from "../src/index";

const candidate = (
  id: string,
  status: HarvestCandidate["status"],
  extra: Partial<HarvestCandidate> = {},
): HarvestCandidate => ({
  id,
  title: `Candidate ${id}`,
  date: "2026-09-27",
  source: "abc1234",
  sourceKind: "commit",
  status,
  contradicts: [],
  body: `Why ${id} matters.`,
  ...extra,
});

describe("harvestCodec", () => {
  it("round-trips pending, accepted and rejected H-records through HARVEST.md", () => {
    const items = [
      candidate("H1", "pending", { contradicts: ["D3", "D4"] }),
      candidate("H2", "accepted", { decisionId: "D9" }),
      candidate("H3", "rejected", { source: "todo:store", sourceKind: "todo" }),
    ];
    let doc = parseRecordDoc(PLAN_FILES.harvest.preamble);
    for (const item of items) doc = upsertItem(doc, harvestCodec, item);
    const text = serializeRecordDoc(doc);

    expect(text).toContain("- source-kind: todo");
    expect(text).toContain("- decision: D9");
    expect(text).toContain("- contradicts: D3, D4");
    expect(readItems(parseRecordDoc(text), harvestCodec)).toEqual(items);
    expect(serializeRecordDoc(parseRecordDoc(text))).toBe(text);
  });

  it("skips a record a human broke", () => {
    const text = `${PLAN_FILES.harvest.preamble}\n\n<!-- op:id=H1 -->\n## H1 — Broken\n- date: yesterday\n- status: pending\n`;
    expect(readItems(parseRecordDoc(text), harvestCodec)).toEqual([]);
  });
});

describe("stage decision ids (G1)", () => {
  const stage: Stage = {
    index: 2,
    title: "Memory",
    goal: "Harvest and conventions.",
    prompt: "Build it.\n\n## Decisions\n\nnot a real section\n\n## Prompt",
    decisionIds: ["D14", "D25", "D29"],
  };

  it("round-trips decisionIds as a ## Decisions section", () => {
    const text = serializeStage(stage);
    expect(text).toContain(
      "## Goal\n\nHarvest and conventions.\n\n## Decisions\n\nD14, D25, D29\n\n## Prompt",
    );
    expect(parseStage(text)).toEqual(stage);
  });

  it("omits the section when there are none; old files parse without decisionIds", () => {
    const { decisionIds: _ids, ...old } = stage;
    const text = serializeStage({ ...old, decisionIds: [] });
    expect(text).not.toContain("D14");
    expect(serializeStage(old)).toBe(text);
    expect(parseStage(text)).toEqual(old);
    expect(parseStage(text)).not.toHaveProperty("decisionIds");
  });
});

describe("preamble meta", () => {
  it("adds, reads and replaces the harvest mark without touching the rest", () => {
    const once = setPreambleMeta(PLAN_FILES.harvest.preamble, HARVEST_MARK_KEY, "aaa111");
    expect(once.startsWith(PLAN_FILES.harvest.preamble)).toBe(true);
    expect(getPreambleMeta(once, HARVEST_MARK_KEY)).toBe("aaa111");
    const twice = setPreambleMeta(once, HARVEST_MARK_KEY, "bbb222");
    expect(twice).toBe(once.replace("aaa111", "bbb222"));
    expect(getPreambleMeta(PLAN_FILES.harvest.preamble, HARVEST_MARK_KEY)).toBeUndefined();
  });
});

describe("conventionCodec", () => {
  it("round-trips C-records", () => {
    const items: Convention[] = [
      { id: "C1", title: "pnpm, never npm", date: "2026-09-27", body: "Every repo uses pnpm." },
      { id: "C2", title: "Biome for lint", date: "2026-09-28", body: "" },
    ];
    let doc = parseRecordDoc(`${CONVENTIONS_PREAMBLE}\n`);
    for (const item of items) doc = upsertItem(doc, conventionCodec, item);
    expect(readItems(parseRecordDoc(serializeRecordDoc(doc)), conventionCodec)).toEqual(items);
  });
});

const plan: HandoffPlan = {
  status: "applied",
  generatedAt: "2026-09-27T10:00:00.000Z",
  appliedAt: "2026-09-27T11:00:00.000Z",
  source: "claude",
  workspace: "C:\\Users\\me\\octogent",
  heading: "Octoplan v2",
  tentacles: [
    {
      id: "store",
      name: "Octoplan Store",
      description: "Reads and writes docs/plan.",
      owns: ["apps/octoplan/server/store", "apps/octoplan/tests/store"],
      existing: true,
      todos: [
        { text: "Loose todo. Done when it runs.", decisionIds: [], wave: "" },
        { text: "HARVEST.md. Done when it round-trips.", decisionIds: ["D27"], wave: "Wave 4" },
        { text: "Conventions. Done when listed.", decisionIds: ["D28", "D4"], wave: "Wave 4" },
        { text: "History. Done when ordered.", decisionIds: ["D24"], wave: "Wave 5" },
      ],
    },
    {
      id: "ui-shell",
      name: "UI shell",
      description: "",
      owns: [],
      existing: false,
      todos: [{ text: "Dock. Done when it docks.", decisionIds: ["D14"], wave: "Wave 3" }],
    },
  ],
  octopusPrompt: "",
};

describe("HANDOFF.md", () => {
  it("round-trips a plan with two tentacles and waved todos", () => {
    const text = serializeHandoffDoc(plan);
    expect(text).toContain("- [ ] [D28, D4] Conventions. Done when listed.");
    expect(text).toContain("### Wave 4");
    expect(text).toContain("- owns: apps/octoplan/server/store, apps/octoplan/tests/store");
    expect(text).not.toContain("octopusPrompt");
    expect(parseHandoffDoc(text)).toEqual(plan);
    expect(parseHandoffDoc(text, "# Octopus\n")?.octopusPrompt).toBe("# Octopus\n");
    // Serializing again over its own text is stable.
    expect(serializeHandoffDoc(plan, text)).toBe(text);
  });

  it("reads a hand-edited todo line back and keeps human notes on rewrite", () => {
    const text = serializeHandoffDoc(plan)
      .replace(
        "- [ ] [D24] History. Done when ordered.",
        "- [x] [D24, D13] History, sorted by date. Done when ordered.",
      )
      .replace("- heading: Octoplan v2", "- heading: Octoplan v2\n- owner: alex")
      .replace("- existing: no", "- existing: no\n- reviewer: yoni");
    const read = parseHandoffDoc(text);
    expect(read?.tentacles[0]?.todos[3]).toEqual({
      text: "History, sorted by date. Done when ordered.",
      decisionIds: ["D24", "D13"],
      wave: "Wave 5",
    });
    if (!read) throw new Error("unreadable");
    const rewritten = serializeHandoffDoc(read, text);
    expect(rewritten).toContain("- owner: alex");
    expect(rewritten).toContain("- reviewer: yoni");
    expect(parseHandoffDoc(rewritten)).toEqual(read);
  });

  it("drops a broken tentacle but keeps the rest; an empty file is null", () => {
    const text = serializeHandoffDoc(plan).replace("- id: ui-shell", "- id: Not A Slug");
    expect(parseHandoffDoc(text)?.tentacles.map((t) => t.id)).toEqual(["store"]);
    expect(parseHandoffDoc("")).toBeNull();
  });
});
