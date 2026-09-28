// Cross-project idea inbox (wave 2). ~/.octoplan/projects.json lists known repo paths only;
// the ideas themselves stay in each repo's docs/plan/IDEAS.md and are read on every search.
import { readFileSync, statSync } from "node:fs";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import type { Idea, IdeaSearchResult } from "@octogent/octoplan-protocol";
import { FileWriter, readTextOrNull } from "./fsIo";
import { createFsPlanStore } from "./fsPlanStore";
import type { IdeaRegistry, PlanStoreFactory } from "./types";

export type IdeaRegistryOptions = {
  /** Folder that holds `.octoplan/` (default: the user's home folder). */
  homeDir?: string;
  /**
   * Opens a repo's plan store for reading its ideas. When injected, the registry never
   * disposes the stores it gets (they may be shared); its own default stores are disposed.
   */
  storeFor?: PlanStoreFactory;
};

type ProjectsFile = { repos: string[] };

export const PROJECTS_FILE_NAME = "projects.json";

const samePath = (a: string, b: string) =>
  process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;

const trimSlashes = (path: string) => path.replace(/[\\/]+$/, "") || path;

const isDirectorySync = (path: string) => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

// A linked worktree's root holds a `.git` FILE: "gitdir: <main>/.git/worktrees/<name>".
const WORKTREE_GITDIR_RE = /^(.*)[\\/]\.git[\\/]worktrees[\\/][^\\/]+[\\/]?$/;

/**
 * A path inside a linked git worktree maps to the same place in its main checkout, so one
 * repo's sessions never split across two projects. Plain fs reads, no git process; anything
 * else (a normal checkout, a submodule, no repo) comes back unchanged.
 */
export const mainCheckoutOf = (path: string): string => {
  for (let dir = path; ; ) {
    const dotGit = join(dir, ".git");
    let isFile: boolean | null = null;
    try {
      isFile = statSync(dotGit).isFile();
    } catch {
      isFile = null;
    }
    if (isFile === false) return path;
    if (isFile) {
      let gitdir: string | undefined;
      try {
        gitdir = /^gitdir:\s*(.+?)\s*$/m.exec(readFileSync(dotGit, "utf8"))?.[1];
      } catch {
        return path;
      }
      const main = gitdir ? WORKTREE_GITDIR_RE.exec(resolve(dir, gitdir))?.[1] : undefined;
      if (!main || !isDirectorySync(main)) return path;
      const rel = relative(dir, path);
      return rel ? join(main, rel) : main;
    }
    const parent = dirname(dir);
    if (parent === dir) return path;
    dir = parent;
  }
};

const normalizeRepo = (repoPath: string) =>
  trimSlashes(mainCheckoutOf(trimSlashes(resolve(repoPath))));

/** Paths from projects.json; a missing or corrupt file reads as no repos. */
const parseProjects = (text: string | null): string[] => {
  if (text === null) return [];
  try {
    const data: unknown = JSON.parse(text);
    const list = Array.isArray(data)
      ? data
      : data && typeof data === "object" && Array.isArray((data as { repos?: unknown }).repos)
        ? (data as { repos: unknown[] }).repos
        : [];
    return dedupe(list.filter((p): p is string => typeof p === "string" && p.trim().length > 0));
  } catch {
    return [];
  }
};

const dedupe = (paths: readonly string[]) => {
  const out: string[] = [];
  for (const path of paths) {
    const normalized = normalizeRepo(path);
    if (!out.some((known) => samePath(known, normalized))) out.push(normalized);
  }
  return out;
};

const serializeProjects = (repos: string[]) =>
  `${JSON.stringify({ repos } satisfies ProjectsFile, null, 2)}\n`;

/** Every whitespace-separated term must appear in the title, a tag or the body. */
export const ideaMatches = (idea: Idea, query: string) => {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [idea.title, ...idea.tags, idea.body].join("\n").toLowerCase();
  return terms.every((term) => haystack.includes(term));
};

const isDirectory = async (path: string) => {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
};

export const createIdeaRegistry = (options: IdeaRegistryOptions = {}): IdeaRegistry => {
  const file = join(options.homeDir ?? homedir(), ".octoplan", PROJECTS_FILE_NAME);
  const writer = new FileWriter();
  const injected = options.storeFor;
  const storeFor: PlanStoreFactory =
    injected ?? ((repoPath) => createFsPlanStore(repoPath, { onWarning: () => undefined }));

  const readRepos = async () => parseProjects(await readTextOrNull(file).catch(() => null));

  const ideasOf = async (repoPath: string): Promise<Idea[]> => {
    const store = storeFor(repoPath);
    try {
      return (await store.snapshot()).ideas;
    } finally {
      if (!injected) await store.dispose();
    }
  };

  return {
    async registerRepo(repoPath: string) {
      const repo = normalizeRepo(repoPath);
      // FileWriter creates ~/.octoplan and serializes concurrent registrations.
      await writer.mutate(file, (current) => {
        const repos = parseProjects(current);
        if (repos.some((known) => samePath(known, repo))) {
          const text = serializeProjects(repos);
          return { text: current === text ? null : text, result: undefined };
        }
        return { text: serializeProjects([...repos, repo]), result: undefined };
      });
    },

    async searchIdeas(query: string) {
      const repos = await readRepos();
      const perRepo = await Promise.all(
        repos.map(async (repoPath): Promise<IdeaSearchResult[]> => {
          try {
            if (!(await isDirectory(repoPath))) return [];
            const ideas = await ideasOf(repoPath);
            return ideas
              .filter((idea) => ideaMatches(idea, query))
              .map((idea) => ({ repoPath, idea }));
          } catch (error) {
            console.warn(`[octoplan] idea search skipped ${repoPath}: ${String(error)}`);
            return [];
          }
        }),
      );
      return perRepo.flat();
    },
  };
};
