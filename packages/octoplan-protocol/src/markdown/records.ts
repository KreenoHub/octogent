// Generic "record list" markdown used by every docs/plan list file:
//
//   <preamble: any markdown, preserved verbatim>
//
//   <!-- op:id=D1 -->
//   ## D1 — Title
//   - key: value
//   - other-key: value
//
//   Free-form body, preserved verbatim.
//
// The HTML comment is the only hard anchor, so humans can freely edit titles,
// bodies and add their own meta keys; unknown keys survive every rewrite.

export type MdRecord = {
  id: string;
  title: string;
  meta: Array<[string, string]>;
  body: string;
};

export type RecordDoc = {
  preamble: string;
  records: MdRecord[];
};

const MARKER_RE = /^<!-- op:id=([A-Za-z0-9._~-]+) -->\s*$/;
const HEADING_RE = /^##\s+(\S+)\s+[—–-]\s+(.*)$/;
const META_RE = /^- ([a-z][a-z0-9-]*): ?(.*)$/;

export const recordMarker = (id: string) => `<!-- op:id=${id} -->`;

export const parseRecordDoc = (text: string): RecordDoc => {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const preambleLines: string[] = [];
  const records: MdRecord[] = [];
  let current: { id: string; lines: string[] } | null = null;

  const flush = () => {
    if (current) {
      records.push(parseRecordLines(current.id, current.lines));
    }
  };

  for (const line of lines) {
    const marker = MARKER_RE.exec(line);
    if (marker?.[1]) {
      flush();
      current = { id: marker[1], lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else {
      preambleLines.push(line);
    }
  }
  flush();

  return { preamble: trimBlankLines(preambleLines).join("\n"), records };
};

const parseRecordLines = (id: string, lines: string[]): MdRecord => {
  let cursor = 0;
  while (cursor < lines.length && lines[cursor]?.trim() === "") cursor++;

  let title = "";
  const heading = HEADING_RE.exec(lines[cursor] ?? "");
  if (heading) {
    title = (heading[2] ?? "").trim();
    cursor++;
  }

  const meta: Array<[string, string]> = [];
  while (cursor < lines.length) {
    const match = META_RE.exec(lines[cursor] ?? "");
    if (!match?.[1]) break;
    meta.push([match[1], (match[2] ?? "").trim()]);
    cursor++;
  }

  const body = trimBlankLines(lines.slice(cursor)).join("\n");
  return { id, title, meta, body };
};

const trimBlankLines = (lines: string[]): string[] => {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]?.trim() === "") start++;
  while (end > start && lines[end - 1]?.trim() === "") end--;
  return lines.slice(start, end).map((line) => line.replace(/\s+$/, ""));
};

export const serializeRecord = (record: MdRecord): string => {
  const parts = [`${recordMarker(record.id)}\n## ${record.id} — ${record.title}`];
  if (record.meta.length > 0) {
    parts[0] += `\n${record.meta.map(([key, value]) => `- ${key}: ${oneLine(value)}`.trimEnd()).join("\n")}`;
  }
  if (record.body.trim().length > 0) {
    parts.push(record.body.trim());
  }
  return parts.join("\n\n");
};

export const serializeRecordDoc = (doc: RecordDoc): string => {
  const chunks: string[] = [];
  if (doc.preamble.trim().length > 0) chunks.push(doc.preamble.trim());
  for (const record of doc.records) chunks.push(serializeRecord(record));
  return `${chunks.join("\n\n")}\n`;
};

const oneLine = (value: string) => value.replace(/\s*\n\s*/g, " ").trim();

export const getMeta = (record: MdRecord, key: string): string | undefined =>
  record.meta.find(([k]) => k === key)?.[1];

export const getMetaList = (record: MdRecord, key: string): string[] =>
  (getMeta(record, key) ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

// Replace known keys in place, append new ones, keep unknown keys where they were.
// A known key whose value is undefined is removed.
export const mergeMeta = (
  existing: Array<[string, string]>,
  known: Array<[string, string | undefined]>,
): Array<[string, string]> => {
  const knownMap = new Map(known);
  const result: Array<[string, string]> = [];
  const seen = new Set<string>();
  for (const [key, value] of existing) {
    if (knownMap.has(key)) {
      const next = knownMap.get(key);
      if (next !== undefined && !seen.has(key)) result.push([key, next]);
      seen.add(key);
    } else {
      result.push([key, value]);
    }
  }
  for (const [key, value] of known) {
    if (!seen.has(key) && value !== undefined) result.push([key, value]);
  }
  return result;
};

export type RecordCodec<T extends { id: string }> = {
  fromRecord: (record: MdRecord) => T | null;
  toRecord: (item: T, existing?: MdRecord) => MdRecord;
};

export const readItems = <T extends { id: string }>(doc: RecordDoc, codec: RecordCodec<T>): T[] =>
  doc.records.map(codec.fromRecord).filter((item): item is T => item !== null);

export const upsertItem = <T extends { id: string }>(
  doc: RecordDoc,
  codec: RecordCodec<T>,
  item: NoInfer<T>,
): RecordDoc => {
  const index = doc.records.findIndex((record) => record.id === item.id);
  if (index === -1) {
    return { ...doc, records: [...doc.records, codec.toRecord(item)] };
  }
  const records = [...doc.records];
  records[index] = codec.toRecord(item, doc.records[index]);
  return { ...doc, records };
};

export const removeItem = (doc: RecordDoc, id: string): RecordDoc => ({
  ...doc,
  records: doc.records.filter((record) => record.id !== id),
});

export const nextId = (doc: RecordDoc, prefix: string): string => {
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  let max = 0;
  for (const record of doc.records) {
    const match = pattern.exec(record.id);
    if (match?.[1]) max = Math.max(max, Number.parseInt(match[1], 10));
  }
  return `${prefix}${max + 1}`;
};
