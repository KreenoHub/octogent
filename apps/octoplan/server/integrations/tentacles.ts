// Read `.octogent/tentacles/*/` straight from disk (D22): no Octogent API, so it works while
// Octogent is down. Deck's rules: first `# Heading` = name, first paragraph = description,
// only `- [ ] ` / `- [x] ` lines of todo.md count.
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { readIfExists } from "./octogentExport";
import type { ExistingTentacle } from "./types";

const TODO_LINE = /^- \[([ xX])\] (.*)$/;

export type TentacleOnDisk = ExistingTentacle & {
  done: string[];
  open: string[];
  /** Unix seconds of todo.md's mtime, when it exists. */
  todoMtime?: number;
};

export const parseContext = (
  id: string,
  context: string | null,
): { name: string; description: string; owns: string[] } => {
  const lines = (context ?? "").split(/\r?\n/);
  const headingAt = lines.findIndex((line) => /^# \S/.test(line));
  const name = headingAt === -1 ? id : (lines[headingAt] as string).slice(2).trim() || id;

  const paragraph: string[] = [];
  for (let i = headingAt + 1; i < lines.length; i += 1) {
    const line = (lines[i] as string).trim();
    if (/^#{1,6}\s|^<!--/.test(line)) break;
    if (!line) {
      if (paragraph.length > 0) break;
      continue;
    }
    paragraph.push(line);
  }

  // `## Owns` (hand-written) or `### Owns` (inside the octoplan block): backticked paths.
  const owns: string[] = [];
  let inOwns = false;
  for (const line of lines) {
    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    if (heading) {
      inOwns = /^owns\b/i.test((heading[2] as string).trim());
      continue;
    }
    if (!inOwns || !/^\s*[-*]\s/.test(line)) continue;
    for (const match of line.matchAll(/`([^`]+)`/g)) {
      const path = (match[1] as string).trim();
      if (path && !owns.includes(path)) owns.push(path);
    }
  }
  return { name, description: paragraph.join(" "), owns };
};

export const parseTodos = (todo: string | null): { done: string[]; open: string[] } => {
  const done: string[] = [];
  const open: string[] = [];
  for (const line of (todo ?? "").split(/\r?\n/)) {
    const match = TODO_LINE.exec(line.trim());
    if (!match) continue;
    (match[1] === " " ? open : done).push((match[2] as string).trim());
  }
  return { done, open };
};

/** Every tentacle folder under `<workspace>/.octogent/tentacles`, sorted by id. */
export const readTentacles = async (workspace: string): Promise<TentacleOnDisk[]> => {
  const root = join(workspace, ".octogent", "tentacles");
  let entries: string[];
  try {
    entries = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
  return Promise.all(
    entries.map(async (id): Promise<TentacleOnDisk> => {
      const dir = join(root, id);
      const context = parseContext(id, await readIfExists(join(dir, "CONTEXT.md")));
      const todoFile = join(dir, "todo.md");
      const todos = parseTodos(await readIfExists(todoFile));
      const mtime = await stat(todoFile).then(
        (s) => Math.floor(s.mtimeMs / 1000),
        () => undefined,
      );
      return {
        id,
        ...context,
        todoDone: todos.done.length,
        todoTotal: todos.done.length + todos.open.length,
        ...todos,
        ...(mtime !== undefined ? { todoMtime: mtime } : {}),
      };
    }),
  );
};
