import type { Options, SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ServerEvent } from "@octogent/octoplan-protocol";
import type { ApplyCoverageUpdate, GetMode } from "../modes/types";
import type { PlanStoreFactory } from "../store/types";

/** The slice of the Agent SDK's `query` the bridge uses; tests inject a scripted fake. */
export type QueryFn = (params: {
  prompt: AsyncIterable<SDKUserMessage>;
  options: Options;
}) => AsyncIterable<SDKMessage>;

export type BridgeDeps = {
  query: QueryFn;
  storeFor: PlanStoreFactory;
  getMode: GetMode;
  applyCoverageUpdate: ApplyCoverageUpdate;
  now?: () => Date;
  newId?: () => string;
};

export type Broadcast = (event: ServerEvent) => void;
