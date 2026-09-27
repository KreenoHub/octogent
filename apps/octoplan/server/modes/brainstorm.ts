// Stub: the modes tentacle implements this in wave 2 (see wave2Types.ts).
import type { ApplyIdeaAction, BuildConvergeTurn } from "./wave2Types";

export const applyIdeaAction: ApplyIdeaAction = () => ({
  ok: false,
  error: "Brainstorm actions are not implemented yet (wave 2, modes tentacle).",
});

export const buildConvergeTurn: BuildConvergeTurn = () => {
  throw new Error("buildConvergeTurn: not implemented yet (wave 2, modes tentacle)");
};
