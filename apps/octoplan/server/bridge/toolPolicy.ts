// Enforced only in canUseTool. Passing the mode allowlist as the SDK's `allowedTools`
// would auto-approve AskUserQuestion and skip Octoplan's interception entirely.
const toPattern = (glob: string) =>
  new RegExp(`^${glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);

export const isToolAllowed = (toolName: string, allowed: readonly string[]): boolean =>
  allowed.some((entry) => toPattern(entry).test(toolName));

export const PLANNING_DENY_MESSAGE =
  "This is an Octoplan planning session: only Read, Glob, Grep, AskUserQuestion and the octoplan plan tools are available. Record the idea as a decision, gap or risk instead of acting on it.";

/** Built-in tools Claude can see at all; everything else is absent, not just denied. */
export const PLANNING_BUILTIN_TOOLS = ["Read", "Glob", "Grep", "AskUserQuestion"];
