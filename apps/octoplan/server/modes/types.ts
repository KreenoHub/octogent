// Contract between the modes tentacle and its consumers (bridge).
// Owned by the modes tentacle; seeded by the octopus so wave-1 workers can build
// in parallel. Change it only through the octopus.
import type {
  Confidence,
  CoverageDimensionId,
  CoverageState,
  CoverageStatus,
  ModeId,
} from "@octogent/octoplan-protocol";

export type ModeDefinition = {
  id: ModeId;
  label: string;
  /** Appended to Claude Code's preset system prompt for every session in this mode. */
  systemPromptAppend: string;
  /** Tool names Claude may use; `mcp__octoplan__*` style wildcards allowed. Everything else is denied. */
  allowedTools: string[];
  dimensions: CoverageDimensionId[];
  /** Max questions per AskUserQuestion round (1–4). */
  roundSize: number;
  /** True when the session has reached its natural end. The user can always stop earlier. */
  stopRule: (coverage: CoverageState, answeredCount: number) => boolean;
  /** First user turn that starts the session. */
  buildKickoffPrompt: (topic: string) => string;
};

/** Payload of the `plan_update_coverage` tool, applied by the coverage engine. */
export type CoverageUpdate = {
  id: CoverageDimensionId;
  status?: CoverageStatus;
  confidence?: Confidence;
  note?: string;
  questionIds?: string[];
  /** Status only moves forward (unknown → partial → covered) unless this is true. */
  regress?: boolean;
};

export type ApplyCoverageUpdate = (state: CoverageState, update: CoverageUpdate) => CoverageState;

export type GetMode = (id: ModeId) => ModeDefinition;
