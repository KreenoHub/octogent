// Short read-only Agent SDK passes for harvest (D31) and the handoff proposal (D45).
// Contract stub seeded by the octopus; the bridge tentacle implements it.
import type { CreateHeadlessRunner } from "./types";

export const HARVEST_TOOL = "plan_add_harvest";
export const HANDOFF_TOOL = "plan_propose_handoff";

export const createHeadlessRunner: CreateHeadlessRunner = () => ({
  harvest: () => Promise.reject(new Error("Not implemented yet: headless.harvest")),
  proposeHandoff: () => Promise.reject(new Error("Not implemented yet: headless.proposeHandoff")),
});
