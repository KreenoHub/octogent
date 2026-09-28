// Pure shaping of the conversation stream for v2: one-line prose digests (D15),
// grouped tool rows (D19) and the dock's "latest digest" line (R3).
import type { MessageBlock } from "@octogent/octoplan-protocol";
import { firstLine } from "./sessionView";

export type ToolBlock = Extract<MessageBlock, { kind: "tool" }>;
export type ProseBlock = Extract<MessageBlock, { kind: "section" }>;

/** A block as-is, or a run of consecutive tool calls shown as one summary row. */
export type StreamItem =
  | { kind: "block"; block: MessageBlock }
  | { kind: "tools"; id: string; tools: ToolBlock[] };

/** Consecutive tool blocks (nothing else between them) collapse into one group; one alone stays a row. */
export const groupStream = (blocks: readonly MessageBlock[]): StreamItem[] => {
  const items: StreamItem[] = [];
  for (const block of blocks) {
    const last = items.at(-1);
    if (block.kind === "tool" && last) {
      if (last.kind === "tools") {
        last.tools.push(block);
        continue;
      }
      if (last.block.kind === "tool") {
        items[items.length - 1] = { kind: "tools", id: last.block.id, tools: [last.block, block] };
        continue;
      }
    }
    items.push({ kind: "block", block });
  }
  return items;
};

type ToolPhrase = { verb: string; one: string; many: string };

const PHRASES: Record<string, ToolPhrase> = {
  Read: { verb: "read", one: "file", many: "files" },
  Grep: { verb: "searched", one: "pattern", many: "patterns" },
  Glob: { verb: "listed", one: "pattern", many: "patterns" },
  Edit: { verb: "edited", one: "file", many: "files" },
  MultiEdit: { verb: "edited", one: "file", many: "files" },
  Write: { verb: "wrote", one: "file", many: "files" },
  Bash: { verb: "ran", one: "command", many: "commands" },
  WebFetch: { verb: "fetched", one: "page", many: "pages" },
  WebSearch: { verb: "ran", one: "web search", many: "web searches" },
  plan_record_decision: { verb: "recorded", one: "decision", many: "decisions" },
  plan_add_gap: { verb: "added", one: "gap", many: "gaps" },
  plan_add_risk: { verb: "added", one: "risk", many: "risks" },
  plan_park: { verb: "parked", one: "item", many: "items" },
  plan_add_idea: { verb: "captured", one: "idea", many: "ideas" },
  plan_update_coverage: { verb: "updated", one: "coverage entry", many: "coverage entries" },
  plan_write_goal: { verb: "wrote", one: "goal", many: "goals" },
  plan_add_harvest: { verb: "proposed", one: "harvest candidate", many: "harvest candidates" },
  plan_propose_handoff: { verb: "proposed", one: "handoff", many: "handoffs" },
};

const OTHER: ToolPhrase = { verb: "used", one: "other tool", many: "other tools" };

/** "mcp__octoplan__plan_park" -> "plan_park". */
export const shortToolName = (name: string): string => name.replace(/^mcp__.+?__/, "");

/** "Read 4 files, recorded 3 decisions": one phrase per kind of call, in first-seen order. */
export const summarizeTools = (tools: readonly ToolBlock[]): string => {
  const counts = new Map<ToolPhrase, number>();
  for (const tool of tools) {
    const phrase = PHRASES[shortToolName(tool.name)] ?? OTHER;
    counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  }
  const text = [...counts]
    .map(([phrase, count]) => `${phrase.verb} ${count} ${count === 1 ? phrase.one : phrase.many}`)
    .join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** More than one non-empty line: worth folding to a one-line digest. */
export const isDigestable = (markdown: string): boolean =>
  markdown.split("\n").filter((line) => line.trim() !== "").length > 1;

/** The one line a prose section shows while folded: its heading, else its first line. */
export const digestTitle = (section: Pick<ProseBlock, "heading" | "markdown">): string =>
  section.heading.trim() || firstLine(section.markdown);

/** The latest prose section in a stream (what the dock quotes above the round, R3). */
export const latestProse = (blocks: readonly MessageBlock[]): ProseBlock | null => {
  for (let index = blocks.length - 1; index >= 0; index--) {
    const block = blocks[index];
    if (block?.kind === "section") return block;
  }
  return null;
};
