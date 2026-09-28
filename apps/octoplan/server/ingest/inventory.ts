// D53: what's in each import source, listed before Claude reads anything, so one read-only pass
// can start from the plans and docs instead of wandering a big tree. Dependencies, build output,
// lockfiles and binaries never make the list; documents Claude can't read (.docx, images; G4)
// are listed as skipped so the review can ask the user to paste their text.
import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

export type InventoryKind = "doc" | "manifest" | "code" | "other";

export type InventoryEntry = {
  /** Relative to the source root, with forward slashes. */
  path: string;
  size: number;
  kind: InventoryKind;
};

export type Inventory = {
  root: string;
  /** Listed entries: docs first, then manifests, code and the rest, shallow before deep. */
  entries: InventoryEntry[];
  /** Readable files found in total (before the cap). */
  total: number;
  /** Readable files left off the list by the cap. */
  truncated: number;
  /** Documents and images Claude can't read, relative to the root. */
  skipped: string[];
};

/** G5: a starting cap, to be tuned against real monorepos. */
export const DEFAULT_MAX_ENTRIES = 400;
const MAX_DEPTH = 12;

export const SKIP_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "bower_components",
  "vendor",
  "dist",
  "build",
  "out",
  "coverage",
  "target",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  ".venv",
  "venv",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".gradle",
  ".idea",
  ".vscode",
  ".octogent",
  "Pods",
  "DerivedData",
]);

export const LOCKFILES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "Cargo.lock",
  "poetry.lock",
  "Pipfile.lock",
  "composer.lock",
  "Gemfile.lock",
  "go.sum",
  "Podfile.lock",
]);

const DOC_EXT = new Set([".md", ".mdx", ".markdown", ".txt", ".rst", ".adoc", ".org", ".pdf"]);
/** Documents the SDK's Read can't open (G4): listed as skipped, never read. */
const UNREADABLE_DOC_EXT = new Set([
  ".docx",
  ".doc",
  ".pptx",
  ".ppt",
  ".xlsx",
  ".xls",
  ".odt",
  ".pages",
  ".key",
  ".numbers",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".heic",
]);
const BINARY_EXT = new Set([
  ".zip",
  ".gz",
  ".tgz",
  ".7z",
  ".rar",
  ".tar",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".o",
  ".a",
  ".class",
  ".jar",
  ".pyc",
  ".wasm",
  ".mp3",
  ".mp4",
  ".mov",
  ".wav",
  ".avi",
  ".ico",
  ".icns",
  ".ttf",
  ".otf",
  ".woff",
  ".woff2",
  ".eot",
  ".sqlite",
  ".db",
  ".map",
]);
const MANIFESTS = new Set([
  "package.json",
  "pyproject.toml",
  "setup.py",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
  "Gemfile",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "composer.json",
  "Package.swift",
  "Podfile",
  "Makefile",
  "Dockerfile",
  "docker-compose.yml",
  "tsconfig.json",
  "deno.json",
]);
const CODE_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".swift",
  ".m",
  ".c",
  ".h",
  ".cc",
  ".cpp",
  ".hpp",
  ".cs",
  ".php",
  ".scala",
  ".sh",
  ".ps1",
  ".sql",
  ".vue",
  ".svelte",
  ".css",
  ".scss",
  ".html",
  ".dart",
  ".lua",
  ".ex",
  ".exs",
]);

type Classified = InventoryKind | "unreadable" | "ignore";

export const classify = (name: string): Classified => {
  if (LOCKFILES.has(name)) return "ignore";
  if (MANIFESTS.has(name)) return "manifest";
  const ext = path.extname(name).toLowerCase();
  if (/^readme/i.test(name) || DOC_EXT.has(ext)) return "doc";
  if (UNREADABLE_DOC_EXT.has(ext)) return "unreadable";
  if (BINARY_EXT.has(ext)) return "ignore";
  if (CODE_EXT.has(ext)) return "code";
  return "other";
};

const KIND_ORDER: Record<InventoryKind, number> = { doc: 0, manifest: 1, code: 2, other: 3 };
const depth = (rel: string) => rel.split("/").length;

/** Lists `root`, a folder or a single file. Never throws: an unreadable root lists as empty. */
export const buildInventory = async (
  root: string,
  options: { maxEntries?: number } = {},
): Promise<Inventory> => {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const found: InventoryEntry[] = [];
  const skipped: string[] = [];

  const add = (rel: string, name: string, size: number) => {
    const kind = classify(name);
    if (kind === "ignore") return;
    if (kind === "unreadable") skipped.push(rel);
    else found.push({ path: rel, size, kind });
  };

  const rootStat = await stat(root).catch(() => null);
  if (rootStat?.isFile()) {
    const name = path.basename(root);
    add(name, name, rootStat.size);
  } else if (rootStat?.isDirectory()) {
    const walk = async (dir: string, rel: string, level: number): Promise<void> => {
      if (level > MAX_DEPTH) return;
      let items: Dirent[];
      try {
        items = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      items.sort((a, b) => a.name.localeCompare(b.name));
      for (const item of items) {
        const childRel = rel ? `${rel}/${item.name}` : item.name;
        const full = path.join(dir, item.name);
        // Symlinks are skipped: they can loop or point outside what the user chose.
        if (item.isSymbolicLink()) continue;
        if (item.isDirectory()) {
          if (!SKIP_DIRS.has(item.name)) await walk(full, childRel, level + 1);
        } else if (item.isFile()) {
          const size = await stat(full)
            .then((s) => s.size)
            .catch(() => 0);
          add(childRel, item.name, size);
        }
      }
    };
    await walk(root, "", 0);
  }

  found.sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      depth(a.path) - depth(b.path) ||
      a.path.localeCompare(b.path),
  );
  return {
    root,
    entries: found.slice(0, maxEntries),
    total: found.length,
    truncated: Math.max(0, found.length - maxEntries),
    skipped,
  };
};

const humanSize = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** The inventory as prompt text: one `kind  size  path` line per entry. */
export const renderInventory = (inventory: Inventory): string => {
  const lines = inventory.entries.map(
    (entry) => `${entry.kind.padEnd(8)} ${humanSize(entry.size).padStart(7)}  ${entry.path}`,
  );
  if (inventory.truncated > 0) lines.push(`… and ${inventory.truncated} more files not listed`);
  if (inventory.skipped.length > 0) {
    lines.push(`Not readable (listed only): ${inventory.skipped.join(", ")}`);
  }
  return lines.length > 0 ? lines.join("\n") : "(empty)";
};
