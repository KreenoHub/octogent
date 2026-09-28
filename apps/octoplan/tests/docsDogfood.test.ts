import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  decisionCodec,
  parseRecordDoc,
  readItems,
  serializeRecordDoc,
} from "@octogent/octoplan-protocol";
import { describe, expect, it } from "vitest";

// Octoplan's own decision log is written in the docs/plan record format;
// if the format drifts, this breaks before any user repo does.
const decisionsPath = fileURLToPath(
  new URL("../../../docs/octoplan/DECISIONS.md", import.meta.url),
);

describe("docs/octoplan/DECISIONS.md", () => {
  const text = readFileSync(decisionsPath, "utf8");
  const doc = parseRecordDoc(text);

  it("parses every record as a valid decision", () => {
    const decisions = readItems(doc, decisionCodec);
    expect(decisions.length).toBe(doc.records.length);
    expect(decisions.length).toBeGreaterThanOrEqual(23);
    expect(decisions.map((d) => d.id).slice(0, 3)).toEqual(["D1", "D2", "D3"]);
  });

  it("survives a rewrite byte-for-byte", () => {
    expect(serializeRecordDoc(doc)).toBe(text.replace(/\r\n/g, "\n"));
  });
});
