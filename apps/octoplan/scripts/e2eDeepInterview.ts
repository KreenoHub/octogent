// LIVE end-to-end check of the MVP loop against real Claude (uses your Claude Code login).
// Drives a Deep interview over the Octoplan WebSocket exactly like the UI would:
// answers rounds, parks one question, marks one tentative, revises an earlier answer,
// then asks Claude to wrap up and verifies what landed in <repo>/docs/plan.
//
//   pnpm --filter @octogent/octoplan e2e:live -- <scratchRepo> [maxRounds]
//
// Requires the Octoplan server running with real deps (pnpm --filter @octogent/octoplan dev).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  type Answer,
  type ClientEvent,
  PROTOCOL_VERSION,
  type PlanSnapshot,
  type Question,
  type QuestionRound,
  parseServerEvent,
} from "@octogent/octoplan-protocol";
import { WebSocket } from "ws";

const repoPath = resolve(process.argv[2] ?? "");
const maxRounds = Number.parseInt(process.argv[3] ?? "4", 10);
const port = process.env.OCTOPLAN_PORT ?? "8790";
const TIMEOUT_MS = 25 * 60_000;

if (!process.argv[2] || !existsSync(repoPath)) {
  console.error("Usage: e2e:live -- <existing scratch repo path> [maxRounds]");
  process.exit(2);
}

const log = (line: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${line}`);
const now = () => new Date().toISOString();

const pick = (question: Question) =>
  question.options.find((o) => o.label.includes("(Recommended)")) ?? question.options[0];

const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
const send = (event: ClientEvent) => socket.send(JSON.stringify(event));

let sessionId: string | null = null;
let roundsAnswered = 0;
let revised = false;
let wrapUpSent = false;
let lastPlan: PlanSnapshot | null = null;
const answeredRounds: QuestionRound[] = [];
const modifiersUsed = new Set<string>();
let sectionBlocks = 0;
let toolBlocks = 0;

const answerRound = (round: QuestionRound) => {
  const answers: Answer[] = round.questions.map((question, index) => {
    const option = pick(question);
    const base = {
      questionId: question.id,
      selected: option ? [option.label] : [],
      answeredAt: now(),
    };
    if (!modifiersUsed.has("tentative") && index === 1) {
      modifiersUsed.add("tentative");
      return { ...base, modifier: "tentative" };
    }
    if (!modifiersUsed.has("parked") && index === 2) {
      modifiersUsed.add("parked");
      return {
        ...base,
        selected: [],
        modifier: "parked",
        assumption: option?.label ?? "your recommendation",
      };
    }
    return { ...base, modifier: "none" };
  });
  log(
    `round ${round.index}: answering ${answers.map((a) => `${a.questionId}=${a.modifier}`).join(", ")}`,
  );
  send({ type: "answer-round", sessionId: round.sessionId, roundId: round.id, answers });
  answeredRounds.push(round);
  roundsAnswered++;
};

const reviseFirstAnswer = () => {
  const round = answeredRounds[0];
  const question = round?.questions[0];
  if (!round || !question) return;
  const current = pick(question)?.label;
  const alternative = question.options.find((o) => o.label !== current) ?? question.options[0];
  if (!alternative) return;
  revised = true;
  log(`revising ${question.id} to "${alternative.label}"`);
  send({
    type: "revise-answer",
    sessionId: round.sessionId,
    answer: {
      questionId: question.id,
      selected: [alternative.label],
      modifier: "none",
      revisionOf: question.id,
      answeredAt: now(),
    },
  });
};

const finish = (reason: string) => {
  const planDir = join(repoPath, "docs", "plan");
  const files = existsSync(planDir) ? readdirSync(planDir, { recursive: true }).map(String) : [];
  const goal = join(planDir, "GOAL.md");
  const coverage = lastPlan?.coverage.dimensions ?? [];
  console.log("\n===== E2E SUMMARY =====");
  console.log(`reason: ${reason}`);
  console.log(
    `rounds answered: ${roundsAnswered}, revised: ${revised}, modifiers: ${[...modifiersUsed].join(",")}`,
  );
  console.log(`blocks: ${sectionBlocks} sections, ${toolBlocks} tool rows`);
  console.log(`docs/plan files: ${files.join(", ") || "(none)"}`);
  console.log(
    `coverage: ${coverage.map((d) => `${d.id}=${d.status}`).join(" ") || "(no plan event)"}`,
  );
  console.log(
    `decisions: ${lastPlan?.decisions.length ?? 0} (stale ${lastPlan?.decisions.filter((d) => d.status === "stale").length ?? 0}), parked ${lastPlan?.parked.length ?? 0}, risks ${lastPlan?.risks.length ?? 0}`,
  );
  console.log(
    `GOAL.md: ${existsSync(goal) ? `${readFileSync(goal, "utf8").split("\n").length} lines` : "missing"}`,
  );
  const ok =
    roundsAnswered >= 2 &&
    revised &&
    files.some((f) => f.startsWith("sessions")) &&
    files.includes("DECISIONS.md") &&
    files.includes("PARKED.md") &&
    files.includes("RISKS.md") &&
    existsSync(goal);
  console.log(ok ? "E2E PASS" : "E2E INCOMPLETE");
  socket.close();
  process.exit(ok ? 0 : 1);
};

setTimeout(() => finish("timeout"), TIMEOUT_MS);

socket.on("open", () => {
  send({ type: "hello", protocolVersion: PROTOCOL_VERSION });
  send({
    type: "start-session",
    repoPath,
    mode: "deep-interview",
    topic:
      "A tiny CLI habit tracker for one person: log a habit each day, see a weekly streak. Keep the plan small.",
  });
  log(`started deep interview on ${repoPath}`);
});

socket.on("message", (raw) => {
  const event = parseServerEvent(raw.toString());
  if (!event) return;
  switch (event.type) {
    case "session-updated": {
      if (!sessionId && event.session.repoPath === repoPath) sessionId = event.session.id;
      if (event.session.id !== sessionId) return;
      log(`session ${event.session.status}`);
      const goalWritten = existsSync(join(repoPath, "docs", "plan", "GOAL.md"));
      if (wrapUpSent && goalWritten && ["idle", "ended"].includes(event.session.status)) {
        finish("goal written and session idle");
      }
      if (event.session.status === "error") finish("session error");
      break;
    }
    case "block":
      if (event.sessionId !== sessionId) return;
      if (event.block.kind === "section") sectionBlocks++;
      if (event.block.kind === "tool") toolBlocks++;
      break;
    case "question-round":
      if (event.round.sessionId !== sessionId) return;
      if (wrapUpSent) {
        // Still answer, so Claude can finish.
        answerRound(event.round);
        return;
      }
      answerRound(event.round);
      if (roundsAnswered === 2 && !revised) setTimeout(reviseFirstAnswer, 1000);
      if (roundsAnswered >= maxRounds && !wrapUpSent) {
        wrapUpSent = true;
        setTimeout(() => {
          log("asking Claude to wrap up");
          send({
            type: "send-message",
            sessionId: event.round.sessionId,
            text: "Let's stop the interview here. Record any remaining decisions, then write GOAL.md with plan_write_goal from what we have, marking uncovered dimensions as gaps.",
          });
        }, 1500);
      }
      break;
    case "plan":
      if (resolve(event.repoPath) === repoPath) lastPlan = event.plan;
      break;
    case "error":
      log(`server error: ${event.message}`);
      break;
    default:
      break;
  }
});

socket.on("error", (error) => {
  console.error(`WebSocket error: ${error.message}. Is the Octoplan server running on :${port}?`);
  process.exit(1);
});
