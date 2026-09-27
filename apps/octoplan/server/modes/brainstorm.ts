// Brainstorm board logic (wave 2): pure idea transitions and the converge turn.
import type { Idea, IdeaAction } from "@octogent/octoplan-protocol";
import { PLAN_TOOLS } from "./prompts/shared";
import type { ApplyIdeaAction, BuildConvergeTurn } from "./wave2Types";

type IdeaStatus = Idea["status"];

/** Which statuses each action may start from, and where it lands. Merge lands on "merged". */
const TRANSITIONS: Record<IdeaAction, { from: readonly IdeaStatus[]; to: IdeaStatus }> = {
  star: { from: ["inbox"], to: "starred" },
  park: { from: ["inbox", "starred"], to: "parked" },
  kill: { from: ["inbox", "starred"], to: "killed" },
  adopt: { from: ["inbox", "starred"], to: "adopted" },
  merge: { from: ["inbox", "starred"], to: "merged" },
  reopen: { from: ["killed", "parked"], to: "inbox" },
};

const PAST: Record<IdeaAction, string> = {
  star: "starred",
  park: "parked",
  kill: "killed",
  adopt: "adopted",
  merge: "merged",
  reopen: "reopened",
};

const describe = (idea: Idea): string => `${idea.id} ("${idea.title}")`;

const fail = (error: string) => ({ ok: false as const, error });

const illegalFrom = (idea: Idea, action: IdeaAction): string => {
  const { from, to } = TRANSITIONS[action];
  if (idea.status === to) return `Can't ${action} ${describe(idea)}: it is already ${to}.`;
  return `Can't ${action} ${describe(idea)}: it is ${idea.status}, and only ${from.join(" or ")} ideas can be ${PAST[action]}.`;
};

export const applyIdeaAction: ApplyIdeaAction = (ideas, ideaId, action, intoId) => {
  const idea = ideas.find((candidate) => candidate.id === ideaId);
  if (!idea) return fail(`No idea ${ideaId} was found on the board.`);
  const rule = TRANSITIONS[action];
  if (!rule.from.includes(idea.status)) return fail(illegalFrom(idea, action));

  if (action !== "merge") return { ok: true, changed: [{ ...idea, status: rule.to }] };

  if (!intoId) return fail(`Pick an idea to merge ${describe(idea)} into.`);
  if (intoId === idea.id) return fail(`Can't merge ${describe(idea)} into itself.`);
  const target = ideas.find((candidate) => candidate.id === intoId);
  if (!target) return fail(`Can't merge ${describe(idea)}: no idea ${intoId} was found.`);
  if (target.status === "killed" || target.status === "merged") {
    return fail(
      `Can't merge ${describe(idea)} into ${describe(target)}: that idea is ${target.status}.`,
    );
  }

  const note = `Merged ${idea.id} into ${target.id}: ${idea.id} "${idea.title}"${idea.body.trim() ? ` — ${idea.body.trim()}` : ""}`;
  const append = (body: string, line: string) =>
    body.trim() ? `${body.trimEnd()}\n\n${line}` : line;
  return {
    ok: true,
    changed: [
      { ...idea, status: "merged", body: append(idea.body, `Merged into ${target.id}.`) },
      { ...target, body: append(target.body, note) },
    ],
  };
};

export const buildConvergeTurn: BuildConvergeTurn = (ideas) => {
  const starred = ideas.filter((idea) => idea.status === "starred");
  if (starred.length === 0) {
    throw new Error(
      "Can't converge: there are no starred ideas. Star at least one idea on the board first.",
    );
  }
  const inbox = ideas.filter((idea) => idea.status === "inbox");
  const parked = ideas.filter((idea) => idea.status === "parked");
  const list = (items: readonly Idea[]) =>
    items.map((idea) => `- ${idea.id} — ${idea.title}`).join("\n");

  const rest: string[] = [
    inbox.length > 0
      ? `Unstarred ideas stay in the inbox for a later round; don't record decisions for them: ${inbox.map((i) => i.id).join(", ")}.`
      : "Unstarred ideas stay in the inbox for a later round; there are none right now.",
  ];
  if (parked.length > 0) {
    rest.push(`Parked ideas stay parked: ${parked.map((i) => i.id).join(", ")}.`);
  }
  rest.push("Killed and merged ideas are closed; don't bring them back.");

  return `Converge the brainstorm on the ${starred.length === 1 ? "starred idea" : `${starred.length} starred ideas`}:

${list(starred)}

For each starred idea, call \`${PLAN_TOOLS.recordDecision}\` once: a \`title\` stating the decision (not the idea's name), and a \`body\` with the reasoning, the rough cost, and the idea id it came from. If one idea depends on another, put the earlier decision id in \`dependsOn\`.

${rest.join(" ")}

Then reply with a short \`## Converged\` section listing each new decision id next to its idea id.

Finally, if any starred idea leaves something ambiguous (scope, order, or a conflict between two ideas), ask one round with AskUserQuestion (at most 4 questions, recommended option first) instead of guessing.`;
};
