import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildInventory, classify, renderInventory } from "../../server/ingest/inventory";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const tree = (files: Record<string, string>) => {
  const root = mkdtempSync(join(tmpdir(), "octoplan-inv-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(root, rel, ".."), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return root;
};

describe("import inventory (D53, G4, G5)", () => {
  it("skips .git, node_modules, lockfiles and binaries; lists unreadable docs as skipped (DOD12)", async () => {
    const root = tree({
      "README.md": "# Habit",
      "docs/SPEC.md": "spec",
      "package.json": "{}",
      "pnpm-lock.yaml": "lock",
      "src/index.ts": "code",
      "src/deep/a/b.ts": "code",
      ".git/config": "[core]",
      "node_modules/x/index.js": "dep",
      "dist/app.js": "built",
      "assets/logo.png": "png",
      "design.docx": "docx",
      "bin/tool.exe": "exe",
      "notes.txt": "notes",
    });
    const inventory = await buildInventory(root);
    const paths = inventory.entries.map((e) => e.path);
    expect(paths).toEqual([
      "notes.txt",
      "README.md",
      "docs/SPEC.md",
      "package.json",
      "src/index.ts",
      "src/deep/a/b.ts",
    ]);
    expect(inventory.entries.slice(0, 3).every((e) => e.kind === "doc")).toBe(true);
    expect(inventory.skipped.sort()).toEqual(["assets/logo.png", "design.docx"]);
    expect(paths.some((p) => /\.git|node_modules|dist|lock|\.exe/.test(p))).toBe(false);
  });

  it("applies the entry cap, docs first, and says how many were left off", async () => {
    const files: Record<string, string> = { "zz-plan.md": "plan" };
    for (let i = 0; i < 12; i += 1) files[`src/f${i}.ts`] = "x";
    const inventory = await buildInventory(tree(files), { maxEntries: 5 });
    expect(inventory.entries).toHaveLength(5);
    expect(inventory.entries[0]?.path).toBe("zz-plan.md");
    expect(inventory.total).toBe(13);
    expect(inventory.truncated).toBe(8);
    expect(renderInventory(inventory)).toContain("… and 8 more files not listed");
  });

  it("lists a single file, and an unreadable root as empty", async () => {
    const root = tree({ "idea.txt": "an idea" });
    const single = await buildInventory(join(root, "idea.txt"));
    expect(single.entries).toEqual([{ path: "idea.txt", size: 7, kind: "doc" }]);
    const missing = await buildInventory(join(root, "nope"));
    expect(missing.entries).toEqual([]);
    expect(renderInventory(missing)).toBe("(empty)");
  });

  it("classifies by name and extension", () => {
    expect(classify("README")).toBe("doc");
    expect(classify("spec.pdf")).toBe("doc");
    expect(classify("Cargo.toml")).toBe("manifest");
    expect(classify("Cargo.lock")).toBe("ignore");
    expect(classify("slides.pptx")).toBe("unreadable");
    expect(classify("main.rs")).toBe("code");
    expect(classify("data.csv")).toBe("other");
  });
});
