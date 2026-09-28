import type { Options, SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { HandoffTentacle, ServerEvent } from "@octogent/octoplan-protocol";
import type { Integrations } from "../integrations/types";
import type { ApplyCoverageUpdate, GetMode } from "../modes/types";
import type { IngestReport } from "../modes/ingest";
import type { BuildConvergeTurn } from "../modes/wave2Types";
import type {
  ConventionsStore,
  HarvestCandidateInput,
  IdeaRegistry,
  PlanStoreFactory,
  TranscriptStore,
} from "../store/types";

/** The slice of the Agent SDK's `query` the bridge uses; tests inject a scripted fake. */
export type QueryFn = (params: {
  prompt: AsyncIterable<SDKUserMessage>;
  options: Options;
}) => AsyncIterable<SDKMessage>;

/** The slice of node-pty the pop-out terminal uses; tests inject a fake. */
export type PtyProcess = {
  onData(listener: (data: string) => void): void;
  onExit(listener: (event: { exitCode: number }) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
};

export type PtyFactory = (
  file: string,
  args: string[],
  options: { cwd: string; cols: number; rows: number; env: NodeJS.ProcessEnv },
) => PtyProcess;

export type BridgeDeps = {
  query: QueryFn;
  storeFor: PlanStoreFactory;
  getMode: GetMode;
  applyCoverageUpdate: ApplyCoverageUpdate;
  now?: () => Date;
  newId?: () => string;
  /** Wave 2: pop-out terminal (`claude --resume <id>` in a PTY). Absent = feature off. */
  spawnPty?: PtyFactory;
  /** Wave 2: brainstorm converge turn; defaults to the modes tentacle's buildConvergeTurn. */
  buildConvergeTurn?: BuildConvergeTurn;
  /** Wave 2: tentacle export + git graph. Absent = those requests get a clear error. */
  integrations?: Integrations;
  /** Wave 2: cross-project idea search. Absent = search covers only repos opened this run. */
  ideaRegistry?: IdeaRegistry;
} & BridgeV2Deps;

export type Broadcast = (event: ServerEvent) => void;

// ---- v2 ----

/** Extra deps for v2; all optional so v1 tests keep working. */
export type BridgeV2Deps = {
  /** D29: session transcripts; absent = sessions don't survive a restart. */
  transcripts?: TranscriptStore;
  /** D28: user conventions for the digest; absent = digest without conventions. */
  conventions?: ConventionsStore;
  /** D18: append the digest every N answered rounds (default 3; 0 = off). */
  recapEvery?: number;
};

/**
 * One short read-only Agent SDK query per call (D31, D45): planning lockdown (read tools
 * only, project settings only), a single octoplan MCP tool, bounded turns. Returns what
 * Claude passed to that tool; an empty result is not an error.
 */
export type HeadlessRunner = {
  harvest(input: { repoPath: string; prompt: string }): Promise<HarvestCandidateInput[]>;
  proposeHandoff(input: { repoPath: string; prompt: string }): Promise<HandoffTentacle[]>;
  /** v3 (D53): one read-only pass over the import sources; null when Claude reported nothing. */
  ingest(input: {
    repoPath: string;
    prompt: string;
    /** Extra folders (and extra files' folders) Claude may read besides repoPath. */
    additionalDirectories: string[];
  }): Promise<IngestReport | null>;
};

export type CreateHeadlessRunner = (deps: { query: QueryFn; maxTurns?: number }) => HeadlessRunner;
