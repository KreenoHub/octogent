// D61: find the Octogent that runs a workspace. Octogent's CLI registers each workspace under
// `~/.octogent/projects/<projectId>/` and, while it runs, writes `state/runtime.json` there with
// its real port (it walks up from 8787, so the port is never a safe guess). A crash can leave a
// stale runtime.json behind, so the pid must be alive and the API must answer as well.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { OctogentRunState } from "@octogent/octoplan-protocol";

export type OctogentRuntime = {
  apiBaseUrl: string;
  port: number;
  pid: number;
  workspaceCwd: string;
};

export type RuntimeProbe = {
  /** `~/.octogent`; tests and the e2e gate point it at a temp folder. */
  octogentHome: string;
  isPidAlive: (pid: number) => boolean;
  /** True when Octogent's API answers at this base URL. */
  apiAnswers: (apiBaseUrl: string) => Promise<boolean>;
};

export type RuntimeReading = {
  state: Exclude<OctogentRunState, "starting">;
  runtime?: OctogentRuntime;
};

/** The endpoint the Octogent CLI itself calls, so it exists in every version Octoplan targets. */
export const HEALTH_PATH = "/api/deck/tentacles";
const HEALTH_TIMEOUT_MS = 1500;

const readJson = async (path: string): Promise<unknown> => {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const projectConfigPath = (workspace: string): string =>
  join(workspace, ".octogent", "project.json");

/** The workspace's Octogent project id, or null when `octogent init` hasn't run there. */
export const readProjectId = async (workspace: string): Promise<string | null> => {
  const config = await readJson(projectConfigPath(workspace));
  return isRecord(config) && typeof config.projectId === "string" && config.projectId
    ? config.projectId
    : null;
};

export const runtimePath = (octogentHome: string, projectId: string): string =>
  join(octogentHome, "projects", projectId, "state", "runtime.json");

/** runtime.json in Octogent's own shape (apps/api/src/runtimeMetadata.ts), or null. */
export const parseRuntime = (value: unknown): OctogentRuntime | null => {
  if (
    !isRecord(value) ||
    typeof value.apiBaseUrl !== "string" ||
    typeof value.port !== "number" ||
    !Number.isInteger(value.port) ||
    typeof value.pid !== "number" ||
    !Number.isInteger(value.pid) ||
    typeof value.workspaceCwd !== "string"
  ) {
    return null;
  }
  return {
    apiBaseUrl: value.apiBaseUrl.replace(/\/+$/, ""),
    port: value.port,
    pid: value.pid,
    workspaceCwd: value.workspaceCwd,
  };
};

export const readOctogentRuntime = async (
  probe: RuntimeProbe,
  workspace: string,
): Promise<RuntimeReading> => {
  const projectId = await readProjectId(workspace);
  if (!projectId) return { state: "not-initialized" };
  const runtime = parseRuntime(await readJson(runtimePath(probe.octogentHome, projectId)));
  if (!runtime || !probe.isPidAlive(runtime.pid)) return { state: "not-running" };
  return (await probe.apiAnswers(runtime.apiBaseUrl))
    ? { state: "running", runtime }
    : { state: "not-responding", runtime };
};

export const isPidAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else; it's still alive.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};

export const createApiAnswers =
  (fetchFn: typeof fetch = fetch) =>
  async (apiBaseUrl: string): Promise<boolean> => {
    try {
      const response = await fetchFn(`${apiBaseUrl}${HEALTH_PATH}`, {
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      return response.ok;
    } catch {
      return false;
    }
  };
