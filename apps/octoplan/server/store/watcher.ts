import { type FSWatcher, watch } from "node:fs";
import { mkdir } from "node:fs/promises";
import { basename, join, sep } from "node:path";
import { PLAN_DIR, SESSIONS_DIR, STAGES_DIR } from "@octogent/octoplan-protocol";
import { KnownHashes, hashText, isTempFile, readTextOrNull } from "./fsIo";

export type PlanDirWatcher = { close(): void };

export type WatchPlanDirOptions = {
  /** Hashes of content Octoplan wrote itself; matching content is not reported. */
  hashes?: KnownHashes;
  debounceMs?: number;
};

/**
 * Watches `<repo>/docs/plan` (and its sessions/ and stages/ folders) for markdown edits made
 * outside Octoplan. Calls `onChange` with the changed paths, relative to docs/plan with forward
 * slashes, after a quiet period. Creates docs/plan if it doesn't exist so there is something
 * to watch.
 */
export const watchPlanDir = async (
  repoPath: string,
  onChange: (relPaths: string[]) => void,
  options: WatchPlanDirOptions = {},
): Promise<PlanDirWatcher> => {
  const planDir = join(repoPath, PLAN_DIR);
  const hashes = options.hashes ?? new KnownHashes();
  const debounceMs = options.debounceMs ?? 150;
  await mkdir(planDir, { recursive: true });

  const watchers: FSWatcher[] = [];
  const pending = new Set<string>();
  let timer: NodeJS.Timeout | null = null;
  let closed = false;

  const flush = async () => {
    timer = null;
    const candidates = [...pending];
    pending.clear();
    const changed: string[] = [];
    for (const rel of candidates) {
      const full = join(planDir, rel);
      const text = await readTextOrNull(full).catch(() => null);
      const hash = text === null ? undefined : hashText(text);
      if (hash === hashes.get(full)) continue;
      hashes.set(full, hash);
      changed.push(rel);
    }
    if (!closed && changed.length > 0) onChange(changed.sort());
  };

  const note = (rel: string | null) => {
    if (closed || !rel) return;
    const normalized = rel.split(sep).join("/");
    const name = basename(normalized);
    if (!name.endsWith(".md") || isTempFile(name)) return;
    pending.add(normalized);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), debounceMs);
  };

  const add = (dir: string, prefix: string, recursive: boolean) => {
    const watcher = watch(dir, { recursive }, (_event, filename) =>
      note(filename ? `${prefix}${filename.toString()}` : null),
    );
    watcher.on("error", () => undefined);
    watchers.push(watcher);
  };

  try {
    // Recursive watching is native on Windows and macOS, and supported on Linux since Node 20.
    add(planDir, "", true);
  } catch {
    add(planDir, "", false);
    for (const sub of [SESSIONS_DIR, STAGES_DIR]) {
      const dir = join(planDir, sub);
      await mkdir(dir, { recursive: true });
      add(dir, `${sub}/`, false);
    }
  }

  return {
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      for (const watcher of watchers) watcher.close();
    },
  };
};
