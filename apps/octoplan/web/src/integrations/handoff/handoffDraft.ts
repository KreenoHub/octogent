// Pure edit operations for the wizard's Review step (D44). The draft carries stable React keys
// on tentacles and todos; `toPlan` strips them before save-handoff.
import {
  type HandoffPlan,
  type HandoffTentacle,
  type HandoffTodo,
  handoffPlanSchema,
} from "@octogent/octoplan-protocol";

export type DraftTodo = HandoffTodo & { key: string };
export type DraftTentacle = Omit<HandoffTentacle, "todos"> & { key: string; todos: DraftTodo[] };
export type Draft = Omit<HandoffPlan, "tentacles"> & { tentacles: DraftTentacle[] };

const TENTACLE_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

let nextKey = 0;
const newKey = (prefix: string) => `${prefix}${++nextKey}`;

export const fromPlan = (plan: HandoffPlan): Draft => ({
  ...plan,
  tentacles: plan.tentacles.map((tentacle) => ({
    ...tentacle,
    key: newKey("t"),
    todos: tentacle.todos.map((todo) => ({ ...todo, key: newKey("d") })),
  })),
});

export const toPlan = (draft: Draft): HandoffPlan => ({
  ...draft,
  tentacles: draft.tentacles.map(({ key: _key, todos, ...tentacle }) => ({
    ...tentacle,
    todos: todos.map(({ key: _todoKey, ...todo }) => todo),
  })),
});

/** "My API" -> "my-api"; always a valid Octogent tentacle id. */
export const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "tentacle";

export const idError = (id: string, draft: Draft, key: string): string | null => {
  if (!id) return "Id is required";
  if (!TENTACLE_ID_RE.test(id)) return "Lowercase letters, digits and dashes only";
  if (draft.tentacles.some((t) => t.key !== key && t.id === id)) return "Another tentacle has it";
  return null;
};

/** The first problem that would stop save-handoff, or null when the draft can be saved. */
export const draftProblem = (draft: Draft): string | null => {
  if (!draft.heading.trim()) return "The todo heading can't be empty.";
  if (draft.tentacles.length === 0) return "Keep at least one tentacle.";
  for (const tentacle of draft.tentacles) {
    const error = idError(tentacle.id, draft, tentacle.key);
    if (error) return `Tentacle id "${tentacle.id}": ${error.toLowerCase()}.`;
    if (!tentacle.name.trim()) return `Tentacle ${tentacle.id} needs a name.`;
    if (tentacle.todos.some((todo) => !todo.text.trim())) {
      return `Tentacle ${tentacle.id} has an empty todo — write it or delete it.`;
    }
  }
  return handoffPlanSchema.safeParse(toPlan(draft)).success ? null : "The plan is not valid yet.";
};

/** Todos grouped by wave, in the order each wave first appears. */
export const groupByWave = (
  todos: readonly DraftTodo[],
): { wave: string; todos: DraftTodo[] }[] => {
  const groups: { wave: string; todos: DraftTodo[] }[] = [];
  for (const todo of todos) {
    const group = groups.find((g) => g.wave === todo.wave);
    if (group) group.todos.push(todo);
    else groups.push({ wave: todo.wave, todos: [todo] });
  }
  return groups;
};

const mapTentacle = (
  draft: Draft,
  key: string,
  change: (tentacle: DraftTentacle) => DraftTentacle,
): Draft => ({
  ...draft,
  tentacles: draft.tentacles.map((t) => (t.key === key ? change(t) : t)),
});

export const updateTentacle = (
  draft: Draft,
  key: string,
  patch: Partial<Pick<DraftTentacle, "id" | "name" | "description" | "owns">>,
): Draft => mapTentacle(draft, key, (t) => ({ ...t, ...patch }));

export const addOwn = (draft: Draft, key: string, folder: string): Draft => {
  const value = folder.trim();
  if (!value) return draft;
  return mapTentacle(draft, key, (t) =>
    t.owns.includes(value) ? t : { ...t, owns: [...t.owns, value] },
  );
};

export const removeOwn = (draft: Draft, key: string, folder: string): Draft =>
  mapTentacle(draft, key, (t) => ({ ...t, owns: t.owns.filter((own) => own !== folder) }));

export const addTentacle = (draft: Draft): Draft => {
  let index = draft.tentacles.length + 1;
  while (draft.tentacles.some((t) => t.id === `tentacle-${index}`)) index++;
  const tentacle: DraftTentacle = {
    key: newKey("t"),
    id: `tentacle-${index}`,
    name: `Tentacle ${index}`,
    description: "",
    owns: [],
    existing: false,
    todos: [],
  };
  return { ...draft, tentacles: [...draft.tentacles, tentacle] };
};

export const removeTentacle = (draft: Draft, key: string): Draft => ({
  ...draft,
  tentacles: draft.tentacles.filter((t) => t.key !== key),
});

export const updateTodo = (draft: Draft, key: string, todoKey: string, text: string): Draft =>
  mapTentacle(draft, key, (t) => ({
    ...t,
    todos: t.todos.map((todo) => (todo.key === todoKey ? { ...todo, text } : todo)),
  }));

export const deleteTodo = (draft: Draft, key: string, todoKey: string): Draft =>
  mapTentacle(draft, key, (t) => ({ ...t, todos: t.todos.filter((todo) => todo.key !== todoKey) }));

export const addTodo = (draft: Draft, key: string, wave: string): Draft =>
  mapTentacle(draft, key, (t) => {
    const todo: DraftTodo = { key: newKey("d"), text: "", decisionIds: [], wave };
    // Insert after the last todo of the same wave so the group stays together.
    let at = -1;
    t.todos.forEach((existing, index) => {
      if (existing.wave === wave) at = index;
    });
    const todos = [...t.todos];
    todos.splice(at === -1 ? todos.length : at + 1, 0, todo);
    return { ...t, todos };
  });

/** Moves a todo to the end of another tentacle, keeping its wave and D-ids. */
export const moveTodo = (draft: Draft, fromKey: string, todoKey: string, toKey: string): Draft => {
  const todo = draft.tentacles.find((t) => t.key === fromKey)?.todos.find((d) => d.key === todoKey);
  if (!todo || fromKey === toKey) return draft;
  return {
    ...draft,
    tentacles: draft.tentacles.map((t) => {
      if (t.key === fromKey) return { ...t, todos: t.todos.filter((d) => d.key !== todoKey) };
      if (t.key === toKey) return { ...t, todos: [...t.todos, todo] };
      return t;
    }),
  };
};
