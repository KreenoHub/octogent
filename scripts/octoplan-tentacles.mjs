#!/usr/bin/env node
// Keeps Octoplan's tentacle files in git. `.octogent/` is gitignored, so the
// committed copy lives in docs/octoplan/tentacles/<id>/ and this script syncs it.
//
//   node scripts/octoplan-tentacles.mjs push [--workspace <repo>]   docs -> .octogent
//   node scripts/octoplan-tentacles.mjs pull [--workspace <repo>]   .octogent -> docs
//
// --workspace is the checkout Octogent runs in (default: this repo). Tentacle
// folders must already exist (create them with `octogent tentacle create`), so
// Deck has their runtime metadata.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mirrorRoot = join(repoRoot, "docs", "octoplan", "tentacles");

// Octogent rewrites this block itself when suggested skills change; it is runtime
// state, so the mirror never stores it and push never clobbers it.
const MANAGED_BLOCK_RE =
  /\n*<!-- octogent:suggested-skills:start -->[\s\S]*?<!-- octogent:suggested-skills:end -->\n*/;

const args = process.argv.slice(2);
const command = args[0];
const workspaceFlag = args.indexOf("--workspace");
const workspace = resolve(workspaceFlag === -1 ? repoRoot : (args[workspaceFlag + 1] ?? repoRoot));
const liveRoot = join(workspace, ".octogent", "tentacles");

const normalize = (text) => text.replace(/\r\n/g, "\n");
const listDirs = (root) =>
  existsSync(root)
    ? readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];
const listMarkdown = (dir) => readdirSync(dir).filter((name) => name.endsWith(".md"));

const push = () => {
  let failed = false;
  for (const id of listDirs(mirrorRoot)) {
    const target = join(liveRoot, id);
    if (!existsSync(target)) {
      console.error(`  ✗ ${id}: missing ${target}. Run: octogent tentacle create ${id}`);
      failed = true;
      continue;
    }
    for (const file of listMarkdown(join(mirrorRoot, id))) {
      const source = normalize(readFileSync(join(mirrorRoot, id, file), "utf8"));
      const destPath = join(target, file);
      let next = source;
      if (file === "CONTEXT.md" && existsSync(destPath)) {
        const managed = normalize(readFileSync(destPath, "utf8")).match(MANAGED_BLOCK_RE);
        if (managed) next = `${source.trimEnd()}\n\n${managed[0].trim()}\n`;
      }
      writeFileSync(destPath, next);
    }
    console.log(`  ✓ ${id}: pushed ${listMarkdown(join(mirrorRoot, id)).join(", ")}`);
  }
  return failed ? 1 : 0;
};

const pull = () => {
  for (const id of listDirs(mirrorRoot)) {
    const source = join(liveRoot, id);
    if (!existsSync(source)) {
      console.warn(`  - ${id}: not in ${liveRoot}, skipped`);
      continue;
    }
    mkdirSync(join(mirrorRoot, id), { recursive: true });
    for (const file of listMarkdown(source)) {
      const destPath = join(mirrorRoot, id, file);
      if (file === "CONTEXT.md") {
        const text = normalize(readFileSync(join(source, file), "utf8")).replace(
          MANAGED_BLOCK_RE,
          "\n",
        );
        writeFileSync(destPath, `${text.trimEnd()}\n`);
      } else {
        copyFileSync(join(source, file), destPath);
      }
    }
    console.log(`  ✓ ${id}: pulled ${listMarkdown(source).join(", ")}`);
  }
  return 0;
};

if (command === "push") {
  console.log(`Pushing tentacle mirror -> ${liveRoot}`);
  process.exit(push());
} else if (command === "pull") {
  console.log(`Pulling ${liveRoot} -> docs/octoplan/tentacles`);
  process.exit(pull());
} else {
  console.error("Usage: node scripts/octoplan-tentacles.mjs <push|pull> [--workspace <repo>]");
  process.exit(1);
}
