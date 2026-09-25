import { PROTOCOL_VERSION, parseServerEvent } from "@octogent/octoplan-protocol";
import { useEffect, useState } from "react";

export type ConnectionState = {
  status: "connecting" | "online" | "offline";
  serverVersion: string | null;
};

export const wsUrl = (location: Pick<Location, "protocol" | "host">) =>
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;

export const useServerConnection = (): ConnectionState => {
  const [state, setState] = useState<ConnectionState>({
    status: "connecting",
    serverVersion: null,
  });

  useEffect(() => {
    const socket = new WebSocket(wsUrl(window.location));
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "hello", protocolVersion: PROTOCOL_VERSION }));
    });
    socket.addEventListener("message", (message) => {
      const event = parseServerEvent(String(message.data));
      if (event?.type === "hello") {
        setState({ status: "online", serverVersion: event.serverVersion });
      }
    });
    socket.addEventListener("close", () => setState((prev) => ({ ...prev, status: "offline" })));
    return () => socket.close();
  }, []);

  return state;
};
