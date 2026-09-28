// Contract for the integrations tentacle (wave 2), seeded by the octopus.
import type { ConversationBranch, Decision, GitGraph, GoalDoc } from "@octogent/octoplan-protocol";

export type ExecResult = { code: number; stdout: string; stderr: string };

/**
 * Runs a process with an argument array (never a shell string). Tests inject a fake
 * with recorded git/gh/octogent output; production uses node:child_process execFile.
 */
export type Exec = (command: string, args: readonly string[], cwd: string) => Promise<ExecResult>;

export type ExportToTentacleInput = {
  repoPath: string;
  tentacleId: string;
  goal: GoalDoc | null;
  decisions: readonly Decision[];
  tasks: readonly string[];
};

export type ExportToTentacleResult = { ok: boolean; message: string };

export type Integrations = {
  /** Create/update an Octogent tentacle from the plan (needs Octogent running in that repo). */
  exportToTentacle(input: ExportToTentacleInput): Promise<ExportToTentacleResult>;
  /**
   * Git graph + branches (ahead/behind main) + tentacle lanes + PR/CI badges.
   * `gh` results are cached and re-fetched with backoff; missing gh degrades to ghAvailable=false.
   */
  buildGraph(
    repoPath: string,
    conversationBranches: readonly ConversationBranch[],
  ): Promise<GitGraph>;
};

export type IntegrationsDeps = {
  exec: Exec;
  now?: () => Date;
};

export type CreateIntegrations = (deps: IntegrationsDeps) => Integrations;
