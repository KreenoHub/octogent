// Server-side plan operations for the wave-2 client events that don't need a Claude session:
// idea search and brainstorm actions, staged prompts, tentacle export, git graph, branch links.
// Wiring only: the logic lives in the store, modes and integrations tentacles (D33).
import { resolve } from "node:path";
import type { IdeaAction, IdeaSearchResult, ServerEvent } from "@octogent/octoplan-protocol";
import type { Broadcast } from "./bridge/types";
import type { Integrations } from "./integrations/types";
import type { ApplyIdeaAction, BuildStages } from "./modes/wave2Types";
import type { IdeaRegistry, PlanStore } from "./store/types";

export type PlanOpsDeps = {
  storeFor: (repoPath: string) => PlanStore;
  broadcast: Broadcast;
  applyIdeaAction: ApplyIdeaAction;
  buildStages: BuildStages;
  integrations?: Integrations;
  ideaRegistry?: IdeaRegistry;
};

export const NO_INTEGRATIONS_MESSAGE =
  "This Octoplan server was started without integrations, so git graphs and Octogent export are unavailable.";
export const NO_GOAL_MESSAGE =
  "Write GOAL.md first (finish a deep interview, or ask Claude for plan_write_goal), then generate stages.";

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

const IDEA_ACTION_PAST: Record<IdeaAction, string> = {
  star: "starred",
  park: "parked",
  kill: "killed",
  adopt: "adopted",
  merge: "merged",
  reopen: "reopened",
};

export const createPlanOps = (deps: PlanOpsDeps) => {
  const { broadcast } = deps;
  const fail = (message: string) => broadcast({ type: "error", message });
  const notice = (message: string) => broadcast({ type: "notice", message });
  /** Repos opened this run; the registry (when present) adds every repo ever registered. */
  const knownRepos = new Set<string>();

  const registerRepo = async (repoPath: string) => {
    const path = resolve(repoPath);
    knownRepos.add(path);
    await deps.ideaRegistry?.registerRepo(path).catch(() => {
      // Search still covers this run's repos; a failed registration only narrows later searches.
    });
  };

  return {
    registerRepo,

    searchIdeas: async (query: string, reply: (event: ServerEvent) => void) => {
      try {
        const fromRegistry = deps.ideaRegistry ? await deps.ideaRegistry.searchIdeas(query) : [];
        const seen = new Set(fromRegistry.map((r) => resolve(r.repoPath).toLowerCase()));
        const needle = query.trim().toLowerCase();
        const local: IdeaSearchResult[] = [];
        for (const repoPath of knownRepos) {
          if (seen.has(repoPath.toLowerCase())) continue;
          const { ideas } = await deps.storeFor(repoPath).snapshot();
          for (const idea of ideas) {
            const haystack = `${idea.title} ${idea.tags.join(" ")} ${idea.body}`.toLowerCase();
            if (!needle || needle.split(/\s+/).every((word) => haystack.includes(word))) {
              local.push({ repoPath, idea });
            }
          }
        }
        reply({ type: "ideas", query, results: [...fromRegistry, ...local] });
      } catch (error) {
        fail(`Idea search failed: ${errorText(error)}`);
      }
    },

    updateIdea: async (repoPath: string, ideaId: string, action: IdeaAction, intoId?: string) => {
      try {
        const store = deps.storeFor(repoPath);
        const { ideas } = await store.snapshot();
        const result = deps.applyIdeaAction(ideas, ideaId, action, intoId);
        if (!result.ok) {
          fail(result.error);
          return;
        }
        for (const idea of result.changed) await store.updateIdea(idea);
        notice(
          action === "merge" && intoId
            ? `Merged ${ideaId} into ${intoId}`
            : `${ideaId} ${IDEA_ACTION_PAST[action]}`,
        );
      } catch (error) {
        fail(`Could not update ${ideaId}: ${errorText(error)}`);
      }
    },

    generateStages: async (repoPath: string) => {
      const path = resolve(repoPath);
      try {
        const store = deps.storeFor(path);
        const { goal, decisions } = await store.snapshot();
        if (!goal) {
          fail(NO_GOAL_MESSAGE);
          return;
        }
        const stages = deps.buildStages(goal, decisions);
        await store.writeStages(stages);
        broadcast({ type: "stages", repoPath: path, stages });
        notice(`Wrote ${stages.length} staged prompts to docs/plan/stages/`);
      } catch (error) {
        fail(`Could not generate stages: ${errorText(error)}`);
      }
    },

    exportTentacle: async (repoPath: string, tentacleId: string, tasks: readonly string[]) => {
      const path = resolve(repoPath);
      if (!deps.integrations) {
        broadcast({
          type: "export-result",
          repoPath: path,
          tentacleId,
          ok: false,
          message: NO_INTEGRATIONS_MESSAGE,
        });
        return;
      }
      try {
        const { goal, decisions } = await deps.storeFor(path).snapshot();
        const result = await deps.integrations.exportToTentacle({
          repoPath: path,
          tentacleId,
          goal,
          decisions: decisions.filter((d) => d.status === "active"),
          tasks,
        });
        broadcast({ type: "export-result", repoPath: path, tentacleId, ...result });
      } catch (error) {
        broadcast({
          type: "export-result",
          repoPath: path,
          tentacleId,
          ok: false,
          message: `Export failed: ${errorText(error)}`,
        });
      }
    },

    requestGraph: async (repoPath: string, reply: (event: ServerEvent) => void) => {
      const path = resolve(repoPath);
      if (!deps.integrations) {
        fail(NO_INTEGRATIONS_MESSAGE);
        return;
      }
      try {
        const branches = await deps.storeFor(path).readBranches();
        reply({ type: "graph", graph: await deps.integrations.buildGraph(path, branches) });
      } catch (error) {
        fail(`Could not read the git graph: ${errorText(error)}`);
      }
    },

    linkBranch: async (repoPath: string, branchId: string, gitBranch: string) => {
      try {
        const store = deps.storeFor(repoPath);
        const branch = (await store.readBranches()).find((b) => b.id === branchId);
        if (!branch) {
          fail(`No conversation branch ${branchId} in docs/plan/branches.md.`);
          return;
        }
        await store.upsertBranch({ ...branch, gitBranch });
        notice(`Linked ${branchId} to ${gitBranch}`);
      } catch (error) {
        fail(`Could not link ${branchId}: ${errorText(error)}`);
      }
    },
  };
};

export type PlanOps = ReturnType<typeof createPlanOps>;
