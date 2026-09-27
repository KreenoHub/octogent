import { readdir } from "node:fs/promises";
import {
  type ConversationBranch,
  type Idea,
  PLAN_FILES,
  type PlanSnapshot,
  STAGES_DIR,
  type Stage,
  stageFileName,
} from "@octogent/octoplan-protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFsPlanStore } from "../../server/store/fsPlanStore";
import type { PlanStore } from "../../server/store/types";
import { type TempRepo, makeTempRepo, waitFor } from "./helpers";

let repo: TempRepo;
let store: PlanStore;

beforeEach(async () => {
  repo = await makeTempRepo();
  store = createFsPlanStore(repo.repoPath, { onWarning: () => undefined });
});

afterEach(async () => {
  await store.dispose();
  await repo.cleanup();
});

const idea = (title: string): Omit<Idea, "id"> => ({
  title,
  date: "2026-09-27",
  tags: ["ux"],
  status: "inbox",
  body: "First thought.",
});

const stage = (index: number, prompt = `Build stage ${index}.`): Stage => ({
  index,
  title: `Stage title ${index}`,
  goal: `Goal ${index}.`,
  prompt,
});

const branch = (title: string): Omit<ConversationBranch, "id"> => ({
  title,
  sessionId: "s2",
  parentSessionId: "s1",
  forkedFromBlockId: "blk-4",
  status: "exploring",
  body: "Trying the other layout.",
});

describe("updateIdea", () => {
  it("replaces status, tags and body but keeps unknown keys and the preamble", async () => {
    await store.addIdea(idea("Dark mode"));
    const added = await store.addIdea(idea("Offline sync"));
    const text = await repo.read(PLAN_FILES.ideas.path);
    await repo.write(
      PLAN_FILES.ideas.path,
      text
        .replace("# Idea inbox", "# My ideas (hand edited)")
        .replace(
          "- status: inbox\n\nFirst thought.",
          "- status: inbox\n- owner: alex\n\nFirst thought.",
        ),
    );

    const updated = await store.updateIdea({
      ...added,
      status: "starred",
      tags: ["sync", "infra"],
      body: "Rewritten.",
    });
    expect(updated).toMatchObject({ id: "I2", status: "starred", tags: ["sync", "infra"] });

    const after = await repo.read(PLAN_FILES.ideas.path);
    expect(after).toContain("# My ideas (hand edited)");
    expect(after).toContain("- owner: alex");
    expect(after).toContain("- tags: sync, infra");
    expect(after).toContain("- status: starred");
    expect(after).toContain("Rewritten.");
    expect(after).toContain("## I1 — Dark mode");
    expect((await store.snapshot()).ideas.map((i) => i.status)).toEqual(["inbox", "starred"]);
  });

  it("throws on an unknown id and leaves the file alone", async () => {
    await store.addIdea(idea("Dark mode"));
    const before = await repo.read(PLAN_FILES.ideas.path);
    await expect(store.updateIdea({ ...idea("Ghost"), id: "I9" })).rejects.toThrow(/I9/);
    expect(await repo.read(PLAN_FILES.ideas.path)).toBe(before);
  });
});

describe("stages", () => {
  it("returns [] when there are no stage files", async () => {
    expect(await store.readStages()).toEqual([]);
  });

  it("round-trips stages sorted by index, prompts with backticks included", async () => {
    const stages = [stage(2, "Run:\n```sh\npnpm test\n```"), stage(1), stage(3)];
    await store.writeStages(stages);
    expect(await store.readStages()).toEqual([stage(1), stages[0], stage(3)]);
    expect(await repo.read(`${STAGES_DIR}/${stageFileName(1)}`)).toMatch(
      /^# Stage 1 — Stage title 1/,
    );
  });

  it("removes STAGE-n files beyond the new list and leaves other files alone", async () => {
    await store.writeStages([stage(1), stage(2), stage(3), stage(4)]);
    await repo.write(`${STAGES_DIR}/notes.md`, "# my notes\n");
    await repo.write(`${STAGES_DIR}/STAGE-draft.md`, "# not a stage file\n");

    await store.writeStages([stage(1, "Shorter plan.")]);
    expect(await store.readStages()).toEqual([stage(1, "Shorter plan.")]);
    const names = (await readdir(repo.planPath(STAGES_DIR))).sort();
    expect(names).toEqual(["STAGE-1.md", "STAGE-draft.md", "notes.md"]);
  });

  it("rejects duplicate indexes", async () => {
    await expect(store.writeStages([stage(1), stage(1)])).rejects.toThrow(/duplicate/);
  });

  it("fires onChange after a stage write", async () => {
    const events: PlanSnapshot[] = [];
    store.onChange((snapshot) => events.push(snapshot));
    await store.writeStages([stage(1)]);
    await waitFor(() => events.length > 0);
  });
});

describe("branches", () => {
  it("reads [] when branches.md is missing", async () => {
    expect(await store.readBranches()).toEqual([]);
  });

  it("allocates B<n> ids, updates in place and preserves hand edits", async () => {
    const first = await store.upsertBranch(branch("Card layout"));
    const second = await store.upsertBranch({ ...branch("List layout"), gitBranch: "feat/list" });
    expect([first.id, second.id]).toEqual(["B1", "B2"]);

    const text = await repo.read(PLAN_FILES.branches.path);
    expect(text.startsWith(PLAN_FILES.branches.preamble)).toBe(true);
    await repo.write(
      PLAN_FILES.branches.path,
      text.replace(
        "- status: exploring\n\nTrying",
        "- status: exploring\n- reviewer: yoni\n\nTrying",
      ),
    );

    const merged = await store.upsertBranch({ ...first, status: "merged" });
    expect(merged.id).toBe("B1");
    const branches = await store.readBranches();
    expect(branches.map((b) => [b.id, b.status, b.gitBranch])).toEqual([
      ["B1", "merged", undefined],
      ["B2", "exploring", "feat/list"],
    ]);
    expect(await repo.read(PLAN_FILES.branches.path)).toContain("- reviewer: yoni");
    expect((await store.upsertBranch(branch("Third"))).id).toBe("B3");
  });

  it("fires onChange after a branch write", async () => {
    const events: PlanSnapshot[] = [];
    store.onChange((snapshot) => events.push(snapshot));
    await store.upsertBranch(branch("Card layout"));
    await waitFor(() => events.length > 0);
  });
});
