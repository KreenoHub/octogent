import { writeFile } from "node:fs/promises";
import { PLAN_FILES, type PlanSnapshot } from "@octogent/octoplan-protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFsPlanStore } from "../../server/store/fsPlanStore";
import type { PlanStore } from "../../server/store/types";
import { watchPlanDir } from "../../server/store/watcher";
import { type TempRepo, delay, makeTempRepo, waitFor } from "./helpers";

let repo: TempRepo;
let store: PlanStore | null = null;

beforeEach(async () => {
  repo = await makeTempRepo();
});

afterEach(async () => {
  await store?.dispose();
  store = null;
  await repo.cleanup();
});

const decisionsText = (title: string) =>
  `# Decisions\n\n<!-- op:id=D1 -->\n## D1 — ${title}\n- date: 2026-09-25\n- status: active\n`;

describe("watchPlanDir", () => {
  it("reports an external edit once, debounced, with the changed file", async () => {
    await repo.write(PLAN_FILES.decisions.path, decisionsText("First"));
    const batches: string[][] = [];
    const watcher = await watchPlanDir(repo.repoPath, (files) => batches.push(files));
    try {
      await delay(50);
      // Several quick writes collapse into one debounced batch.
      await writeFile(repo.planPath(PLAN_FILES.decisions.path), decisionsText("Second"));
      await writeFile(repo.planPath(PLAN_FILES.decisions.path), decisionsText("Third"));
      await waitFor(() => batches.length > 0);
      await delay(400);
      expect(batches).toEqual([[PLAN_FILES.decisions.path]]);
    } finally {
      watcher.close();
    }
  });

  it("reports files in sessions/ with forward-slash paths", async () => {
    await repo.write("sessions/.keep", "");
    const batches: string[][] = [];
    const watcher = await watchPlanDir(repo.repoPath, (files) => batches.push(files));
    try {
      await delay(50);
      await repo.write("sessions/2026-09-25-x.md", "# Session — x\n");
      await waitFor(() => batches.flat().includes("sessions/2026-09-25-x.md"));
    } finally {
      watcher.close();
    }
  });
});

describe("PlanStore.onChange", () => {
  it("delivers a hand edit of DECISIONS.md within 2 s", async () => {
    await repo.write(PLAN_FILES.decisions.path, decisionsText("First"));
    store = createFsPlanStore(repo.repoPath);
    const events: PlanSnapshot[] = [];
    store.onChange((snapshot) => events.push(snapshot));
    await delay(100);
    await writeFile(repo.planPath(PLAN_FILES.decisions.path), decisionsText("Edited by hand"));
    const elapsed = await waitFor(() => events.length > 0, 2000);
    expect(elapsed).toBeLessThan(2000);
    expect(events.at(-1)?.decisions[0]?.title).toBe("Edited by hand");
  });

  it("fires once for a store write and not again from the watcher", async () => {
    store = createFsPlanStore(repo.repoPath);
    const events: PlanSnapshot[] = [];
    const off = store.onChange((snapshot) => events.push(snapshot));
    await delay(100);
    await store.addRisk({
      title: "Echo",
      likelihood: "low",
      impact: "low",
      origin: "",
      status: "open",
      body: "",
    });
    await waitFor(() => events.length > 0);
    await delay(600);
    expect(events).toHaveLength(1);
    expect(events[0]?.risks.map((r) => r.id)).toEqual(["R1"]);
    off();
  });
});
