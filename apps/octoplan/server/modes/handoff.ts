// v2 prompts and pure transforms for harvest (D31) and the Octogent handoff (D45, D47).
// Contract stubs seeded by the octopus; the modes tentacle implements them.
import type {
  BuildHandoffPrompt,
  BuildHarvestPrompt,
  BuildOctopusPrompt,
  FallbackHandoff,
  NormalizeHandoff,
} from "./v2Types";

const notYet = (name: string): never => {
  throw new Error(`Not implemented yet: modes.${name}`);
};

export const buildHarvestPrompt: BuildHarvestPrompt = () => notYet("buildHarvestPrompt");
export const buildHandoffPrompt: BuildHandoffPrompt = () => notYet("buildHandoffPrompt");
export const fallbackHandoff: FallbackHandoff = () => notYet("fallbackHandoff");
export const normalizeHandoff: NormalizeHandoff = () => notYet("normalizeHandoff");
export const buildOctopusPrompt: BuildOctopusPrompt = () => notYet("buildOctopusPrompt");
