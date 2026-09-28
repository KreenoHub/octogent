import {
  type ClientEvent,
  PROTOCOL_VERSION,
  type ServerEvent,
  parseServerEvent,
} from "@octogent/octoplan-protocol";
import { type ConnectionStatus, wsUrl } from "./useServerConnection";

export type TransportHandlers = {
  onEvent: (event: ServerEvent) => void;
  onStatus: (status: ConnectionStatus) => void;
};

/** The only thing that talks to the server. Tests and other tentacles swap in the fake. */
export type OctoplanTransport = {
  connect: (handlers: TransportHandlers) => () => void;
  send: (event: ClientEvent) => void;
};

export const createWebSocketTransport = (
  url: string = wsUrl(window.location),
): OctoplanTransport => {
  let socket: WebSocket | null = null;
  return {
    connect: ({ onEvent, onStatus }) => {
      const current = new WebSocket(url);
      // A disposed socket (e.g. StrictMode's first mount) must not report into the store.
      let disposed = false;
      socket = current;
      onStatus("connecting");
      current.addEventListener("open", () => {
        current.send(JSON.stringify({ type: "hello", protocolVersion: PROTOCOL_VERSION }));
      });
      current.addEventListener("message", (message) => {
        const event = parseServerEvent(String(message.data));
        if (event && !disposed) onEvent(event);
      });
      current.addEventListener("close", () => {
        if (!disposed) onStatus("offline");
      });
      return () => {
        disposed = true;
        if (socket === current) socket = null;
        current.close();
      };
    },
    send: (event) => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
      else console.warn("octoplan: not connected, dropped client event", event.type);
    },
  };
};

export type FakeTransport = OctoplanTransport & {
  /** Client events the UI sent, in order. */
  sent: ClientEvent[];
  /** Push a server event into the UI, as if the server sent it. */
  emit: (event: ServerEvent) => void;
  setStatus: (status: ConnectionStatus) => void;
};

/** In-memory transport for tests and for tentacles building against useOctoplan(). */
export const createFakeTransport = (): FakeTransport => {
  let handlers: TransportHandlers | null = null;
  const fake: FakeTransport = {
    sent: [],
    connect: (next) => {
      handlers = next;
      return () => {
        if (handlers === next) handlers = null;
      };
    },
    send: (event) => {
      fake.sent.push(event);
    },
    emit: (event) => handlers?.onEvent(event),
    setStatus: (status) => handlers?.onStatus(status),
  };
  return fake;
};
