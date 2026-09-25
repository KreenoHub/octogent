import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { coverageDimensionIdSchema } from "@octogent/octoplan-protocol";
import { z } from "zod";
import { buildGoalDoc, coverageUpdateSchema, writeGoalInputSchema } from "../modes";
import type { ApplyCoverageUpdate, CoverageUpdate } from "../modes/types";
import type { PlanStore } from "../store/types";

export const PLAN_SERVER_NAME = "octoplan";

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };
const ok = (text: string): ToolResult => ({ content: [{ type: "text", text }] });
const fail = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true });

const level = z.enum(["low", "medium", "high"]);

// Drops undefined values so optional fields satisfy exactOptionalPropertyTypes.
const defined = <T extends Record<string, unknown>>(value: T) =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };

export type PlanToolsContext = {
  store: PlanStore;
  applyCoverageUpdate: ApplyCoverageUpdate;
  today: () => string;
};

/** Handlers are exported separately so tests can call them without an MCP transport. */
export const createPlanToolHandlers = ({
  store,
  applyCoverageUpdate,
  today,
}: PlanToolsContext) => ({
  plan_record_decision: async (args: {
    id?: string | undefined;
    title: string;
    body: string;
    questionIds?: string[] | undefined;
    dependsOn?: string[] | undefined;
  }) => {
    const decision = await store.upsertDecision({
      ...defined({ id: args.id }),
      title: args.title,
      body: args.body,
      source: "octoplan session",
      questionIds: args.questionIds ?? [],
      dependsOn: args.dependsOn ?? [],
      status: "active",
    });
    return ok(`Recorded ${decision.id}: ${decision.title}`);
  },

  plan_update_coverage: async (args: z.infer<typeof coverageUpdateSchema>) => {
    const snapshot = await store.snapshot();
    const update = defined(args) as CoverageUpdate;
    const next = applyCoverageUpdate(snapshot.coverage, update);
    const dimension = next.dimensions.find((d) => d.id === update.id);
    if (!dimension) return fail(`Unknown coverage dimension "${update.id}".`);
    await store.updateCoverage(dimension);
    return ok(`Coverage ${dimension.id}: ${dimension.status} (${dimension.confidence})`);
  },

  plan_add_gap: async (args: {
    title: string;
    body?: string | undefined;
    dimension?: z.infer<typeof coverageDimensionIdSchema> | undefined;
  }) => {
    const gap = await store.addGap({
      title: args.title,
      body: args.body ?? "",
      status: "open",
      ...defined({ dimension: args.dimension }),
    });
    return ok(`Recorded ${gap.id}: ${gap.title}`);
  },

  plan_add_risk: async (args: {
    title: string;
    body?: string | undefined;
    likelihood?: z.infer<typeof level> | undefined;
    impact?: z.infer<typeof level> | undefined;
    origin?: string | undefined;
  }) => {
    const risk = await store.addRisk({
      title: args.title,
      body: args.body ?? "",
      likelihood: args.likelihood ?? "medium",
      impact: args.impact ?? "medium",
      origin: args.origin ?? "",
      status: "open",
    });
    return ok(`Recorded ${risk.id}: ${risk.title}`);
  },

  plan_park: async (args: {
    title: string;
    assumption: string;
    questionId?: string | undefined;
    body?: string | undefined;
  }) => {
    const parked = await store.park({
      title: args.title,
      assumption: args.assumption,
      body: args.body ?? "",
      date: today(),
      status: "parked",
      ...defined({ questionId: args.questionId }),
    });
    return ok(`Parked ${parked.id}: ${parked.title} (assuming "${parked.assumption}")`);
  },

  plan_add_idea: async (args: {
    title: string;
    body?: string | undefined;
    tags?: string[] | undefined;
  }) => {
    const idea = await store.addIdea({
      title: args.title,
      body: args.body ?? "",
      tags: args.tags ?? [],
      date: today(),
      status: "inbox",
    });
    return ok(`Recorded ${idea.id}: ${idea.title}`);
  },

  plan_write_goal: async (args: z.infer<typeof writeGoalInputSchema>) => {
    const built = buildGoalDoc(args);
    if (!built.ok) return fail(built.error);
    await store.writeGoal(built.goal);
    return ok(`Wrote GOAL.md: ${built.goal.done.length} definition-of-done items`);
  },
});

export const createPlanToolsServer = (context: PlanToolsContext) => {
  const handlers = createPlanToolHandlers(context);
  return createSdkMcpServer({
    name: PLAN_SERVER_NAME,
    version: "0.1.0",
    tools: [
      tool(
        "plan_record_decision",
        "Record or update a decision (D<n>). Omit id to create a new one.",
        {
          id: z.string().optional(),
          title: z.string().min(1),
          body: z.string(),
          questionIds: z.array(z.string()).optional(),
          dependsOn: z.array(z.string()).optional(),
        },
        handlers.plan_record_decision,
      ),
      tool(
        "plan_update_coverage",
        "Update one coverage dimension (status only moves forward unless regress is true).",
        coverageUpdateSchema.shape,
        handlers.plan_update_coverage,
      ),
      tool(
        "plan_add_gap",
        "Record something the plan does not answer yet (G<n>).",
        {
          title: z.string().min(1),
          body: z.string().optional(),
          dimension: coverageDimensionIdSchema.optional(),
        },
        handlers.plan_add_gap,
      ),
      tool(
        "plan_add_risk",
        "Record a risk (R<n>), including every TENTATIVE answer.",
        {
          title: z.string().min(1),
          body: z.string().optional(),
          likelihood: level.optional(),
          impact: level.optional(),
          origin: z.string().optional(),
        },
        handlers.plan_add_risk,
      ),
      tool(
        "plan_park",
        "Park a question you must proceed on without the user's answer, with the assumption used.",
        {
          title: z.string().min(1),
          assumption: z.string().min(1),
          questionId: z.string().optional(),
          body: z.string().optional(),
        },
        handlers.plan_park,
      ),
      tool(
        "plan_add_idea",
        "Add an idea to the inbox (I<n>).",
        {
          title: z.string().min(1),
          body: z.string().optional(),
          tags: z.array(z.string()).optional(),
        },
        handlers.plan_add_idea,
      ),
      tool(
        "plan_write_goal",
        "Write GOAL.md. Every done item must be checkable by running or observing something.",
        writeGoalInputSchema.shape,
        handlers.plan_write_goal,
      ),
    ],
  });
};
