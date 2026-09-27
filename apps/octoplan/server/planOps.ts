// Server-side plan operations for the wave-2 client events that don't need a Claude session:
// idea search and brainstorm actions, staged prompts, tentacle export, git graph, branch links.
// Wiring only: the logic lives in the store, modes and integrations tentacles (D33).
import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  HandoffPlan,
  HandoffTentacle,
  IdeaAction,
  IdeaSearchResult,
  ServerEvent,
} from "@octogent/octoplan-protocol";
import type { Broadcast, HeadlessRunner } from "./bridge/types";
import type { Integrations } from "./integrations/types";
import * as defaultV2 from "./modes/handoff";
import type { ApplyIdeaAction, BuildStages } from "./modes/wave2Types";
import type { ConventionsStore, IdeaRegistry, PlanStore } from "./store/types";

export type PlanOpsV2Modes = Pick<
  typeof defaultV2,
  | "buildHarvestPrompt"
  | "buildHandoffPrompt"
  | "fallbackHandoff"
  | "normalizeHandoff"
  | "buildOctopusPrompt"
>;

export type PlanOpsDeps = {
  storeFor: (repoPath: string) => PlanStore;
  broadcast: Broadcast;
  applyIdeaAction: ApplyIdeaAction;
  buildStages: BuildStages;
  integrations?: Integrations;
  ideaRegistry?: IdeaRegistry;
  // v2
  headless?: HeadlessRunner;
  conventions?: ConventionsStore;
  /** Prompt builders and handoff transforms; defaults to the modes tentacle's. */
  v2Modes?: Partial<PlanOpsV2Modes>;
  now?: () => Date;
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
  const now = deps.now ?? (() => new Date());
  const v2: PlanOpsV2Modes = { ...defaultV2, ...deps.v2Modes };
  /** One harvest per repo at a time (repo open + a manual click can overlap). */
  const harvesting = new Set<string>();
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

    exportTentacle: async (
      repoPath: string,
      tentacleId: string,
      tasks: readonly string[],
      heading?: string,
    ) => {
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
          ...(heading ? { heading } : {}),
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

    // ---------------- v2 ----------------

    /** Tentacle cards + drift badges + history (D21–D24, D42). Each part degrades on its own. */
    requestOverview: async (repoPath: string, reply: (event: ServerEvent) => void) => {
      const path = resolve(repoPath);
      const store = deps.storeFor(path);
      const warn = (what: string) => (error: unknown) => {
        fail(`Could not read ${what}: ${errorText(error)}`);
        return null;
      };
      const workspace = deps.integrations
        ? await deps.integrations.resolveWorkspace(path).catch(() => path)
        : path;
      const tentacles = deps.integrations
        ? ((await deps.integrations.tentacleSummaries(path).catch(warn("tentacles"))) ?? [])
        : [];
      const snapshot = await store.snapshot().catch(warn("docs/plan"));
      const drift =
        deps.integrations && snapshot
          ? ((await deps.integrations
              .computeDrift(path, snapshot.decisions, snapshot.harvest ?? [])
              .catch(warn("decision drift"))) ?? [])
          : [];
      const history = (await store.readHistory().catch(warn("history"))) ?? [];
      reply({
        type: "overview",
        overview: { repoPath: path, workspace, tentacles, drift, history },
      });
    },

    /**
     * D17/D31: read commits and todos since the last mark, ask Claude for candidate
     * decisions, store them as pending H-records. `auto` runs (repo open) stay silent
     * when there's nothing new.
     */
    runHarvest: async (repoPath: string, options: { auto?: boolean } = {}) => {
      const path = resolve(repoPath);
      const job = (state: "running" | "done" | "failed", message: string) =>
        broadcast({ type: "plan-job", repoPath: path, job: "harvest", state, message });
      if (!deps.integrations || !deps.headless) {
        if (!options.auto) fail(NO_HARVEST_MESSAGE);
        return;
      }
      if (harvesting.has(path)) return;
      harvesting.add(path);
      try {
        const store = deps.storeFor(path);
        const mark = await store.harvestMark();
        const inputs = await deps.integrations.readHarvestInputs(path, mark);
        if (!inputs.headSha || (inputs.commits.length === 0 && (options.auto || mark))) {
          if (!options.auto) notice("Harvest: no new commits since the last harvest.");
          return;
        }
        job("running", `Reading ${inputs.commits.length} commits for new decisions…`);
        const { decisions, harvest = [] } = await store.snapshot();
        const prompt = v2.buildHarvestPrompt({
          inputs,
          decisions,
          knownTitles: harvest.map((h) => h.title),
        });
        const proposed = await deps.headless.harvest({ repoPath: path, prompt });
        const added = await store.addHarvest(proposed.slice(0, MAX_HARVEST_PER_RUN));
        await store.setHarvestMark(inputs.headSha);
        job(
          "done",
          added.length === 0
            ? "Harvest: nothing new to decide."
            : `Harvest: ${added.length} candidate decision${added.length === 1 ? "" : "s"} to review.`,
        );
      } catch (error) {
        job("failed", `Harvest failed: ${errorText(error)}`);
      } finally {
        harvesting.delete(path);
      }
    },

    resolveHarvest: async (repoPath: string, harvestId: string, action: "accept" | "reject") => {
      try {
        const { decision } = await deps.storeFor(repoPath).resolveHarvest(harvestId, action);
        notice(
          action === "accept"
            ? `Accepted ${harvestId}${decision ? ` as ${decision.id}` : ""}`
            : `Rejected ${harvestId}`,
        );
      } catch (error) {
        fail(`Could not ${action} ${harvestId}: ${errorText(error)}`);
      }
    },

    sendConventions: async (reply: (event: ServerEvent) => void) => {
      if (!deps.conventions) return;
      try {
        reply({ type: "conventions", conventions: await deps.conventions.list() });
      } catch (error) {
        fail(`Could not read ~/.octoplan/CONVENTIONS.md: ${errorText(error)}`);
      }
    },

    addConvention: async (title: string, body: string) => {
      if (!deps.conventions) return fail(NO_CONVENTIONS_MESSAGE);
      try {
        const convention = await deps.conventions.add({ title, body });
        broadcast({ type: "conventions", conventions: await deps.conventions.list() });
        notice(`Saved convention ${convention.id}`);
      } catch (error) {
        fail(`Could not save the convention: ${errorText(error)}`);
      }
    },

    removeConvention: async (conventionId: string) => {
      if (!deps.conventions) return fail(NO_CONVENTIONS_MESSAGE);
      try {
        await deps.conventions.remove(conventionId);
        broadcast({ type: "conventions", conventions: await deps.conventions.list() });
      } catch (error) {
        fail(`Could not remove ${conventionId}: ${errorText(error)}`);
      }
    },

    /** D44/D45: Claude proposes tentacles (fallback: one per stage); saved as a draft. */
    generateHandoff: async (repoPath: string, heading?: string) => {
      const path = resolve(repoPath);
      const job = (state: "running" | "done" | "failed", message: string) =>
        broadcast({ type: "plan-job", repoPath: path, job: "handoff-generate", state, message });
      if (!deps.integrations) return fail(NO_INTEGRATIONS_MESSAGE);
      try {
        const store = deps.storeFor(path);
        const snapshot = await store.snapshot();
        if (!snapshot.goal) return fail(NO_GOAL_HANDOFF_MESSAGE);
        job("running", "Claude is splitting the plan into tentacles…");
        const [stages, existing, workspace, repoTree] = await Promise.all([
          store.readStages(),
          deps.integrations.existingTentacles(path).catch(() => []),
          deps.integrations.resolveWorkspace(path),
          listRepoTree(path),
        ]);
        const chosenHeading =
          heading?.trim() || snapshot.handoff?.heading || snapshot.goal.title.trim() || "Plan";
        const input = { snapshot, stages, existing, repoTree, heading: chosenHeading };
        let source: HandoffPlan["source"] = "claude";
        let proposed: HandoffTentacle[] = [];
        if (deps.headless) {
          try {
            proposed = await deps.headless.proposeHandoff({
              repoPath: path,
              prompt: v2.buildHandoffPrompt(input),
            });
          } catch (error) {
            notice(`Claude couldn't propose tentacles (${errorText(error)}); using the stages.`);
          }
        }
        let tentacles = v2.normalizeHandoff(proposed, existing, snapshot.decisions);
        if (tentacles.length === 0) {
          source = "fallback";
          tentacles = v2.normalizeHandoff(v2.fallbackHandoff(input), existing, snapshot.decisions);
        }
        const draft: Omit<HandoffPlan, "octopusPrompt"> = {
          status: "draft",
          generatedAt: now().toISOString(),
          source,
          workspace,
          heading: chosenHeading,
          tentacles,
        };
        await store.writeHandoff({
          ...draft,
          octopusPrompt: v2.buildOctopusPrompt({
            plan: draft,
            goal: snapshot.goal,
            decisions: snapshot.decisions,
          }),
        });
        job("done", `Proposed ${tentacles.length} tentacle${tentacles.length === 1 ? "" : "s"}.`);
      } catch (error) {
        job("failed", `Could not generate the handoff: ${errorText(error)}`);
      }
    },

    /** Wizard edits: re-render the octopus prompt from the edited tentacles and save. */
    saveHandoff: async (repoPath: string, plan: HandoffPlan) => {
      try {
        const store = deps.storeFor(repoPath);
        const { goal, decisions } = await store.snapshot();
        const { octopusPrompt: _old, ...rest } = plan;
        const tentacles = v2.normalizeHandoff(
          plan.tentacles,
          deps.integrations
            ? await deps.integrations.existingTentacles(repoPath).catch(() => [])
            : [],
          decisions,
        );
        const draft = { ...rest, tentacles, status: "draft" as const };
        await store.writeHandoff({
          ...draft,
          octopusPrompt: v2.buildOctopusPrompt({ plan: draft, goal, decisions }),
        });
      } catch (error) {
        fail(`Could not save the handoff: ${errorText(error)}`);
      }
    },

    /** D44/D47/D48: write tentacles + todos into Octogent, then OCTOPUS.md. */
    applyHandoff: async (repoPath: string) => {
      const path = resolve(repoPath);
      const job = (state: "running" | "done" | "failed", message: string) =>
        broadcast({ type: "plan-job", repoPath: path, job: "handoff-apply", state, message });
      if (!deps.integrations) return fail(NO_INTEGRATIONS_MESSAGE);
      try {
        const store = deps.storeFor(path);
        const snapshot = await store.snapshot();
        const plan = snapshot.handoff ?? (await store.readHandoff());
        if (!plan) return fail("Generate a handoff first.");
        job("running", `Writing ${plan.tentacles.length} tentacles to ${plan.workspace}…`);
        const result = await deps.integrations.applyHandoff({
          repoPath: path,
          plan,
          goal: snapshot.goal,
          decisions: snapshot.decisions.filter((d) => d.status === "active"),
        });
        if (result.tentacles.some((t) => t.ok)) {
          await store.writeOctopusPrompt(plan.octopusPrompt);
          await store.writeHandoff({ ...plan, status: "applied", appliedAt: now().toISOString() });
        }
        broadcast({ type: "handoff-result", repoPath: path, result });
        job(result.ok ? "done" : "failed", result.message);
      } catch (error) {
        job("failed", `Could not apply the handoff: ${errorText(error)}`);
      }
    },
  };
};

export const NO_HARVEST_MESSAGE =
  "Harvest needs the Claude bridge and integrations; this server was started without them.";
export const NO_CONVENTIONS_MESSAGE = "This server was started without a conventions store.";
export const NO_GOAL_HANDOFF_MESSAGE =
  "Write GOAL.md first (finish a deep interview), then hand off to Octogent.";
export const MAX_HARVEST_PER_RUN = 5;

const TREE_SKIP = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".octogent",
  ".claude",
  ".next",
  ".turbo",
]);

/** Repo-relative folders two levels deep, for the handoff prompt's `owns` choices. */
export const listRepoTree = async (repoPath: string, depth = 2): Promise<string[]> => {
  const out: string[] = [];
  const walk = async (rel: string, level: number) => {
    let entries: Dirent[];
    try {
      entries = await readdir(join(repoPath, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || TREE_SKIP.has(entry.name) || entry.name.startsWith(".")) continue;
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      out.push(`${child}/`);
      if (level < depth && out.length < 300) await walk(child, level + 1);
    }
  };
  await walk("", 1);
  return out.sort();
};

export type PlanOps = ReturnType<typeof createPlanOps>;
