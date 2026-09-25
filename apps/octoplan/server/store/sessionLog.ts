// Helpers for docs/plan/sessions/<date>-<slug>.md. The format is the protocol's
// serializeSessionLog/parseSessionLog; these helpers only edit a log in place so hand edits
// (extra header lines, entry bodies, unknown entry keys) survive every write.
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  type Answer,
  type MdRecord,
  type SessionLog,
  type SessionLogEntry,
  parseRecordDoc,
  parseSessionLog,
  serializeRecordDoc,
  serializeSessionLog,
} from "@octogent/octoplan-protocol";
import { readTextOrNull } from "./fsIo";

export type SessionHeader = Omit<SessionLog, "entries">;

/** Extra header line that maps a log back to its Octoplan session after a restart. */
export const SESSION_ID_KEY = "octoplan-session";

const KNOWN_HEADER_KEYS = new Set(["mode", "repo", "started", "claude-session"]);

/** Header lines a human (or Octoplan) added that serializeSessionLog doesn't know about. */
export const headerExtras = (preamble: string): string[] => {
  const lines = preamble.split("\n");
  const summary = lines.findIndex((line) => line.trim() === "## Summary");
  return lines.slice(1, summary === -1 ? undefined : summary).filter((line) => {
    if (line.trim() === "") return false;
    const key = /^- ([a-z][a-z0-9-]*):/.exec(line)?.[1];
    return !(key && KNOWN_HEADER_KEYS.has(key));
  });
};

/** The protocol's header with extra lines placed after its own meta lines. */
export const buildHeader = (header: SessionHeader, extras: readonly string[]): string => {
  const lines = parseRecordDoc(serializeSessionLog({ ...header, entries: [] })).preamble.split(
    "\n",
  );
  const summary = lines.findIndex((line) => line === "## Summary");
  lines.splice(summary - 1, 0, ...extras);
  return lines.join("\n");
};

export const newSessionLogText = (header: SessionHeader, sessionId: string) =>
  serializeRecordDoc({
    preamble: buildHeader(header, [`- ${SESSION_ID_KEY}: ${sessionId}`]),
    records: [],
  });

export const rewriteHeader = (text: string, patch: Partial<SessionHeader>) => {
  const doc = parseRecordDoc(text);
  const { entries: _entries, ...header } = parseSessionLog(text);
  return serializeRecordDoc({
    preamble: buildHeader({ ...header, ...patch }, headerExtras(doc.preamble)),
    records: doc.records,
  });
};

/** One entry as the protocol serializes it, ready to append to an existing log. */
export const entryRecord = (entry: SessionLogEntry): MdRecord => {
  const text = serializeSessionLog({
    title: "x",
    mode: "deep-interview",
    repoPath: "",
    startedAt: "",
    summary: "",
    entries: [entry],
  });
  const record = parseRecordDoc(text).records[0];
  if (!record) throw new Error(`could not serialize session entry ${entry.id}`);
  return record;
};

export const sessionIdOf = (text: string) =>
  headerExtras(parseRecordDoc(text).preamble)
    .map((line) => new RegExp(`^- ${SESSION_ID_KEY}: ?(.*)$`).exec(line)?.[1]?.trim())
    .find(Boolean);

/** Scans sessions/ for the log that carries this Octoplan session id. */
export const findSessionLog = async (sessionsDir: string, sessionId: string) => {
  let names: string[];
  try {
    names = await readdir(sessionsDir);
  } catch {
    return null;
  }
  for (const name of names.filter((n) => n.endsWith(".md")).sort()) {
    const path = join(sessionsDir, name);
    const text = await readTextOrNull(path).catch(() => null);
    if (text !== null && sessionIdOf(text) === sessionId) return path;
  }
  return null;
};

/** What the user picked, as shown in the log (without the AskUserQuestion markers). */
export const displayAnswer = (answer: Answer) => {
  const chosen = [...answer.selected, answer.otherText?.trim() ?? ""].filter((s) => s.length > 0);
  if (chosen.length > 0) return chosen.join(", ");
  return answer.modifier === "parked" ? "(parked)" : "(no answer)";
};

export const latestEntryFor = (entries: readonly SessionLogEntry[], questionId: string) =>
  entries.filter((entry) => entry.questionId === questionId).at(-1) ?? null;
