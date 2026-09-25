import { describe, expect, it } from "vitest";
import {
  type RecordDoc,
  decisionCodec,
  mergeMeta,
  nextId,
  parseRecordDoc,
  readItems,
  removeItem,
  serializeRecordDoc,
  upsertItem,
} from "../src";

const sample: RecordDoc = {
  preamble: "# Decisions\n\nD-numbered decision log.",
  records: [
    {
      id: "D1",
      title: "Use the Agent SDK",
      meta: [
        ["date", "2026-09-25"],
        ["status", "active"],
      ],
      body: "Structured events beat terminal scraping.\n\n- second paragraph",
    },
    { id: "D2", title: "Markdown is the source of truth", meta: [], body: "" },
  ],
};

describe("record docs", () => {
  it("round-trips parse(serialize(doc))", () => {
    expect(parseRecordDoc(serializeRecordDoc(sample))).toEqual(sample);
  });

  it("is stable when serialized twice", () => {
    const once = serializeRecordDoc(sample);
    expect(serializeRecordDoc(parseRecordDoc(once))).toBe(once);
  });

  it("accepts CRLF input from Windows editors", () => {
    const crlf = serializeRecordDoc(sample).replace(/\n/g, "\r\n");
    expect(parseRecordDoc(crlf)).toEqual(sample);
  });

  it("keeps hand-written content and unknown meta keys through an upsert", () => {
    const handEdited = `# Decisions

My own intro paragraph, written by hand.

<!-- op:id=D1 -->
## D1 — Use the Agent SDK
- date: 2026-09-25
- owner: alex
- status: active

Body I wrote myself.
`;
    const doc = parseRecordDoc(handEdited);
    const [decision] = readItems(doc, decisionCodec);
    expect(decision).toBeDefined();
    if (!decision) return;
    const updated = upsertItem(doc, decisionCodec, { ...decision, status: "stale" });
    const text = serializeRecordDoc(updated);
    expect(text).toContain("My own intro paragraph, written by hand.");
    expect(text).toContain("- owner: alex");
    expect(text).toContain("- status: stale");
    expect(text).toContain("Body I wrote myself.");
    // Unknown key keeps its position between known keys.
    expect(text.indexOf("- owner: alex")).toBeLessThan(text.indexOf("- status: stale"));
  });

  it("returns null for records a human broke instead of throwing", () => {
    const doc = parseRecordDoc("<!-- op:id=D9 -->\n## D9 — Missing date\n- status: nonsense\n");
    expect(readItems(doc, decisionCodec)).toEqual([]);
  });

  it("allocates the next id and removes records", () => {
    expect(nextId(sample, "D")).toBe("D3");
    expect(nextId({ preamble: "", records: [] }, "Q")).toBe("Q1");
    expect(removeItem(sample, "D1").records.map((r) => r.id)).toEqual(["D2"]);
  });
});

describe("mergeMeta", () => {
  it("replaces known keys, removes undefined ones, appends new ones", () => {
    const merged = mergeMeta(
      [
        ["a", "1"],
        ["custom", "keep"],
        ["b", "2"],
      ],
      [
        ["a", "10"],
        ["b", undefined],
        ["c", "3"],
      ],
    );
    expect(merged).toEqual([
      ["a", "10"],
      ["custom", "keep"],
      ["c", "3"],
    ]);
  });
});
