import type { Options, SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ServerEvent } from "@octogent/octoplan-protocol";
import type { ApplyCoverageUpdate, GetMode } from "../modes/types";
import type { PlanStoreFactory } from "../store/types";

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
};

export type Broadcast = (event: ServerEvent) => void;
