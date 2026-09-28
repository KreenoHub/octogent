// User-level stores in ~/.octoplan (v2): session transcripts (D29) and conventions (D28).
// Runtime state like projects.json; the plan itself always stays in each repo's docs/plan.
import { appendFile, mkdir, open, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  CONVENTIONS_PREAMBLE,
  type Convention,
  type RecordDoc,
  type ServerEvent,
  conventionCodec,
  nextId,
  parseRecordDoc,
  readItems,
  removeItem,
  serializeRecordDoc,
  serverEventSchema,
  upsertItem,
} from "@octogent/octoplan-protocol";
import { FileWriter, readTextOrNull } from "./fsIo";
import type {
  ConventionsStore,
  TranscriptRecord,
  TranscriptStore,
  UserStoresOptions,
} from "./types";

export const TRANSCRIPTS_DIR_NAME = "transcripts";
export const CONVENTIONS_FILE_NAME = "CONVENTIONS.md";

const octoplanDir = (options: UserStoresOptions) => join(options.homeDir ?? homedir(), ".octoplan");

const localDate = (now: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

// ---------- transcripts (D29) ----------

type KeptEvent = Extract<
  ServerEvent,
  { type: "session-updated" | "block" | "question-round" | "round-answered" }
>;

const KEPT_TYPES = new Set<ServerEvent["type"]>([
  "session-updated",
  "block",
  "question-round",
  "round-answered",
]);

const isKept = (event: ServerEvent): event is KeptEvent => KEPT_TYPES.has(event.type);

/** Session ids become file names, so anything outside a safe set is replaced. */
export const transcriptFileName = (sessionId: string) =>
  `${sessionId.replace(/[^A-Za-z0-9._-]/g, "_")}.jsonl`;

/** One transcript file back into a record; corrupt lines are skipped, no session is null. */
export const parseTranscript = (text: string): TranscriptRecord | null => {
  let session: TranscriptRecord["session"] | null = null;
  const events: ServerEvent[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    let parsed: ReturnType<typeof serverEventSchema.safeParse>;
    try {
      parsed = serverEventSchema.safeParse(JSON.parse(line));
    } catch {
      continue;
    }
    if (!parsed.success || !isKept(parsed.data)) continue;
    if (parsed.data.type === "session-updated") session = parsed.data.session;
    else events.push(parsed.data);
  }
  return session ? { session, events } : null;
};

const endsWithNewline = async (path: string, size: number) => {
  const handle = await open(path, "r");
  try {
    const last = Buffer.alloc(1);
    await handle.read(last, 0, 1, size - 1);
    return last[0] === 0x0a;
  } finally {
    await handle.close();
  }
};

export const createTranscriptStore = (options: UserStoresOptions = {}): TranscriptStore => {
  const dir = join(octoplanDir(options), TRANSCRIPTS_DIR_NAME);
  // Appends are serialized per file. A plain append (not temp + rename) keeps a long
  // session cheap; a line torn by a crash is skipped on load like any corrupt line.
  const queues = new Map<string, Promise<void>>();

  const enqueue = (path: string, task: () => Promise<void>) => {
    const run = (queues.get(path) ?? Promise.resolve()).catch(() => undefined).then(task);
    queues.set(path, run);
    void run
      .catch(() => undefined)
      .finally(() => {
        if (queues.get(path) === run) queues.delete(path);
      });
    return run;
  };

  return {
    append(sessionId, event) {
      if (!isKept(event)) return Promise.resolve();
      const path = join(dir, transcriptFileName(sessionId));
      return enqueue(path, async () => {
        await mkdir(dir, { recursive: true });
        // Start on a fresh line if a previous write was torn mid-line.
        const size = await stat(path).then(
          (s) => s.size,
          () => 0,
        );
        const lead = size > 0 && !(await endsWithNewline(path, size)) ? "\n" : "";
        await appendFile(path, `${lead}${JSON.stringify(event)}\n`, "utf8");
      });
    },

    async load() {
      await Promise.allSettled([...queues.values()]);
      let names: string[];
      try {
        names = (await readdir(dir)).filter((name) => name.endsWith(".jsonl"));
      } catch {
        return [];
      }
      const records: TranscriptRecord[] = [];
      for (const name of names) {
        const text = await readTextOrNull(join(dir, name)).catch(() => null);
        const record = text === null ? null : parseTranscript(text);
        if (record) records.push(record);
      }
      return records.sort(
        (a, b) =>
          a.session.startedAt.localeCompare(b.session.startedAt) ||
          a.session.id.localeCompare(b.session.id),
      );
    },
  };
};

// ---------- conventions (D28) ----------

export const createConventionsStore = (options: UserStoresOptions = {}): ConventionsStore => {
  const file = join(octoplanDir(options), CONVENTIONS_FILE_NAME);
  const writer = new FileWriter();
  const now = options.now ?? (() => new Date());

  const toDoc = (text: string | null): RecordDoc =>
    text === null ? { preamble: CONVENTIONS_PREAMBLE, records: [] } : parseRecordDoc(text);

  return {
    async list() {
      const text = await readTextOrNull(file).catch(() => null);
      return readItems(toDoc(text), conventionCodec);
    },

    add({ title, body }) {
      return writer.mutate(file, (current) => {
        const doc = toDoc(current);
        const parsed = conventionCodec.fromRecord(
          conventionCodec.toRecord({
            id: nextId(doc, "C"),
            title: title.trim(),
            date: localDate(now()),
            body: body.trim(),
          }),
        );
        if (!parsed) throw new Error("A convention needs a title.");
        const convention: Convention = parsed;
        return {
          text: serializeRecordDoc(upsertItem(doc, conventionCodec, convention)),
          result: convention,
        };
      });
    },

    async remove(id) {
      // Removing an unknown id is a no-op, so a double click can't fail.
      await writer.mutate(file, (current) => {
        if (current === null) return { text: null, result: undefined };
        const doc = parseRecordDoc(current);
        if (!doc.records.some((record) => record.id === id)) {
          return { text: null, result: undefined };
        }
        return { text: serializeRecordDoc(removeItem(doc, id)), result: undefined };
      });
    },
  };
};
