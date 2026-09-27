import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Idea } from "@octogent/octoplan-protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFsPlanStore } from "../../server/store/fsPlanStore";
import { createIdeaRegistry } from "../../server/store/ideaRegistry";
import type { PlanStore } from "../../server/store/types";
import { type TempRepo, makeTempRepo } from "./helpers";

// Every registry test uses a throwaway homeDir, never the real ~/.octoplan.
let homeDir: string;
let repos: TempRepo[];

beforeEach(async () => {
  homeDir = await mkdtemp(join(tmpdir(), "octoplan-home-"));
  repos = [];
});

afterEach(async () => {
  await Promise.all(repos.map((r) => r.cleanup()));
  await rm(homeDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

const idea = (title: string, tags: string[], body: string): Omit<Idea, "id"> => ({
  title,
  date: "2026-09-27",
  tags,
  status: "inbox",
  body,
});

const repoWithIdeas = async (ideas: Omit<Idea, "id">[]) => {
  const repo = await makeTempRepo();
  repos.push(repo);
  const store = createFsPlanStore(repo.repoPath, { onWarning: () => undefined });
  for (const item of ideas) await store.addIdea(item);
  await store.dispose();
  return repo;
};

const projectsFile = () => join(homeDir, ".octoplan", "projects.json");
const registered = async () =>
  (JSON.parse(await readFile(projectsFile(), "utf8")) as { repos: string[] }).repos;

describe("createIdeaRegistry", () => {
  it("creates ~/.octoplan/projects.json and dedupes paths", async () => {
    const a = await repoWithIdeas([]);
    const registry = createIdeaRegistry({ homeDir });
    await registry.registerRepo(a.repoPath);
    await registry.registerRepo(join(a.repoPath, "."));
    if (process.platform === "win32") await registry.registerRepo(a.repoPath.toUpperCase());
    expect(await registered()).toEqual([a.repoPath]);
  });

  it("keeps concurrent registrations", async () => {
    const all = await Promise.all([1, 2, 3, 4].map(() => repoWithIdeas([])));
    const registry = createIdeaRegistry({ homeDir });
    await Promise.all(all.map((r) => registry.registerRepo(r.repoPath)));
    expect((await registered()).sort()).toEqual(all.map((r) => r.repoPath).sort());
  });

  it("searches ideas across repos on title, tags and body, case-insensitively", async () => {
    const a = await repoWithIdeas([
      idea("Dark mode", ["ui"], "Follow the OS theme."),
      idea("Export to PDF", ["reports"], "One page per stage."),
    ]);
    const b = await repoWithIdeas([
      idea("Keyboard shortcuts", ["UI", "a11y"], "Vim keys."),
      idea("Sync over LAN", ["infra"], "No cloud; dark launch first."),
    ]);
    const registry = createIdeaRegistry({ homeDir });
    await registry.registerRepo(a.repoPath);
    await registry.registerRepo(b.repoPath);

    const titles = async (query: string) =>
      (await registry.searchIdeas(query)).map(
        (r) => `${r.repoPath === a.repoPath ? "a" : "b"}:${r.idea.title}`,
      );

    expect(await titles("DARK")).toEqual(["a:Dark mode", "b:Sync over LAN"]);
    expect(await titles("ui")).toEqual(["a:Dark mode", "b:Keyboard shortcuts"]);
    expect(await titles("per stage")).toEqual(["a:Export to PDF"]);
    expect(await titles("nothing-matches")).toEqual([]);
    expect(await titles("  ")).toHaveLength(4);

    const [hit] = await registry.searchIdeas("vim");
    expect(hit?.idea).toMatchObject({ id: "I1", tags: ["UI", "a11y"], status: "inbox" });
  });

  it("survives a deleted repo and a broken one", async () => {
    const a = await repoWithIdeas([idea("Dark mode", ["ui"], "")]);
    const b = await repoWithIdeas([idea("Dark roast", ["coffee"], "")]);
    const c = await repoWithIdeas([]);
    await c.write(
      "IDEAS.md",
      "# Idea inbox\n\n<!-- op:id=I1 -->\n## I1 — Broken\n- status: nonsense\n",
    );
    const registry = createIdeaRegistry({ homeDir });
    for (const r of [a, b, c]) await registry.registerRepo(r.repoPath);

    await b.cleanup();
    const results = await registry.searchIdeas("dark");
    expect(results.map((r) => [r.repoPath, r.idea.title])).toEqual([[a.repoPath, "Dark mode"]]);
    expect(await registered()).toHaveLength(3);
  });

  it("returns [] with no projects file and tolerates a corrupt one", async () => {
    const registry = createIdeaRegistry({ homeDir });
    expect(await registry.searchIdeas("")).toEqual([]);
    const a = await repoWithIdeas([idea("Dark mode", [], "")]);
    await mkdir(join(homeDir, ".octoplan"), { recursive: true });
    await writeFile(projectsFile(), "{ not json", "utf8");
    expect(await registry.searchIdeas("")).toEqual([]);
    await registry.registerRepo(a.repoPath);
    expect(await registered()).toEqual([a.repoPath]);
  });

  it("reads through an injected store factory and never throws for one failing repo", async () => {
    const a = await repoWithIdeas([idea("Dark mode", [], "")]);
    const b = await repoWithIdeas([idea("Dark roast", [], "")]);
    const opened: string[] = [];
    const storeFor = (repoPath: string): PlanStore => {
      opened.push(repoPath);
      if (repoPath === b.repoPath) throw new Error("cannot open");
      return createFsPlanStore(repoPath, { onWarning: () => undefined });
    };
    const registry = createIdeaRegistry({ homeDir, storeFor });
    await registry.registerRepo(a.repoPath);
    await registry.registerRepo(b.repoPath);
    const results = await registry.searchIdeas("dark");
    expect(results.map((r) => r.repoPath)).toEqual([a.repoPath]);
    expect(opened).toEqual([a.repoPath, b.repoPath]);
  });
});
