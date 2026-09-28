// Contract for the integrations tentacle (wave 2 + v2), seeded by the octopus.
import type {
  ConversationBranch,
  Decision,
  DecisionDrift,
  GitGraph,
  GoalDoc,
  HandoffPlan,
  HandoffResult,
  HarvestCandidate,
  OctogentStatus,
  TentacleSummary,
} from "@octogent/octoplan-protocol";
import type { RuntimeProbe } from "./octogentRuntime";
import type { TerminalLauncher } from "./terminalLauncher";

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
  /** v2 (D48): `## heading` the todos go under, created when missing; absent = append at the end. */
  heading?: string;
};

export type ExportToTentacleResult = { ok: boolean; message: string };

/** A tentacle already in the Octogent workspace (for reuse in a handoff, D33/D45). */
export type ExistingTentacle = {
  id: string;
  name: string;
  description: string;
  /** Backticked paths from CONTEXT.md's `## Owns` bullets. */
  owns: string[];
  todoDone: number;
  todoTotal: number;
};

/** What changed since the last harvest mark (D11, D31). */
export type HarvestInputs = {
  /** Newest commit sha across the scanned branches; the next harvest mark. Null = no git. */
  headSha: string | null;
  /** Commits after the mark on octogent/* branches and the current branch, newest first, max 50. */
  commits: Array<{ sha: string; branch: string; subject: string; body: string }>;
  /** Current checkbox state of every tentacle's todo.md. */
  todos: Array<{ tentacleId: string; done: string[]; open: string[] }>;
};

export type ApplyHandoffInput = {
  repoPath: string;
  plan: HandoffPlan;
  goal: GoalDoc | null;
  decisions: readonly Decision[];
};

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

  // ---- v2 ----
  /**
   * D48: the checkout Octogent runs in. For a linked git worktree that is the main worktree
   * when its `.octogent/` exists; otherwise `repoPath`. Never throws (no git = repoPath).
   */
  resolveWorkspace(repoPath: string): Promise<string>;
  /** D22: per-tentacle progress from `.octogent/tentacles/*\/todo.md` plus git/PR status. */
  tentacleSummaries(repoPath: string): Promise<TentacleSummary[]>;
  /** D26: untouched / implemented / diverged for every active decision. */
  computeDrift(
    repoPath: string,
    decisions: readonly Decision[],
    harvest: readonly HarvestCandidate[],
  ): Promise<DecisionDrift[]>;
  readHarvestInputs(repoPath: string, sinceSha: string | null): Promise<HarvestInputs>;
  /** Tentacles already in the workspace, for the handoff proposal. */
  existingTentacles(repoPath: string): Promise<ExistingTentacle[]>;
  /**
   * D44/D48: create missing tentacles (`octogent tentacle create`), write each CONTEXT.md's
   * octoplan-managed block (D36) and its todos under `## <plan.heading>` / `### <wave>` with
   * D-id stamps. Hand notes and Octogent's managed block are never touched.
   */
  applyHandoff(input: ApplyHandoffInput): Promise<HandoffResult>;

  // ---- v3 ----
  /** D61: Octogent's state for the repo's workspace, from its runtime.json. Never throws. */
  octogentStatus(repoPath: string): Promise<OctogentStatus>;
  /**
   * D58–D60: `octogent init` when needed, then a terminal running `octogent`. Returns `starting`
   * (poll octogentStatus), or the current status when it's already up or can't be launched.
   */
  launchOctogent(repoPath: string): Promise<OctogentStatus>;
};

export type IntegrationsDeps = {
  exec: Exec;
  now?: () => Date;
  /** Fixed Octogent URL (OCTOGENT_URL); overrides the one read from runtime.json (D61). */
  octogentUrl?: string;
  // v3: Run Octogent. Each defaults to the real thing; tests and the e2e gate inject fakes.
  /** `~/.octogent`, where Octogent keeps runtime.json per project. */
  octogentHome?: string;
  isPidAlive?: RuntimeProbe["isPidAlive"];
  apiAnswers?: RuntimeProbe["apiAnswers"];
  launcher?: TerminalLauncher;
  hasCommand?: (name: string) => boolean;
};

export type CreateIntegrations = (deps: IntegrationsDeps) => Integrations;
