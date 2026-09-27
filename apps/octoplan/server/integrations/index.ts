// Integrations: Octogent tentacle export + git/GitHub branch graph (see types.ts for the contract).
import type { GitGraph } from "@octogent/octoplan-protocol";
import { readGit } from "./gitGraph";
import { createGithubReader } from "./github";
import { exportToTentacle } from "./octogentExport";
import type { CreateIntegrations } from "./types";

export type * from "./types";
export { createNodeExec, EXEC_TIMEOUT_MS } from "./exec";
export { START_OCTOGENT_MESSAGE } from "./octogentExport";

export const createIntegrations: CreateIntegrations = ({ exec, now }) => {
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
  };
};
