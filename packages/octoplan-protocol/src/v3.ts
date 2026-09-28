import { z } from "zod";

// ---------- Wave 6: Run Octogent (D58–D61) ----------

/**
 * Where Octogent stands for a repo's workspace (D48):
 * - not-initialized: no `.octogent/project.json` yet (launch runs `octogent init` first, D60)
 * - not-running: initialized, but no live runtime.json (never started, or it exited)
 * - starting: Octoplan opened a terminal and is waiting for runtime.json to appear
 * - running: runtime.json names a live process and its API answers
 * - not-responding: runtime.json names a live process, but its API doesn't answer
 */
export const octogentRunStateSchema = z.enum([
  "not-initialized",
  "not-running",
  "starting",
  "running",
  "not-responding",
]);
export type OctogentRunState = z.infer<typeof octogentRunStateSchema>;

export const octogentStatusSchema = z.object({
  /** The repo the client asked about (echoed back, so the UI can key by it). */
  repoPath: z.string(),
  /** The checkout Octogent runs in (D48). */
  workspace: z.string(),
  state: octogentRunStateSchema,
  /** Octogent's dashboard, from runtime.json's apiBaseUrl (D61). */
  url: z.string().optional(),
  port: z.number().int().optional(),
  /** False when `octogent` isn't on PATH; the UI shows how to install it instead of launching. */
  cliAvailable: z.boolean(),
  /** One line for the user: what's going on, or what went wrong. */
  message: z.string(),
  /** Shown with a copy button when Octoplan couldn't open a terminal itself (D59). */
  manualCommand: z.string().optional(),
});
export type OctogentStatus = z.infer<typeof octogentStatusSchema>;
