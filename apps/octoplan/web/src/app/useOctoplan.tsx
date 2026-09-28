import { type ClientEvent, type Session, clientEventSchema } from "@octogent/octoplan-protocol";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "react";
import {
  type PlanClientState,
  type RoundEntry,
  initialPlanClientState,
  planClientReducer,
} from "./planClientReducer";
import { type OctoplanTransport, createWebSocketTransport } from "./transport";
import type { ConnectionState, ConnectionStatus } from "./useServerConnection";

export type Octoplan = {
  connection: ConnectionState;
  sessions: PlanClientState["sessions"];
  blocksBySession: PlanClientState["blocksBySession"];
  /** Every round keyed by id, with pending/answered status and answers. */
  rounds: Record<string, RoundEntry>;
  planByRepo: PlanClientState["planByRepo"];
  errors: PlanClientState["errors"];
  /** Server notices, oldest first (capped). Toasts expire them in the UI, not here. */
  notices: PlanClientState["notices"];
  /** The latest `search-ideas` reply, or null before the first search. */
  ideaSearch: PlanClientState["ideaSearch"];
  stagesByRepo: PlanClientState["stagesByRepo"];
  /** Tentacle export replies, oldest first; `seq` orders them against a submit. */
  exportResults: PlanClientState["exportResults"];
  graphByRepo: PlanClientState["graphByRepo"];
  /** True from a sent `request-graph` until its `graph` reply (or a server error). */
  graphLoadingByRepo: PlanClientState["graphLoadingByRepo"];
  // v2
  /** Tentacle cards, drift and history per repo (replies to `request-overview`). */
  overviewByRepo: PlanClientState["overviewByRepo"];
  /** User-level conventions (~/.octoplan/CONVENTIONS.md). */
  conventions: PlanClientState["conventions"];
  /** Latest state of each long-running plan job, per repo. */
  jobsByRepo: PlanClientState["jobsByRepo"];
  handoffResultByRepo: PlanClientState["handoffResultByRepo"];
  activeSessionId: string | null;
  activeSession: Session | null;
  /**
   * A repo chosen without a session (a running import, D56), else the active session's repo,
   * else the first repo with a plan.
   */
  activeRepo: string | null;
  setActiveSession: (sessionId: string | null) => void;
  /** Show a repo that has no session yet; choosing a session clears it. */
  setActiveRepo: (repoPath: string | null) => void;
  /** v3 (D50): the home screen with the two entry paths is showing. */
  home: boolean;
  setHome: (home: boolean) => void;
  /** Validates with clientEventSchema; invalid events are dropped, logged and return false. */
  sendClientEvent: (event: ClientEvent) => boolean;
  /** Raw reducer state, for selectors in planClientReducer.ts. */
  state: PlanClientState;
};

const OctoplanContext = createContext<Octoplan | null>(null);

export const OctoplanProvider = ({
  transport,
  children,
}: {
  transport?: OctoplanTransport;
  children: ReactNode;
}) => {
  const [activeTransport] = useState(() => transport ?? createWebSocketTransport());
  const [state, dispatch] = useReducer(planClientReducer, initialPlanClientState);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  // `?session=<id>` preselects a session (bookmarks, links from other tools).
  const [chosenSessionId, setChosenSessionId] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("session"),
  );
  const [chosenRepo, setActiveRepo] = useState<string | null>(null);
  // null = not decided by the user yet: home shows while there are no sessions (D50).
  const [homeChoice, setHome] = useState<boolean | null>(null);
  const setActiveSession = useCallback((sessionId: string | null) => {
    setActiveRepo(null);
    setChosenSessionId(sessionId);
  }, []);

  useEffect(
    () =>
      activeTransport.connect({
        onEvent: (event) => {
          if (event.type === "hello") setStatus("online");
          // v3: the server moves the client that created a project or started an import.
          if (event.type === "focus-repo") {
            setActiveRepo(event.repoPath);
            setHome(false);
          }
          if (event.type === "focus-session") {
            setActiveRepo(null);
            setChosenSessionId(event.sessionId);
            setHome(false);
          }
          dispatch(event);
        },
        onStatus: setStatus,
      }),
    [activeTransport],
  );

  const sendClientEvent = useCallback(
    (event: ClientEvent) => {
      const parsed = clientEventSchema.safeParse(event);
      if (!parsed.success) {
        console.warn("octoplan: dropped invalid client event", event, parsed.error.issues);
        return false;
      }
      activeTransport.send(parsed.data);
      if (parsed.data.type === "request-graph") {
        dispatch({ type: "local/graph-requested", repoPath: parsed.data.repoPath });
      }
      return true;
    },
    [activeTransport],
  );

  const value = useMemo<Octoplan>(() => {
    const activeSessionId =
      chosenSessionId && state.sessions.some((s) => s.id === chosenSessionId)
        ? chosenSessionId
        : (state.sessions[0]?.id ?? null);
    const activeSession = state.sessions.find((s) => s.id === activeSessionId) ?? null;
    const activeRepo =
      chosenRepo ?? activeSession?.repoPath ?? Object.keys(state.planByRepo)[0] ?? null;
    const home = homeChoice ?? (status === "online" && state.sessions.length === 0 && !chosenRepo);
    return {
      connection: { status, serverVersion: state.serverVersion },
      sessions: state.sessions,
      blocksBySession: state.blocksBySession,
      rounds: state.rounds,
      planByRepo: state.planByRepo,
      errors: state.errors,
      notices: state.notices,
      ideaSearch: state.ideaSearch,
      stagesByRepo: state.stagesByRepo,
      exportResults: state.exportResults,
      graphByRepo: state.graphByRepo,
      graphLoadingByRepo: state.graphLoadingByRepo,
      overviewByRepo: state.overviewByRepo,
      conventions: state.conventions,
      jobsByRepo: state.jobsByRepo,
      handoffResultByRepo: state.handoffResultByRepo,
      activeSessionId,
      activeSession,
      activeRepo,
      setActiveSession,
      setActiveRepo,
      home,
      setHome,
      sendClientEvent,
      state,
    };
  }, [state, status, chosenSessionId, chosenRepo, homeChoice, setActiveSession, sendClientEvent]);

  return <OctoplanContext.Provider value={value}>{children}</OctoplanContext.Provider>;
};

/** The client session store. qcards, modes and integrations read state only through this. */
export const useOctoplan = (): Octoplan => {
  const value = useContext(OctoplanContext);
  if (!value) throw new Error("useOctoplan() must be used inside <OctoplanProvider>");
  return value;
};
