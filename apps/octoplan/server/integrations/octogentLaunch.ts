// D58–D61: "Run Octogent" for the handoff workspace. Status comes from Octogent's own runtime.json
// (octogentRuntime.ts); launch runs `octogent init` when the workspace has no project.json (D60,
// the handoff's `tentacle create` needs it), then opens a terminal (terminalLauncher.ts). A
// workspace that already has a live Octogent is never launched twice.
import type { OctogentStatus } from "@octogent/octoplan-protocol";
import { type RuntimeProbe, readOctogentRuntime } from "./octogentRuntime";
import type { TerminalLauncher } from "./terminalLauncher";
import type { Exec } from "./types";
import { resolveWorkspace } from "./workspace";

export type OctogentLaunchDeps = {
  exec: Exec;
  probe: RuntimeProbe;
  launcher: TerminalLauncher;
  hasCommand: (name: string) => boolean;
};

export const INSTALL_HINT =
  "The `octogent` CLI isn't on PATH. Install it (from the octogent repo: `pnpm install && pnpm build && npm install -g .`), then try again.";
export const TRUST_REMINDER =
  "In Octogent, the first Claude terminal may ask whether to trust this folder. Accept it, or that terminal's first prompt is lost.";

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const octogentStatus = async (
  deps: OctogentLaunchDeps,
  repoPath: string,
): Promise<OctogentStatus> => {
  const workspace = await resolveWorkspace(deps.exec, repoPath);
  const cliAvailable = deps.hasCommand("octogent");
  const reading = await readOctogentRuntime(deps.probe, workspace);
  const base = { repoPath, workspace, cliAvailable };
  switch (reading.state) {
    case "running":
      return {
        ...base,
        state: "running",
        url: reading.runtime?.apiBaseUrl,
        port: reading.runtime?.port,
        message: `Octogent is running on :${reading.runtime?.port}.`,
      };
    case "not-responding":
      return {
        ...base,
        state: "not-responding",
        url: reading.runtime?.apiBaseUrl,
        port: reading.runtime?.port,
        message: `Octogent's process is alive, but :${reading.runtime?.port} isn't answering yet. Check its terminal window.`,
      };
    case "not-initialized":
      return {
        ...base,
        state: "not-initialized",
        message: cliAvailable
          ? "Octogent hasn't been set up in this folder. Run Octogent sets it up first (`octogent init` creates .octogent/ and adds it to .gitignore)."
          : INSTALL_HINT,
      };
    case "not-running":
      return {
        ...base,
        state: "not-running",
        message: cliAvailable ? "Octogent isn't running for this folder." : INSTALL_HINT,
      };
  }
};

/**
 * Starts Octogent for `repoPath`'s workspace unless it's already up. Returns `starting` once the
 * terminal is open; the caller polls `octogentStatus` until `running`.
 */
export const launchOctogent = async (
  deps: OctogentLaunchDeps,
  repoPath: string,
): Promise<OctogentStatus> => {
  const status = await octogentStatus(deps, repoPath);
  // Alive but slow still counts: a second instance would fight over the same project.
  if (status.state === "running" || status.state === "not-responding") return status;
  if (!status.cliAvailable) return status;

  const { workspace } = status;
  if (status.state === "not-initialized") {
    try {
      const init = await deps.exec("octogent", ["init"], workspace);
      if (init.code !== 0) {
        const detail = (init.stderr.trim() || init.stdout.trim()).split(/\r?\n/)[0] ?? "";
        return { ...status, message: `\`octogent init\` failed: ${detail || `exit ${init.code}`}` };
      }
    } catch (error) {
      return { ...status, message: `\`octogent init\` failed: ${errorText(error)}` };
    }
  }

  const launched = await deps.launcher.launch(workspace);
  if (!launched.ok) {
    return {
      ...status,
      state: "not-running",
      message: launched.message,
      manualCommand: deps.launcher.manualCommand(workspace),
    };
  }
  return { ...status, state: "starting", message: `${launched.message} Waiting for it to start…` };
};
