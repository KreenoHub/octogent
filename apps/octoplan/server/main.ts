import { query } from "@anthropic-ai/claude-agent-sdk";
import { createHeadlessRunner } from "./bridge/headless";
import { createNodePtyFactory } from "./bridge/pty";
import { startOctoplanServer } from "./createServer";
import { createIntegrations, createNodeExec } from "./integrations";
import { applyCoverageUpdate, getMode } from "./modes";
import { createFsPlanStore } from "./store/fsPlanStore";
import { createIdeaRegistry } from "./store/ideaRegistry";
import { createConventionsStore, createTranscriptStore } from "./store/userStores";

export const DEFAULT_PORT = 8790;

const parsePort = (value: string | undefined) => {
  if (!value) return DEFAULT_PORT;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    console.error(`Invalid OCTOPLAN_PORT "${value}": must be an integer between 1 and 65535.`);
    process.exit(1);
  }
  return parsed;
};

// Local-only by design (single user, no auth), so never bind beyond loopback by default.
const host = process.env.OCTOPLAN_HOST ?? "127.0.0.1";
const port = parsePort(process.env.OCTOPLAN_PORT);
// Where `.octoplan/` (projects, transcripts, conventions) lives; tests and the e2e gate
// point it at a temp folder. Claude's own login still comes from the real home folder.
const userDir = process.env.OCTOPLAN_HOME ? { homeDir: process.env.OCTOPLAN_HOME } : {};

startOctoplanServer({
  host,
  port,
  deps: {
    // Real Claude Code sessions through the user's own login (D2, D19).
    query,
    storeFor: (repoPath) =>
      createFsPlanStore(repoPath, {
        onWarning: (warning) =>
          console.warn(`docs/plan ${warning.file} ${warning.recordId}: ${warning.message}`),
      }),
    getMode,
    applyCoverageUpdate,
    // Wave 2: pop-out terminal, Octogent export + git graph, cross-project idea search.
    spawnPty: createNodePtyFactory(),
    integrations: createIntegrations({
      exec: createNodeExec(),
      ...(process.env.OCTOGENT_URL ? { octogentUrl: process.env.OCTOGENT_URL } : {}),
      // Where Octogent keeps runtime.json (default ~/.octogent); the e2e gate points it at a temp home.
      ...(process.env.OCTOPLAN_OCTOGENT_HOME
        ? { octogentHome: process.env.OCTOPLAN_OCTOGENT_HOME }
        : {}),
    }),
    ideaRegistry: createIdeaRegistry(userDir),
    // v2: sessions survive restarts (D29), user conventions in the digest (D28).
    transcripts: createTranscriptStore(userDir),
    conventions: createConventionsStore(userDir),
  },
  // v2: headless harvest (D31) and handoff proposal (D45) passes.
  headless: createHeadlessRunner({ query }),
})
  .then((server) => {
    console.log(`Octoplan server listening on http://${host}:${server.port}`);
  })
  .catch((error) => {
    console.error("Octoplan server failed to start:", error);
    process.exit(1);
  });
