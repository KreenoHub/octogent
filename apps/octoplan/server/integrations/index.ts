// Stub: the integrations tentacle implements this in wave 2 (see types.ts).
import type { CreateIntegrations } from "./types";

export type * from "./types";

export const createIntegrations: CreateIntegrations = () => ({
  exportToTentacle: async () => ({
    ok: false,
    message: "Export to Octogent is not implemented yet (wave 2, integrations tentacle).",
  }),
  buildGraph: async () => {
    throw new Error("buildGraph: not implemented yet (wave 2, integrations tentacle)");
  },
});
