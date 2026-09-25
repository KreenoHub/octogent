// @vitest-environment jsdom
import { act, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { type Octoplan, useOctoplan } from "../web/src/app/useOctoplan";
import { wsUrl } from "../web/src/app/useServerConnection";
import { renderCockpit } from "./ui-shell/renderCockpit";

describe("cockpit shell", () => {
  it("renders the three panes with an empty plan board and full coverage list", () => {
    const { emit } = renderCockpit();
    emit({ type: "hello", protocolVersion: 1, serverVersion: "0.0.0" });
    expect(screen.getByText("OCTOPLAN")).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "Projects and sessions" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Conversation" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Plan board" })).toBeInTheDocument();
    expect(screen.getByTestId("connection-status")).toHaveTextContent("ONLINE · v0.0.0");
    expect(screen.getAllByText("0")).toHaveLength(5);
    expect(screen.getByText("Success metrics & DoD")).toBeInTheDocument();
  });

  it("shows connecting, then offline state", () => {
    const { transport } = renderCockpit();
    expect(screen.getByTestId("connection-status")).toHaveTextContent("CONNECTING");
    act(() => transport.setStatus("offline"));
    expect(screen.getByTestId("connection-status")).toHaveTextContent("OFFLINE");
  });

  it("derives the websocket url from the page location", () => {
    expect(wsUrl({ protocol: "http:", host: "localhost:5190" })).toBe("ws://localhost:5190/ws");
    expect(wsUrl({ protocol: "https:", host: "x" })).toBe("wss://x/ws");
  });

  it("drops and logs invalid client events instead of sending them", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const captured: { octoplan?: Octoplan } = {};
    const Probe = () => {
      captured.octoplan = useOctoplan();
      return null;
    };
    const { transport } = renderCockpit(<Probe />);
    const send = captured.octoplan?.sendClientEvent;
    if (!send) throw new Error("probe did not render");
    expect(send({ type: "send-message", sessionId: "s1", text: "" })).toBe(false);
    expect(transport.sent).toEqual([]);
    expect(warn).toHaveBeenCalled();
    expect(send({ type: "stop-session", sessionId: "s1" })).toBe(true);
    expect(transport.sent).toEqual([{ type: "stop-session", sessionId: "s1" }]);
    warn.mockRestore();
  });
});
