import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { type Answer, PLAN_FILES, type QuestionRound } from "@octogent/octoplan-protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFsPlanStore } from "../../server/store/fsPlanStore";
import type { PlanStore } from "../../server/store/types";
import { type TempRepo, makeTempRepo } from "./helpers";

let repo: TempRepo;
let store: PlanStore;

beforeEach(async () => {
  repo = await makeTempRepo();
  store = createFsPlanStore(repo.repoPath);
});

afterEach(async () => {
  await store.dispose();
  await repo.cleanup();
});

const options = [
  { label: "A", description: "" },
  { label: "B", description: "" },
];

const round: QuestionRound = {
  id: "r1",
  sessionId: "s1",
  index: 1,
  askedAt: "2026-09-25T10:00:30.000Z",
  questions: [
    {
      id: "Q1",
      question: "Which storage?",
      header: "Storage",
      multiSelect: false,
      options,
      dimension: "data",
    },
    { id: "Q2", question: "Which database?", header: "DB", multiSelect: false, options },
    {
      id: "Q3",
      question: "Who are the users?",
      header: "Users",
      multiSelect: true,
      options,
      dimension: "users",
    },
  ],
};

const at = (minute: number) => `2026-09-25T10:0${minute}:00.000Z`;

const start = () =>
  store.startSessionLog({
    sessionId: "s1",
    title: "Plan the store",
    mode: "deep-interview",
    startedAt: "2026-09-25T10:00:00.000Z",
  });

describe("session log writer", () => {
  it("creates sessions/<date>-<slug>.md and avoids clobbering a same-named log", async () => {
    const path = await start();
    expect(basename(path)).toBe("2026-09-25-plan-the-store.md");
    expect(existsSync(path)).toBe(true);
    const second = await store.startSessionLog({
      sessionId: "s2",
      title: "Plan the store",
      mode: "quick-align",
      startedAt: "2026-09-25T11:00:00.000Z",
    });
    expect(basename(second)).toBe("2026-09-25-plan-the-store-2.md");
  });

  it("records plain, parked and tentative answers, then a revision, across four files", async () => {
    const path = await start();
    const answers: Answer[] = [
      { questionId: "Q1", selected: ["Markdown"], modifier: "none", answeredAt: at(1) },
      {
        questionId: "Q2",
        selected: [],
        modifier: "parked",
        assumption: "SQLite",
        answeredAt: at(1),
      },
      {
        questionId: "Q3",
        selected: ["Solo devs"],
        otherText: "small teams",
        modifier: "tentative",
        answeredAt: at(1),
      },
    ];
    const entries = await store.recordAnswers("s1", round, answers);
    expect(entries.map((e) => e.id)).toEqual(["A1", "A2", "A3"]);

    const revision = await store.recordAnswers("s1", round, [
      {
        questionId: "Q2",
        selected: ["Postgres"],
        modifier: "none",
        revisionOf: "Q2",
        answeredAt: at(2),
      },
    ]);
    expect(revision[0]).toMatchObject({ id: "A4", revises: "A2", answer: "Postgres" });
    expect(await store.latestAnswer("s1", "Q2")).toMatchObject({ id: "A4" });
    expect(await store.latestAnswer("s1", "Q9")).toBeNull();
    await store.setClaudeSessionId("s1", "claude-123");
    await store.writeSessionSummary("s1", "Chose Markdown and Postgres.");

    const logName = basename(path);
    expect(await readFile(path, "utf8")).toBe(
      [
        "# Session — Plan the store",
        "",
        "- mode: deep-interview",
        `- repo: ${repo.repoPath}`,
        "- started: 2026-09-25T10:00:00.000Z",
        "- claude-session: claude-123",
        "- octoplan-session: s1",
        "",
        "## Summary",
        "",
        "Chose Markdown and Postgres.",
        "",
        "## Answers",
        "",
        "<!-- op:id=A1 -->",
        "## A1 — Which storage?",
        "- question: Q1",
        "- round: 1",
        "- dimension: data",
        "- answer: Markdown",
        "- modifier: none",
        `- answered-at: ${at(1)}`,
        "",
        "<!-- op:id=A2 -->",
        "## A2 — Which database?",
        "- question: Q2",
        "- round: 1",
        "- answer: (parked)",
        "- modifier: parked",
        "- assumption: SQLite",
        `- answered-at: ${at(1)}`,
        "",
        "<!-- op:id=A3 -->",
        "## A3 — Who are the users?",
        "- question: Q3",
        "- round: 1",
        "- dimension: users",
        "- answer: Solo devs, small teams",
        "- modifier: tentative",
        `- answered-at: ${at(1)}`,
        "",
        "<!-- op:id=A4 -->",
        "## A4 — Which database?",
        "- question: Q2",
        "- round: 1",
        "- answer: Postgres",
        "- modifier: none",
        "- revises: A2",
        `- answered-at: ${at(2)}`,
        "",
      ].join("\n"),
    );

    expect(await repo.read(PLAN_FILES.parked.path)).toBe(
      [
        PLAN_FILES.parked.preamble,
        "",
        "<!-- op:id=P1 -->",
        "## P1 — Which database?",
        "- question: Q2",
        "- assumption: SQLite",
        "- date: 2026-09-25",
        "- status: resolved",
        "",
        `Parked in sessions/${logName} (A2). Resolved by A4: Postgres.`,
        "",
      ].join("\n"),
    );

    expect(await repo.read(PLAN_FILES.risks.path)).toBe(
      [
        PLAN_FILES.risks.preamble,
        "",
        "<!-- op:id=R1 -->",
        "## R1 — Tentative: Who are the users?",
        "- likelihood: medium",
        "- impact: medium",
        "- origin: Q3 tentative",
        "- status: open",
        "",
        `Answered "Solo devs, small teams" in sessions/${logName} (A3).`,
        "",
      ].join("\n"),
    );

    // Recording answers never touches the decision log.
    expect(existsSync(repo.planPath(PLAN_FILES.decisions.path))).toBe(false);
  });

  it("keeps hand edits to the log when appending", async () => {
    const path = await start();
    await store.recordAnswers("s1", round, [
      { questionId: "Q1", selected: ["Markdown"], modifier: "none", answeredAt: at(1) },
    ]);
    const edited = (await readFile(path, "utf8")).replace(
      `- answered-at: ${at(1)}\n`,
      `- answered-at: ${at(1)}\n- note-by: alex\n\nMy note on A1.\n`,
    );
    await repo.write(`sessions/${basename(path)}`, edited);
    await store.recordAnswers("s1", round, [
      { questionId: "Q3", selected: ["A"], modifier: "none", answeredAt: at(2) },
    ]);
    const text = await readFile(path, "utf8");
    expect(text).toContain("- note-by: alex\n\nMy note on A1.\n\n<!-- op:id=A2 -->");
  });

  it("finds a session log again after a restart", async () => {
    await start();
    await store.dispose();
    store = createFsPlanStore(repo.repoPath);
    const [entry] = await store.recordAnswers("s1", round, [
      { questionId: "Q1", selected: ["A"], modifier: "none", answeredAt: at(1) },
    ]);
    expect(entry?.id).toBe("A1");
    expect(await store.latestAnswer("s1", "Q1")).toMatchObject({ id: "A1", answer: "A" });
  });
});
