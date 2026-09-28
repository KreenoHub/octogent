// Integrations: Octogent tentacle export + git/GitHub branch graph (see types.ts for the contract).
import { homedir } from "node:os";
import { join } from "node:path";
import type { GitGraph } from "@octogent/octoplan-protocol";
import { applyHandoff } from "./applyHandoff";
import { computeDrift } from "./drift";
import { readGit } from "./gitGraph";
import { createGithubReader } from "./github";
import { readHarvestInputs } from "./harvest";
import { exportToTentacle } from "./octogentExport";
import { type OctogentLaunchDeps, launchOctogent, octogentStatus } from "./octogentLaunch";
import { createApiAnswers, isPidAlive } from "./octogentRuntime";
import { tentacleSummaries } from "./summaries";
import { createHasCommand, createTerminalLauncher } from "./terminalLauncher";
import { readTentacles } from "./tentacles";
import type { CreateIntegrations } from "./types";
import { resolveWorkspace } from "./workspace";

export type * from "./types";
export { createNodeExec, EXEC_TIMEOUT_MS } from "./exec";
export { INSTALL_HINT, TRUST_REMINDER } from "./octogentLaunch";
export { OCTOPLAN_END, OCTOPLAN_START, START_OCTOGENT_MESSAGE } from "./octogentExport";

export const createIntegrations: CreateIntegrations = (deps) => {
  const { exec, now, octogentUrl } = deps;
  const github = createGithubReader(now ? { exec, now } : { exec });
  const hasCommand = deps.hasCommand ?? createHasCommand(process.platform, process.env);
  const octogent: OctogentLaunchDeps = {
    exec,
    hasCommand,
    probe: {
      octogentHome: deps.octogentHome ?? join(homedir(), ".octogent"),
      isPidAlive: deps.isPidAlive ?? isPidAlive,
      apiAnswers: deps.apiAnswers ?? createApiAnswers(),
    },
    launcher: deps.launcher ?? createTerminalLauncher({ hasCommand }),
  };

  return {
    exportToTentacle: (input) => exportToTentacle(exec, input),

    buildGraph: async (repoPath, conversationBranches) => {
      const git = await readGit(exec, repoPath);
      const base: GitGraph = {
        repoPath,
        commits: git.commits,
        branches: git.branches,
        prs: [],
        lanes: git.lanes,
        conversationBranches: [...conversationBranches],
        ghAvailable: false,
      };
      if (git.error) {
        return { ...base, hint: `No git history here: ${git.error}` };
      }
      const gh = await github.read(repoPath);
      return {
        ...base,
        prs: gh.prs,
        ghAvailable: gh.ghAvailable,
        ...(gh.hint ? { hint: gh.hint } : {}),
      };
    },

    // ---- v2 ----
    resolveWorkspace: (repoPath) => resolveWorkspace(exec, repoPath),
    tentacleSummaries: (repoPath) => tentacleSummaries(exec, github, repoPath),
    computeDrift: (repoPath, decisions, harvest) =>
      computeDrift(exec, repoPath, decisions, harvest),
    readHarvestInputs: (repoPath, sinceSha) => readHarvestInputs(exec, repoPath, sinceSha),
    existingTentacles: async (repoPath) =>
      (await readTentacles(await resolveWorkspace(exec, repoPath))).map(
        ({ id, name, description, owns, todoDone, todoTotal }) => ({
          id,
          name,
          description,
          owns,
          todoDone,
          todoTotal,
        }),
      ),
    applyHandoff: (input) =>
      applyHandoff(exec, input, async () => {
        if (octogentUrl) return octogentUrl;
        const status = await octogentStatus(octogent, input.repoPath);
        return status.state === "running" ? status.url : undefined;
      }),

    // ---- v3 ----
    octogentStatus: (repoPath) => octogentStatus(octogent, repoPath),
    launchOctogent: (repoPath) => launchOctogent(octogent, repoPath),
  };
};
