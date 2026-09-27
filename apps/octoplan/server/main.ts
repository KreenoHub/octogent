import { query } from "@anthropic-ai/claude-agent-sdk";
import { createNodePtyFactory } from "./bridge/pty";
import { startOctoplanServer } from "./createServer";
import { createIntegrations, createNodeExec } from "./integrations";
import { applyCoverageUpdate, getMode } from "./modes";
import { createFsPlanStore } from "./store/fsPlanStore";
import { createIdeaRegistry } from "./store/ideaRegistry";

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
    integrations: createIntegrations({ exec: createNodeExec() }),
    ideaRegistry: createIdeaRegistry(),
  },
})
  .then((server) => {
    console.log(`Octoplan server listening on http://${host}:${server.port}`);
  })
  .catch((error) => {
    console.error("Octoplan server failed to start:", error);
    process.exit(1);
  });
