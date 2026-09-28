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
  activeSessionId: string | null;
  activeSession: Session | null;
  /** Repo of the active session, or the first repo with a plan when no session is active. */
  activeRepo: string | null;
  setActiveSession: (sessionId: string | null) => void;
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
  const [chosenSessionId, setActiveSession] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("session"),
  );

  useEffect(
    () =>
      activeTransport.connect({
        onEvent: (event) => {
          if (event.type === "hello") setStatus("online");
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
    const activeRepo = activeSession?.repoPath ?? Object.keys(state.planByRepo)[0] ?? null;
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
      activeSessionId,
      activeSession,
      activeRepo,
      setActiveSession,
      sendClientEvent,
      state,
    };
  }, [state, status, chosenSessionId, sendClientEvent]);

  return <OctoplanContext.Provider value={value}>{children}</OctoplanContext.Provider>;
};

/** The client session store. qcards, modes and integrations read state only through this. */
export const useOctoplan = (): Octoplan => {
  const value = useContext(OctoplanContext);
  if (!value) throw new Error("useOctoplan() must be used inside <OctoplanProvider>");
  return value;
};
