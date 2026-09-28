// The real Octoplan v2 plan (docs/plan GOAL.md + DECISIONS.md, D1–D48), frozen as a fixture
// so stage and handoff tests run on a plan that was actually made in Octoplan.
import { readFileSync } from "node:fs";
import {
  type Decision,
  type GoalDoc,
  type PlanSnapshot,
  decisionCodec,
  parseGoalDoc,
  parseRecordDoc,
  readItems,
} from "@octogent/octoplan-protocol";

const read = (name: string) =>
  readFileSync(new URL(`./fixtures/v2-plan/${name}`, import.meta.url), "utf8");

export const loadV2Plan = (): { goal: GoalDoc; decisions: Decision[] } => ({
  goal: parseGoalDoc(read("GOAL.md")).goal,
  decisions: readItems(parseRecordDoc(read("DECISIONS.md")), decisionCodec),
});

export const v2Snapshot = (): PlanSnapshot => {
  const { goal, decisions } = loadV2Plan();
  return {
    decisions,
    gaps: [],
    risks: [],
    parked: [],
    ideas: [],
    coverage: { dimensions: [] },
    goal,
  };
};
