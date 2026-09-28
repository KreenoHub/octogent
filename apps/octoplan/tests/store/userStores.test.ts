import { existsSync } from "node:fs";
import { appendFile, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { QuestionRound, ServerEvent, Session } from "@octogent/octoplan-protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CONVENTIONS_FILE_NAME,
  TRANSCRIPTS_DIR_NAME,
  createConventionsStore,
  createTranscriptStore,
} from "../../server/store/userStores";

// Every test uses a throwaway homeDir, never the real ~/.octoplan.
let homeDir: string;

beforeEach(async () => {
  homeDir = await mkdtemp(join(tmpdir(), "octoplan-home-"));
});

afterEach(async () => {
  await rm(homeDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

const session = (id: string, startedAt: string, status: Session["status"]): Session => ({
  id,
  claudeSessionId: `claude-${id}`,
  title: `Session ${id}`,
  mode: "deep-interview",
  repoPath: "/repo",
  status,
  startedAt,
});

const round = (sessionId: string, index: number): QuestionRound => ({
  id: `${sessionId}-r${index}`,
  sessionId,
  index,
  askedAt: `2026-09-27T10:0${index}:00.000Z`,
  questions: [
    {
      id: `Q${index}`,
      question: `Question ${index}?`,
      header: "H",
      multiSelect: false,
      options: [
        { label: "A", description: "" },
        { label: "B", description: "" },
      ],
    },
  ],
});

describe("transcript store (D29)", () => {
  it("rebuilds blocks, an answered round and a pending round after a restart", async () => {
    const before = createTranscriptStore({ homeDir });
    const events: ServerEvent[] = [
      { type: "session-updated", session: session("s1", "2026-09-27T10:00:00.000Z", "running") },
      {
        type: "block",
        sessionId: "s1",
        block: { kind: "user", id: "b1", text: "Plan it", at: "2026-09-27T10:00:01.000Z" },
      },
      { type: "question-round", round: round("s1", 1) },
      {
        type: "round-answered",
        sessionId: "s1",
        roundId: "s1-r1",
        answers: [
          {
            questionId: "Q1",
            selected: ["A"],
            modifier: "none",
            answeredAt: "2026-09-27T10:01:30.000Z",
          },
        ],
      },
      {
        type: "block",
        sessionId: "s1",
        block: {
          kind: "section",
          id: "b2",
          heading: "Next",
          markdown: "One more question.",
          at: "2026-09-27T10:01:40.000Z",
        },
      },
      { type: "question-round", round: round("s1", 2) },
      {
        type: "session-updated",
        session: session("s1", "2026-09-27T10:00:00.000Z", "waiting-for-answer"),
      },
    ];
    for (const event of events) await before.append("s1", event);
    // Not kept: these are not conversation state.
    await before.append("s1", { type: "notice", message: "Captured I4" });
    await before.append("s1", { type: "error", message: "boom", sessionId: "s1" });

    const after = createTranscriptStore({ homeDir });
    const [record, ...rest] = await after.load();
    expect(rest).toEqual([]);
    expect(record?.session.status).toBe("waiting-for-answer");
    expect(record?.session.claudeSessionId).toBe("claude-s1");
    expect(record?.events).toEqual(events.filter((e) => e.type !== "session-updated"));
    const answered = new Set(
      record?.events.flatMap((e) => (e.type === "round-answered" ? [e.roundId] : [])),
    );
    const pending = record?.events.filter(
      (e) => e.type === "question-round" && !answered.has(e.round.id),
    );
    expect(pending).toEqual([{ type: "question-round", round: round("s1", 2) }]);
  });

  it("skips corrupt lines, keeps sessions apart and loads oldest first", async () => {
    const store = createTranscriptStore({ homeDir });
    await store.append("late", {
      type: "session-updated",
      session: session("late", "2026-09-28T10:00:00.000Z", "idle"),
    });
    await store.append("early", {
      type: "session-updated",
      session: session("early", "2026-09-27T10:00:00.000Z", "idle"),
    });
    const dir = join(homeDir, ".octoplan", TRANSCRIPTS_DIR_NAME);
    // A torn write and garbage, then a valid event appended after them.
    await appendFile(join(dir, "early.jsonl"), 'not json\n{"type":"block","sessionId":');
    await store.append("early", { type: "question-round", round: round("early", 1) });
    // A transcript without any session state is ignored.
    await appendFile(join(dir, "orphan.jsonl"), `${JSON.stringify({ type: "hello" })}\n`);

    const records = await createTranscriptStore({ homeDir }).load();
    expect(records.map((r) => r.session.id)).toEqual(["early", "late"]);
    expect(records[0]?.events).toEqual([{ type: "question-round", round: round("early", 1) }]);
    expect((await readdir(dir)).sort()).toEqual(["early.jsonl", "late.jsonl", "orphan.jsonl"]);
  });

  it("loads nothing when there is no transcripts folder", async () => {
    expect(await createTranscriptStore({ homeDir }).load()).toEqual([]);
  });
});

describe("conventions store (D28)", () => {
  it("writes, reads, lists and removes C-records in ~/.octoplan without touching a repo", async () => {
    const now = () => new Date(2026, 8, 27, 12);
    const store = createConventionsStore({ homeDir, now });
    expect(await store.list()).toEqual([]);

    const first = await store.add({ title: "pnpm, never npm", body: "Every repo uses pnpm." });
    const second = await store.add({ title: "Biome for lint", body: "" });
    expect([first.id, second.id]).toEqual(["C1", "C2"]);
    expect(first.date).toBe("2026-09-27");

    const file = join(homeDir, ".octoplan", CONVENTIONS_FILE_NAME);
    const text = await readFile(file, "utf8");
    expect(text).toContain("<!-- op:id=C1 -->\n## C1 — pnpm, never npm\n- date: 2026-09-27");
    expect(await createConventionsStore({ homeDir }).list()).toEqual([first, second]);

    await store.remove("C1");
    await store.remove("C404");
    expect(await store.list()).toEqual([second]);
    expect((await store.add({ title: "Third", body: "" })).id).toBe("C3");
    expect(await readdir(homeDir)).toEqual([".octoplan"]);
    await expect(store.add({ title: "  ", body: "" })).rejects.toThrow();
    expect(existsSync(join(homeDir, ".octoplan", "projects.json"))).toBe(false);
  });
});
