// Live check that the Agent SDK lets Octoplan answer AskUserQuestion itself.
// Run: pnpm --filter @octogent/octoplan probe:ask   (uses your Claude Code login)
import { query } from "@anthropic-ai/claude-agent-sdk";

const PROBE_ANSWER = "Blue";

const run = async () => {
  let intercepted: unknown = null;

  const stream = query({
    prompt:
      "Use the AskUserQuestion tool exactly once to ask me: 'Pick a color' with header 'Color' and two options, Red and Blue. After I answer, reply with only the name of the color I picked, nothing else.",
    options: {
      maxTurns: 4,
      canUseTool: async (toolName, input) => {
        if (toolName === "AskUserQuestion") {
          intercepted = input;
          const questions = (input as { questions?: Array<{ question: string }> }).questions ?? [];
          const answers = Object.fromEntries(questions.map((q) => [q.question, PROBE_ANSWER]));
          return { behavior: "allow", updatedInput: { ...input, answers } };
        }
        return { behavior: "deny", message: "Probe only allows AskUserQuestion." };
      },
    },
  });

  let finalText = "";
  let sessionId = "";
  for await (const message of stream) {
    if (message.type === "system" && message.subtype === "init") sessionId = message.session_id;
    if (message.type === "result") {
      finalText = message.subtype === "success" ? message.result : `(${message.subtype})`;
    }
  }

  console.log(JSON.stringify({ sessionId, intercepted, finalText }, null, 2));
  const ok = intercepted !== null && finalText.toLowerCase().includes(PROBE_ANSWER.toLowerCase());
  console.log(ok ? "PROBE PASS" : "PROBE FAIL");
  process.exit(ok ? 0 : 1);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
