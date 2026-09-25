import {
  type DoneCriterion,
  type GoalDoc,
  coverageStatusSchema,
  goalDocSchema,
} from "@octogent/octoplan-protocol";
import { z } from "zod";

// Normalizes what Claude passes to `plan_write_goal` into a valid GoalDoc (SPEC §7:
// every DoD item must be checkable by running something).

const doneItemSchema = z.union([
  z.string(),
  z.object({
    id: z.string().optional(),
    text: z.string(),
    status: coverageStatusSchema.optional(),
    evidence: z.string().optional(),
  }),
]);

/** zod schema for the `plan_write_goal` tool input. */
export const writeGoalInputSchema = z.object({
  title: z.string(),
  why: z.string().optional(),
  goals: z.array(z.string()).optional(),
  nonGoals: z.array(z.string()).optional(),
  done: z.array(doneItemSchema),
});

export type WriteGoalInput = z.input<typeof writeGoalInputSchema>;
type DoneItemInput = Exclude<WriteGoalInput["done"][number], string>;

export type BuildGoalResult = { ok: true; goal: GoalDoc } | { ok: false; error: string };

/** Verbs that make a DoD item observable. Matched as whole words, case-insensitive. */
export const CHECKABLE_VERBS = [
  "run",
  "runs",
  "show",
  "shows",
  "return",
  "returns",
  "pass",
  "passes",
  "print",
  "prints",
  "output",
  "outputs",
  "exit",
  "exits",
  "render",
  "renders",
  "display",
  "displays",
  "respond",
  "responds",
  "list",
  "lists",
  "contain",
  "contains",
  "load",
  "loads",
  "open",
  "opens",
  "create",
  "creates",
  "write",
  "writes",
  "report",
  "reports",
  "log",
  "logs",
  "build",
  "builds",
  "compile",
  "compiles",
  "succeed",
  "succeeds",
  "fail",
  "fails",
  "reject",
  "rejects",
  "redirect",
  "redirects",
  "send",
  "sends",
  "receive",
  "receives",
  "complete",
  "completes",
  "produce",
  "produces",
  "appear",
  "appears",
  "exist",
  "exists",
  "match",
  "matches",
  "measure",
  "measures",
] as const;

const CHECKABLE_RE = new RegExp(`\\b(?:${CHECKABLE_VERBS.join("|")})\\b`, "i");
const DOD_ID_RE = /^DOD(\d+)$/;

const clean = (text: string) => text.replace(/\s+/g, " ").trim();

const dedupe = (items: readonly string[] = []): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of items) {
    const item = clean(raw);
    const key = item.toLowerCase();
    if (item.length === 0 || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
};

export const isCheckable = (text: string): boolean => CHECKABLE_RE.test(text);

export const buildGoalDoc = (input: WriteGoalInput): BuildGoalResult => {
  const title = clean(input.title);
  if (title.length === 0) {
    return { ok: false, error: "plan_write_goal needs a non-empty title. Call it again." };
  }

  type Draft = { id: string; text: string; status: DoneCriterion["status"]; evidence: string };
  const drafts: Draft[] = [];
  const seenText = new Set<string>();
  for (const raw of input.done) {
    const item: DoneItemInput = typeof raw === "string" ? { text: raw } : raw;
    const text = clean(item.text);
    const key = text.toLowerCase();
    if (text.length === 0 || seenText.has(key)) continue;
    seenText.add(key);
    drafts.push({
      id: item.id?.trim() ?? "",
      text,
      status: item.status ?? "unknown",
      evidence: clean(item.evidence ?? ""),
    });
  }

  if (drafts.length === 0) {
    return {
      ok: false,
      error:
        'plan_write_goal needs at least one Definition of done item, each checkable by running something (for example "`pnpm test` passes"). Call it again with `done` filled in.',
    };
  }

  const unchecked = drafts.filter((draft) => !isCheckable(draft.text));
  if (unchecked.length > 0) {
    const list = unchecked.map((draft) => `- "${draft.text}"`).join("\n");
    return {
      ok: false,
      error: `These Definition of done items can't be checked by running something:\n${list}\nRewrite each so it names what to run or observe, using a verb such as run, shows, returns or passes (for example "\`npm run e2e\` passes" or "GET /api/health returns 200"), then call plan_write_goal again with the full list.`,
    };
  }

  // Keep valid, unique DOD<n> ids; number the rest after the highest one used.
  const used = new Set<string>();
  let highest = 0;
  for (const draft of drafts) {
    const match = DOD_ID_RE.exec(draft.id);
    if (match && !used.has(draft.id)) {
      used.add(draft.id);
      highest = Math.max(highest, Number(match[1]));
    } else {
      draft.id = "";
    }
  }
  const done: DoneCriterion[] = drafts.map((draft) => ({
    id: draft.id || `DOD${++highest}`,
    text: draft.text,
    status: draft.status,
    evidence: draft.evidence,
  }));

  const goal: GoalDoc = {
    title,
    why: (input.why ?? "").trim(),
    goals: dedupe(input.goals),
    nonGoals: dedupe(input.nonGoals),
    done,
  };
  const parsed = goalDocSchema.safeParse(goal);
  if (!parsed.success) {
    return { ok: false, error: `plan_write_goal input is invalid: ${parsed.error.message}` };
  }
  return { ok: true, goal: parsed.data };
};
