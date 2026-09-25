export type ConnectionStatus = "connecting" | "online" | "offline";

export type ConnectionState = {
  status: ConnectionStatus;
  serverVersion: string | null;
};

export const wsUrl = (location: Pick<Location, "protocol" | "host">) =>
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
