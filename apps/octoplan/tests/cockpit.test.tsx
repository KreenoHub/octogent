// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { wsUrl } from "../web/src/app/useServerConnection";
import { CockpitLayout } from "../web/src/components/CockpitLayout";

describe("cockpit shell", () => {
  it("renders the three panes with an empty plan board and full coverage list", () => {
    render(<CockpitLayout connection={{ status: "online", serverVersion: "0.0.0" }} />);
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

  it("shows offline state", () => {
    render(<CockpitLayout connection={{ status: "offline", serverVersion: null }} />);
    expect(screen.getByTestId("connection-status")).toHaveTextContent("OFFLINE");
  });

  it("derives the websocket url from the page location", () => {
    expect(wsUrl({ protocol: "http:", host: "localhost:5190" })).toBe("ws://localhost:5190/ws");
    expect(wsUrl({ protocol: "https:", host: "x" })).toBe("wss://x/ws");
  });
});
