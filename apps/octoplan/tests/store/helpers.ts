import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PLAN_DIR } from "@octogent/octoplan-protocol";

// Every store test works in a throwaway repo under the OS temp dir, never in this repo's docs.
export const makeTempRepo = async () => {
  const repoPath = await mkdtemp(join(tmpdir(), "octoplan-store-"));
  const planPath = (rel: string) => join(repoPath, PLAN_DIR, rel);
  return {
    repoPath,
    planPath,
    read: (rel: string) => readFile(planPath(rel), "utf8"),
    write: async (rel: string, text: string) => {
      await mkdir(dirname(planPath(rel)), { recursive: true });
      await writeFile(planPath(rel), text, "utf8");
    },
    cleanup: () => rm(repoPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
  };
};

export type TempRepo = Awaited<ReturnType<typeof makeTempRepo>>;

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const waitFor = async (check: () => boolean, timeoutMs = 2000, stepMs = 20) => {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error(`waitFor timed out after ${timeoutMs}ms`);
    await delay(stepMs);
  }
  return Date.now() - started;
};
