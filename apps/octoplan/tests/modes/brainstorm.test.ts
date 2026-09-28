import type { Idea, IdeaAction } from "@octogent/octoplan-protocol";
import { describe, expect, it } from "vitest";
import { applyIdeaAction, buildConvergeTurn } from "../../server/modes";

type Status = Idea["status"];

const idea = (id: string, status: Status, title = `Idea ${id}`, body = `Body of ${id}.`): Idea => ({
  id,
  title,
  date: "2026-09-27",
  tags: [],
  status,
  body,
});

const STATUSES: Status[] = ["inbox", "starred", "merged", "killed", "parked", "adopted"];

// Expected result status for every (from, action) pair; null means the action is illegal.
const TABLE: Record<Exclude<IdeaAction, "merge">, Record<Status, Status | null>> = {
  star: {
    inbox: "starred",
    starred: null,
    merged: null,
    killed: null,
    parked: null,
    adopted: null,
  },
  park: {
    inbox: "parked",
    starred: "parked",
    merged: null,
    killed: null,
    parked: null,
    adopted: null,
  },
  kill: {
    inbox: "killed",
    starred: "killed",
    merged: null,
    killed: null,
    parked: null,
    adopted: null,
  },
  adopt: {
    inbox: "adopted",
    starred: "adopted",
    merged: null,
    killed: null,
    parked: null,
    adopted: null,
  },
  reopen: {
    inbox: null,
    starred: null,
    merged: null,
    killed: "inbox",
    parked: "inbox",
    adopted: null,
  },
};

describe("applyIdeaAction — transition table", () => {
  for (const [action, row] of Object.entries(TABLE) as [
    Exclude<IdeaAction, "merge">,
    Record<Status, Status | null>,
  ][]) {
    for (const from of STATUSES) {
      const to = row[from];
      it(`${action} from ${from} → ${to ?? "rejected"}`, () => {
        const before = idea("I1", from);
        const ideas = [before, idea("I2", "inbox")];
        const result = applyIdeaAction(ideas, "I1", action);
        if (to === null) {
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error).toMatch(/I1/);
            expect(result.error.length).toBeGreaterThan(10);
          }
        } else {
          expect(result).toEqual({ ok: true, changed: [{ ...before, status: to }] });
        }
        // Pure: inputs untouched.
        expect(ideas[0]).toEqual(idea("I1", from));
      });
    }
  }

  it("rejects an unknown idea id", () => {
    const result = applyIdeaAction([idea("I1", "inbox")], "I9", "star");
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/I9.*not found|No idea I9/) });
  });
});

describe("applyIdeaAction — merge", () => {
  const ideas = [
    idea("I1", "inbox", "Cheap cache", "Cache the feed."),
    idea("I2", "starred", "Edge cache", "Push it to the edge."),
    idea("I3", "killed"),
    idea("I4", "merged"),
    idea("I5", "parked"),
  ];

  it("folds the idea into the target, marks it merged and records both ids on the survivor", () => {
    const result = applyIdeaAction(ideas, "I1", "merge", "I2");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed).toHaveLength(2);
    const merged = result.changed.find((i) => i.id === "I1");
    const survivor = result.changed.find((i) => i.id === "I2");
    expect(merged?.status).toBe("merged");
    expect(merged?.body).toContain("I2");
    expect(survivor?.status).toBe("starred");
    expect(survivor?.body).toMatch(/^Push it to the edge\./);
    expect(survivor?.body).toContain("I1");
    expect(survivor?.body).toContain("I2");
    expect(survivor?.body).toContain("Cache the feed.");
    expect(ideas[1]?.body).toBe("Push it to the edge.");
  });

  it("can merge from starred into a parked idea", () => {
    const result = applyIdeaAction(ideas, "I2", "merge", "I5");
    expect(result.ok).toBe(true);
  });

  it.each([
    ["no target", "I1", undefined, /target|into/i],
    ["itself", "I1", "I1", /itself/i],
    ["a missing target", "I1", "I9", /I9/],
    ["a killed target", "I1", "I3", /killed/i],
    ["an already merged target", "I1", "I4", /merged/i],
    ["a killed source", "I3", "I1", /killed/i],
    ["a parked source", "I5", "I1", /parked/i],
  ])("rejects merging into %s", (_label, from, into, pattern) => {
    const result = applyIdeaAction(ideas, from, "merge", into);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(pattern);
  });
});

describe("buildConvergeTurn", () => {
  const ideas = [
    idea("I1", "starred", "Weekly digest email"),
    idea("I2", "inbox", "Push notifications"),
    idea("I3", "starred", "In-app inbox"),
    idea("I4", "parked", "SMS"),
    idea("I5", "killed", "Fax"),
  ];

  it("lists every starred idea by id and title and nothing else as a decision", () => {
    const text = buildConvergeTurn(ideas);
    expect(text).toContain("I1 — Weekly digest email");
    expect(text).toContain("I3 — In-app inbox");
    expect(text).toContain("mcp__octoplan__plan_record_decision");
    expect(text).not.toContain("I5 — Fax");
  });

  it("says what happens to the rest and ends with an AskUserQuestion round", () => {
    const text = buildConvergeTurn(ideas);
    expect(text).toMatch(/stay in the inbox/i);
    expect(text).toContain("I2");
    const lastParagraph = text.trim().split("\n\n").at(-1) ?? "";
    expect(lastParagraph).toContain("AskUserQuestion");
  });

  it("throws a clear error when nothing is starred", () => {
    expect(() => buildConvergeTurn([idea("I1", "inbox")])).toThrow(/no starred ideas/i);
    expect(() => buildConvergeTurn([])).toThrow(/star at least one/i);
  });
});
