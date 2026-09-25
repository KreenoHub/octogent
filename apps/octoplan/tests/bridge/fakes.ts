import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  CanUseTool,
  Options,
  PermissionResult,
  SDKMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { ServerEvent } from "@octogent/octoplan-protocol";
import type { BridgeDeps, QueryFn } from "../../server/bridge/types";
import { applyCoverageUpdate, getMode } from "../../server/modes";
import { createFsPlanStore } from "../../server/store/fsPlanStore";

export type ScriptContext = {
  options: Options;
  /** Next user turn pushed into the session (kickoff, messages, revisions). */
  next: () => Promise<string | null>;
  askTool: (toolName: string, input: Record<string, unknown>) => Promise<PermissionResult>;
};

export type QueryCall = { options: Options; received: string[] };

/** A scripted stand-in for the Agent SDK's query(); unit tests never reach real Claude. */
export const createFakeQuery = (script: (ctx: ScriptContext) => AsyncGenerator<SDKMessage>) => {
  const calls: QueryCall[] = [];
  const query: QueryFn = ({ prompt, options }) => {
    const iterator = prompt[Symbol.asyncIterator]();
    const call: QueryCall = { options, received: [] };
    calls.push(call);
    const next = async () => {
      const result = await iterator.next();
      if (result.done) return null;
      const message = result.value as SDKUserMessage;
      const text = typeof message.message.content === "string" ? message.message.content : "";
      call.received.push(text);
      return text;
    };
    const askTool = async (toolName: string, input: Record<string, unknown>) => {
      const canUseTool = options.canUseTool as CanUseTool;
      const decision = await canUseTool(toolName, input, {
        signal: new AbortController().signal,
      } as Parameters<CanUseTool>[2]);
      // The SDK allows null ("no decision"); the bridge must always decide.
      if (!decision) throw new Error(`canUseTool returned no decision for ${toolName}`);
      return decision;
    };
    return script({ options, next, askTool });
  };
  return { query, calls };
};

export const init = (sessionId: string) =>
  ({ type: "system", subtype: "init", session_id: sessionId }) as unknown as SDKMessage;

export const assistantText = (text: string) =>
  ({
    type: "assistant",
    message: { content: [{ type: "text", text }] },
  }) as unknown as SDKMessage;

export const assistantToolUse = (name: string, input: Record<string, unknown>) =>
  ({
    type: "assistant",
    message: { content: [{ type: "tool_use", id: "tu1", name, input }] },
  }) as unknown as SDKMessage;

export const result = (subtype = "success") =>
  ({ type: "result", subtype, result: "done", session_id: "x" }) as unknown as SDKMessage;

export const roundInput = {
  questions: [
    {
      question: "Who is this for?",
      header: "users",
      multiSelect: false,
      options: [
        { label: "Just me (Recommended)", description: "Simplest" },
        { label: "A small team", description: "Needs sharing" },
      ],
    },
    {
      question: "How big is v1?",
      header: "scope",
      multiSelect: false,
      options: [
        { label: "Tiny (Recommended)", description: "Ship fast" },
        { label: "Medium", description: "More features" },
      ],
    },
  ],
};

export const tempRepo = () => {
  const dir = mkdtempSync(join(tmpdir(), "octoplan-bridge-"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
};

export const realDeps = (query: QueryFn): BridgeDeps => ({
  query,
  storeFor: (repoPath) => createFsPlanStore(repoPath, { debounceMs: 20 }),
  getMode,
  applyCoverageUpdate,
  now: () => new Date("2026-09-25T10:00:00.000Z"),
});

export const eventLog = () => {
  const events: ServerEvent[] = [];
  const waitFor = async <T extends ServerEvent>(
    predicate: (event: ServerEvent) => event is T,
    timeoutMs = 4000,
  ): Promise<T> => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const found = events.find(predicate);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`Timed out waiting for event; saw: ${events.map((e) => e.type).join(", ")}`);
  };
  return { events, broadcast: (event: ServerEvent) => events.push(event), waitFor };
};

export const until = async (check: () => boolean | Promise<boolean>, timeoutMs = 4000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("Timed out waiting for condition");
};
