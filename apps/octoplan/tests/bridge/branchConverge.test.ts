import type { ConversationBranch, Idea, ServerEvent } from "@octogent/octoplan-protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BRANCH_NOT_READY_MESSAGE,
  NOTHING_STARRED_MESSAGE,
  branchTurn,
  createSessionManager,
} from "../../server/bridge/sessionManager";
import type { BridgeDeps } from "../../server/bridge/types";
import type { BranchInput, PlanStore } from "../../server/store/types";
import {
  assistantText,
  createFakeQuery,
  eventLog,
  init,
  realDeps,
  result,
  tempRepo,
  until,
} from "./fakes";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const PARENT_CLAUDE = "11111111-1111-4111-8111-111111111111";

/**
 * The real store's upsertBranch is still a stub (store tentacle, wave 2), so the test wraps
 * the fs store and records B-records in memory.
 */
const withFakeBranches = (deps: BridgeDeps) => {
  const branches: ConversationBranch[] = [];
  const upsertBranch = vi.fn(async (input: BranchInput) => {
    const record = { ...input, id: input.id ?? `B${branches.length + 1}` };
    branches.push(record);
    return record;
  });
  const storeFor = (repoPath: string): PlanStore => {
    const store = deps.storeFor(repoPath);
    return new Proxy(store, {
      get(target, property) {
        if (property === "upsertBranch") return upsertBranch;
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  };
  return { deps: { ...deps, storeFor }, branches, upsertBranch };
};

const setup = (script: Parameters<typeof createFakeQuery>[0], extra: Partial<BridgeDeps> = {}) => {
  const repo = tempRepo();
  const fake = createFakeQuery(script);
  const log = eventLog();
  let n = 0;
  const wrapped = withFakeBranches({
    ...realDeps(fake.query),
    newId: () => `s${++n}`,
    ...extra,
  });
  const manager = createSessionManager(wrapped.deps, log.broadcast);
  cleanups.push(async () => {
    await manager.dispose();
    repo.cleanup();
  });
  return { repo, fake, log, manager, ...wrapped };
};

const ofType =
  <K extends ServerEvent["type"]>(type: K) =>
  (event: ServerEvent): event is Extract<ServerEvent, { type: K }> =>
    event.type === type;

describe("branch", () => {
  it("forks the parent's Claude session, records a B-record and announces it", async () => {
    const ctx = setup(async function* ({ options, next }) {
      await next();
      if (options.resume) {
        yield init("22222222-2222-4222-8222-222222222222");
        yield assistantText("## Alternative\nExploring.");
        yield result();
      } else {
        yield init(PARENT_CLAUDE);
        yield assistantText("## Framing\nLet's plan.");
        yield result();
      }
      await next();
    });
    const parent = await ctx.manager.start({
      repoPath: ctx.repo.dir,
      mode: "deep-interview",
      topic: "Pick a database",
    });
    if (!parent) throw new Error("no session");
    await until(() => ctx.manager.getSession("s1")?.claudeSessionId === PARENT_CLAUDE);
    // The id arrives with `init`, a tick before the "Framing" section block exists; branching
    // from that block before it's recorded is (correctly) refused, so wait for the block.
    await until(() => ctx.log.events.some((e) => e.type === "block" && e.block.id === "s1-b2"));

    const child = await ctx.manager.branch("s1", "Try Postgres", "s1-b2");
    expect(child).toMatchObject({
      id: "s2",
      title: "Try Postgres",
      mode: "deep-interview",
      repoPath: parent.repoPath,
      parentSessionId: "s1",
    });

    await until(() => ctx.fake.calls.length === 2 && ctx.fake.calls[1]?.received.length === 1);
    const forkCall = ctx.fake.calls[1];
    expect(forkCall?.options.resume).toBe(PARENT_CLAUDE);
    expect(forkCall?.options.forkSession).toBe(true);
    expect(forkCall?.options.cwd).toBe(parent.repoPath);
    expect(ctx.fake.calls[0]?.options.forkSession).toBeUndefined();
    expect(forkCall?.received[0]).toContain('"Try Postgres"');
    expect(forkCall?.received[0]).toContain('"Framing"');

    expect(ctx.upsertBranch).toHaveBeenCalledWith({
      title: "Try Postgres",
      sessionId: "s2",
      parentSessionId: "s1",
      forkedFromBlockId: "s1-b2",
      status: "exploring",
      body: "",
    });
    expect(ctx.branches.map((b) => b.id)).toEqual(["B1"]);

    const notice = ctx.log.events.find(ofType("notice"));
    expect(notice).toEqual({
      type: "notice",
      message: "Branched B1: Try Postgres",
      sessionId: "s2",
    });
    const updated = ctx.log.events.filter(ofType("session-updated")).map((e) => e.session.id);
    expect(updated).toContain("s1");
    expect(updated).toContain("s2");

    // The fork reports its own Claude id; the parent's stays untouched.
    await until(
      () =>
        ctx.manager.getSession("s2")?.claudeSessionId === "22222222-2222-4222-8222-222222222222",
    );
    expect(ctx.manager.getSession("s1")?.claudeSessionId).toBe(PARENT_CLAUDE);
  });

  it("refuses to branch before Claude reported a session id", async () => {
    const ctx = setup(async function* ({ next }) {
      await next();
      yield result();
      await next();
    });
    await ctx.manager.start({ repoPath: ctx.repo.dir, mode: "quick-align", topic: "x" });
    const child = await ctx.manager.branch("s1", "Too early");
    expect(child).toBeNull();
    expect(ctx.log.events.find(ofType("error"))).toMatchObject({
      message: BRANCH_NOT_READY_MESSAGE,
      sessionId: "s1",
    });
    expect(ctx.upsertBranch).not.toHaveBeenCalled();
    expect(ctx.fake.calls).toHaveLength(1);
  });

  it("reports an unknown block instead of forking", async () => {
    const ctx = setup(async function* ({ next }) {
      await next();
      yield init(PARENT_CLAUDE);
      await next();
    });
    await ctx.manager.start({ repoPath: ctx.repo.dir, mode: "quick-align", topic: "x" });
    await until(() => Boolean(ctx.manager.getSession("s1")?.claudeSessionId));
    expect(await ctx.manager.branch("s1", "Nope", "missing-block")).toBeNull();
    expect(ctx.log.events.find(ofType("error"))?.message).toContain("missing-block");
  });

  it("writes a branch turn that names the anchor section", () => {
    expect(
      branchTurn("Go native", {
        kind: "section",
        id: "b1",
        heading: "Stack",
        markdown: "",
        at: "",
      }),
    ).toContain('It starts from your section "Stack"');
    expect(branchTurn("Go native")).not.toContain("It starts from");
  });
});

const idea = (id: string, status: Idea["status"]): Omit<Idea, "id"> & { id: string } => ({
  id,
  title: `Idea ${id}`,
  date: "2026-09-27",
  tags: [],
  status,
  body: "",
});

describe("converge", () => {
  const seedIdeas = async (ctx: ReturnType<typeof setup>, statuses: Idea["status"][]) => {
    const store = ctx.deps.storeFor(ctx.repo.dir);
    for (const [index, status] of statuses.entries()) {
      const { id: _id, ...rest } = idea(`I${index + 1}`, status);
      await store.addIdea(rest);
    }
    await store.dispose();
  };

  it("pushes the modes' converge turn built from the repo's ideas", async () => {
    const buildConvergeTurn = vi.fn(
      (ideas: readonly Idea[]) =>
        `CONVERGE: ${ideas
          .filter((i) => i.status === "starred")
          .map((i) => i.title)
          .join(", ")}`,
    );
    const ctx = setup(
      async function* ({ next }) {
        await next();
        yield init(PARENT_CLAUDE);
        yield result();
        await next();
        await next();
      },
      { buildConvergeTurn },
    );
    await seedIdeas(ctx, ["starred", "inbox", "starred"]);
    await ctx.manager.start({ repoPath: ctx.repo.dir, mode: "brainstorm", topic: "Names" });
    await until(() => ctx.manager.getSession("s1")?.status === "idle");

    await ctx.manager.converge("s1");
    await until(() => (ctx.fake.calls[0]?.received.length ?? 0) === 2);
    expect(buildConvergeTurn).toHaveBeenCalledTimes(1);
    expect(buildConvergeTurn.mock.calls[0]?.[0].map((i) => i.status)).toEqual([
      "starred",
      "inbox",
      "starred",
    ]);
    expect(ctx.fake.calls[0]?.received[1]).toBe("CONVERGE: Idea I1, Idea I3");
    expect(ctx.log.events.some((e) => e.type === "error")).toBe(false);
  });

  it("resumes an ended session to converge", async () => {
    const buildConvergeTurn = vi.fn(() => "CONVERGE NOW");
    const ctx = setup(
      async function* ({ next }) {
        await next();
        yield init(PARENT_CLAUDE);
        yield result();
        await next();
      },
      { buildConvergeTurn },
    );
    await seedIdeas(ctx, ["starred"]);
    await ctx.manager.start({ repoPath: ctx.repo.dir, mode: "brainstorm", topic: "Names" });
    await until(() => ctx.manager.getSession("s1")?.status === "idle");
    await ctx.manager.stop("s1");

    await ctx.manager.converge("s1");
    await until(() => ctx.fake.calls.length === 2 && ctx.fake.calls[1]?.received.length === 1);
    expect(ctx.fake.calls[1]?.options.resume).toBe(PARENT_CLAUDE);
    expect(ctx.fake.calls[1]?.options.forkSession).toBeUndefined();
    expect(ctx.fake.calls[1]?.received[0]).toBe("CONVERGE NOW");
  });

  it("explains that something must be starred first", async () => {
    const buildConvergeTurn = vi.fn(() => "never");
    const ctx = setup(
      async function* ({ next }) {
        await next();
        yield init(PARENT_CLAUDE);
        await next();
      },
      { buildConvergeTurn },
    );
    await seedIdeas(ctx, ["inbox", "killed"]);
    await ctx.manager.start({ repoPath: ctx.repo.dir, mode: "brainstorm", topic: "Names" });
    await ctx.manager.converge("s1");
    expect(ctx.log.events.find(ofType("error"))).toMatchObject({
      message: NOTHING_STARRED_MESSAGE,
      sessionId: "s1",
    });
    expect(buildConvergeTurn).not.toHaveBeenCalled();
    expect(ctx.fake.calls[0]?.received).toHaveLength(1);
  });

  it("reports a failing converge builder as an error, not a crash", async () => {
    const ctx = setup(
      async function* ({ next }) {
        await next();
        yield result();
        await next();
      },
      {
        buildConvergeTurn: () => {
          throw new Error("not implemented yet");
        },
      },
    );
    await seedIdeas(ctx, ["starred"]);
    await ctx.manager.start({ repoPath: ctx.repo.dir, mode: "brainstorm", topic: "Names" });
    await ctx.manager.converge("s1");
    expect(ctx.log.events.find(ofType("error"))?.message).toBe(
      "Could not converge: not implemented yet",
    );
  });
});
