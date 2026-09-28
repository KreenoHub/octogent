// D44/D48: write a reviewed handoff into the Octogent workspace. Each tentacle is created when
// missing, gets its octoplan-managed CONTEXT.md block (goal + owns + its decisions, D36) and its
// todos under `## <heading>` / `### <wave>` with D-id stamps. Applying twice adds nothing.
import type { HandoffApplyTentacleResult, HandoffResult } from "@octogent/octoplan-protocol";
import { ensureTentacle, renderManagedBlock, toTodoLine, writeTentacle } from "./octogentExport";
import type { ApplyHandoffInput, Exec } from "./types";
import { resolveWorkspace } from "./workspace";

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** `deckUrlFor(workspace)`: Octogent's real URL once known (D61), else undefined. */
export const applyHandoff = async (
  exec: Exec,
  input: ApplyHandoffInput,
  deckUrlFor: (workspace: string) => Promise<string | undefined> = async () => undefined,
): Promise<HandoffResult> => {
  const workspace = await resolveWorkspace(exec, input.repoPath);
  const { plan, goal } = input;
  const active = input.decisions.filter((d) => d.status === "active");
  const results: HandoffApplyTentacleResult[] = [];

  // Sequential: each create goes through the one Octogent API, and results keep plan order.
  for (const tentacle of plan.tentacles) {
    const base = { tentacleId: tentacle.id, created: false, added: 0, skipped: 0 };
    try {
      const ensured = await ensureTentacle(
        exec,
        workspace,
        tentacle.id,
        tentacle.description || tentacle.name,
      );
      if (!ensured.ok) {
        results.push({ ...base, ok: false, message: ensured.message });
        continue;
      }
      const cited = new Set(tentacle.todos.flatMap((todo) => todo.decisionIds));
      const todos = tentacle.todos.flatMap((todo) => {
        const line = toTodoLine(todo.text, todo.decisionIds);
        return line ? [{ line, placement: { heading: plan.heading, wave: todo.wave } }] : [];
      });
      const { added, skipped } = await writeTentacle({
        workspace,
        tentacleId: tentacle.id,
        created: ensured.created,
        name: tentacle.name,
        description: tentacle.description || tentacle.name,
        block: renderManagedBlock(
          goal,
          active.filter((d) => cited.has(d.id)),
          tentacle.owns,
        ),
        todos,
      });
      results.push({
        ...base,
        created: ensured.created,
        added,
        skipped,
        ok: true,
        message: `${ensured.created ? "Created" : "Updated"}: ${added} todo${
          added === 1 ? "" : "s"
        } added, ${skipped} already there.`,
      });
    } catch (error) {
      results.push({ ...base, ok: false, message: `Could not write: ${errorText(error)}` });
    }
  }

  const failed = results.filter((r) => !r.ok);
  const created = results.filter((r) => r.created).length;
  const added = results.reduce((sum, r) => sum + r.added, 0);
  const deckUrl = await deckUrlFor(workspace).catch(() => undefined);
  const summary = `${results.length - failed.length}/${results.length} tentacles written to ${workspace} (${created} created, ${added} todo${added === 1 ? "" : "s"} added)`;
  return {
    ok: failed.length === 0,
    message:
      failed.length === 0
        ? `${summary}.`
        : `${summary}. ${failed[0]?.tentacleId}: ${failed[0]?.message}`,
    workspace,
    tentacles: results,
    ...(deckUrl ? { deckUrl } : {}),
  };
};
