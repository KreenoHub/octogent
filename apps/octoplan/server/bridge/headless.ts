// Short read-only Agent SDK passes for harvest (D31) and the handoff proposal (D45).
// One query per call: planning lockdown, project settings only, bounded turns, and a
// single octoplan tool whose inputs are what the pass returns.
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { Options, SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import { type HandoffTentacle, harvestCandidateSchema } from "@octogent/octoplan-protocol";
import { z } from "zod";
import type { IngestReport } from "../modes/ingest";
import type { HarvestCandidateInput } from "../store/types";
import { createInputQueue } from "./inputQueue";
import { PLAN_SERVER_NAME } from "./planTools";
import { PLANNING_BUILTIN_TOOLS, isToolAllowed } from "./toolPolicy";
import type { CreateHeadlessRunner, QueryFn } from "./types";

export const HARVEST_TOOL = "plan_add_harvest";
export const HANDOFF_TOOL = "plan_propose_handoff";
export const INGEST_TOOL = "plan_ingest";
/** G5: an import reads more than a harvest; tune against real monorepos. */
export const INGEST_MAX_TURNS = 40;

/** Nobody is there to answer, so a headless pass gets the read tools without AskUserQuestion. */
export const HEADLESS_READ_TOOLS = PLANNING_BUILTIN_TOOLS.filter((t) => t !== "AskUserQuestion");

export const HEADLESS_PROMPT_APPEND =
  "This is a one-shot, read-only Octoplan pass: nobody will answer questions. Read what you need with Read, Glob and Grep, report through the single octoplan tool, then stop. Never edit files.";

const DEFAULT_MAX_TURNS = 12;

const harvestInputSchema = harvestCandidateSchema.pick({
  title: true,
  body: true,
  source: true,
  sourceKind: true,
  contradicts: true,
});

const handoffTodoShape = z.object({
  text: z.string(),
  decisionIds: z.array(z.string()),
  wave: z.string(),
});

const handoffTentacleShape = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  owns: z.array(z.string()),
  existing: z.boolean(),
  todos: z.array(handoffTodoShape),
});

// Loose on purpose: normalizeIngest drops what doesn't fit instead of failing the whole pass.
const ingestReportShape = {
  title: z.string().optional(),
  why: z.string().optional(),
  maturity: z.string().optional(),
  maturityReasons: z.string().optional(),
  sources: z
    .array(
      z.object({ id: z.string(), maturity: z.string().optional(), note: z.string().optional() }),
    )
    .optional(),
  items: z
    .array(
      z.object({
        kind: z.string(),
        title: z.string(),
        body: z.string().optional(),
        evidence: z.string().optional(),
        source: z.string().optional(),
        quote: z.string().optional(),
        reason: z.string().optional(),
        inPlan: z.string().optional(),
        disagreement: z.boolean().optional(),
      }),
    )
    .optional(),
  coverage: z.array(z.object({ dimension: z.string(), status: z.string() })).optional(),
};

const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Runs one query with exactly one octoplan tool; `onCall` sees every input Claude passed.
 * Resolves when the SDK stream ends; rejects on an SDK error or a failed run.
 */
const runPass = async (
  query: QueryFn,
  maxTurns: number,
  repoPath: string,
  prompt: string,
  // biome-ignore lint/suspicious/noExplicitAny: the SDK types its tool list this way.
  toolDef: SdkMcpToolDefinition<any>,
  onCall: () => number,
  extra: Pick<Options, "additionalDirectories"> = {},
) => {
  const input = createInputQueue();
  const abort = new AbortController();
  const mcpTool = `mcp__${PLAN_SERVER_NAME}__${toolDef.name}`;
  const options: Options = {
    cwd: repoPath,
    systemPrompt: { type: "preset", preset: "claude_code", append: HEADLESS_PROMPT_APPEND },
    tools: HEADLESS_READ_TOOLS,
    settingSources: ["project"],
    permissionMode: "default",
    canUseTool: async (toolName, toolInput) =>
      toolName === mcpTool || isToolAllowed(toolName, HEADLESS_READ_TOOLS)
        ? { behavior: "allow", updatedInput: toolInput }
        : { behavior: "deny", message: "This is a read-only Octoplan pass." },
    mcpServers: {
      [PLAN_SERVER_NAME]: createSdkMcpServer({ name: PLAN_SERVER_NAME, tools: [toolDef] }),
    },
    maxTurns,
    abortController: abort,
    ...extra,
  };
  input.push(prompt);
  try {
    for await (const message of query({ prompt: input.iterable, options })) {
      if (message.type !== "result") continue;
      input.close();
      // Running out of turns after reporting is fine; failing before reporting anything is not.
      if (message.subtype !== "success" && onCall() === 0) {
        throw new Error(`Claude stopped: ${message.subtype}`);
      }
    }
  } catch (error) {
    throw new Error(`Headless pass failed: ${errorText(error)}`);
  } finally {
    input.close();
  }
};

export const createHeadlessRunner: CreateHeadlessRunner = ({ query, maxTurns }) => {
  const turns = maxTurns ?? DEFAULT_MAX_TURNS;
  return {
    harvest: async ({ repoPath, prompt }) => {
      const collected: HarvestCandidateInput[] = [];
      const harvestTool = tool(
        HARVEST_TOOL,
        "Record one decision candidate found in a commit or todo change (call once per candidate).",
        {
          title: z.string(),
          body: z.string(),
          source: z.string(),
          sourceKind: z.enum(["commit", "todo"]),
          contradicts: z.array(z.string()),
        },
        async (args) => {
          const parsed = harvestInputSchema.safeParse(args);
          if (!parsed.success) return ok("Skipped: the candidate needs a title.");
          collected.push(parsed.data);
          return ok(`Recorded candidate: ${parsed.data.title}`);
        },
      );
      await runPass(query, turns, repoPath, prompt, harvestTool, () => collected.length);
      return collected;
    },

    proposeHandoff: async ({ repoPath, prompt }) => {
      let proposed: HandoffTentacle[] | null = null;
      const handoffTool = tool(
        HANDOFF_TOOL,
        "Propose the whole tentacle split at once; a later call replaces an earlier one.",
        { tentacles: z.array(handoffTentacleShape) },
        async (args) => {
          const raw: unknown[] = Array.isArray(args.tentacles) ? args.tentacles : [];
          const valid = raw.flatMap((entry) => {
            // Loose shape: an id like "UI Shell" is slugged by normalizeHandoff, not dropped.
            const parsed = handoffTentacleShape.safeParse(entry);
            return parsed.success ? [parsed.data] : [];
          });
          proposed = valid;
          return ok(`Proposed ${valid.length} tentacle${valid.length === 1 ? "" : "s"}.`);
        },
      );
      await runPass(query, turns, repoPath, prompt, handoffTool, () => (proposed ? 1 : 0));
      return proposed ?? [];
    },

    ingest: async ({ repoPath, prompt, additionalDirectories }) => {
      let report: IngestReport | null = null;
      const ingestTool = tool(
        INGEST_TOOL,
        "Report the whole import at once; a later call replaces an earlier one.",
        ingestReportShape,
        async (args) => {
          report = args as IngestReport;
          const count = Array.isArray(args.items) ? args.items.length : 0;
          return ok(`Recorded the import: ${count} item${count === 1 ? "" : "s"}.`);
        },
      );
      await runPass(
        query,
        maxTurns ?? INGEST_MAX_TURNS,
        repoPath,
        prompt,
        ingestTool,
        () => (report ? 1 : 0),
        additionalDirectories.length > 0 ? { additionalDirectories } : {},
      );
      return report;
    },
  };
};
