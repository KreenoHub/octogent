// Integrations: Octogent tentacle export + git/GitHub branch graph (see types.ts for the contract).
import type { GitGraph } from "@octogent/octoplan-protocol";
import { applyHandoff } from "./applyHandoff";
import { computeDrift } from "./drift";
import { readGit } from "./gitGraph";
import { createGithubReader } from "./github";
import { readHarvestInputs } from "./harvest";
import { exportToTentacle } from "./octogentExport";
import { tentacleSummaries } from "./summaries";
import { readTentacles } from "./tentacles";
import type { CreateIntegrations } from "./types";
import { resolveWorkspace } from "./workspace";

export type * from "./types";
export { createNodeExec, EXEC_TIMEOUT_MS } from "./exec";
export { DEFAULT_DECK_URL } from "./applyHandoff";
export { OCTOPLAN_END, OCTOPLAN_START, START_OCTOGENT_MESSAGE } from "./octogentExport";

export const createIntegrations: CreateIntegrations = ({ exec, now, octogentUrl }) => {
  const github = createGithubReader(now ? { exec, now } : { exec });

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
    applyHandoff: (input) => applyHandoff(exec, input, octogentUrl),
  };
};
