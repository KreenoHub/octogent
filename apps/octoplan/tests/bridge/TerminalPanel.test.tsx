// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const xterm = vi.hoisted(() => {
  type Listener<T> = (value: T) => void;
  class FakeTerminal {
    static instances: FakeTerminal[] = [];
    cols = 90;
    rows = 24;
    written: string[] = [];
    opened: HTMLElement | null = null;
    disposed = false;
    dataListener: Listener<string> | null = null;
    resizeListener: Listener<{ cols: number; rows: number }> | null = null;
    constructor(public options: Record<string, unknown>) {
      FakeTerminal.instances.push(this);
    }
    loadAddon() {}
    open(element: HTMLElement) {
      this.opened = element;
    }
    focus() {}
    write(data: string) {
      this.written.push(data);
    }
    onData(listener: Listener<string>) {
      this.dataListener = listener;
      return { dispose: () => undefined };
    }
    onResize(listener: Listener<{ cols: number; rows: number }>) {
      this.resizeListener = listener;
      return { dispose: () => undefined };
    }
    dispose() {
      this.disposed = true;
    }
  }
  class FakeFitAddon {
    fits = 0;
    fit() {
      this.fits += 1;
    }
  }
  return { FakeTerminal, FakeFitAddon };
});

vi.mock("xterm", () => ({ Terminal: xterm.FakeTerminal }));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: xterm.FakeFitAddon }));

import { TerminalPanel, resizeMessage, terminalUrl } from "../../web/src/terminal";

class FakeSocket {
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: unknown[] = [];
  closed = false;
  listeners = new Map<string, Array<(event: { data?: unknown }) => void>>();
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  addEventListener(type: string, listener: (event: { data?: unknown }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closed = true;
  }
  emit(type: string, event: { data?: unknown } = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
  open() {
    this.readyState = 1;
    this.emit("open");
  }
  message(payload: unknown) {
    this.emit("message", { data: JSON.stringify(payload) });
  }
}

beforeEach(() => {
  FakeSocket.instances = [];
  xterm.FakeTerminal.instances = [];
  vi.stubGlobal("WebSocket", FakeSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const mountPanel = (onClose = vi.fn()) => {
  const view = render(<TerminalPanel sessionId="s 1" onClose={onClose} />);
  const socket = FakeSocket.instances[0];
  const terminal = xterm.FakeTerminal.instances[0];
  if (!socket || !terminal) throw new Error("panel did not connect");
  return { view, socket, terminal, onClose };
};

describe("TerminalPanel", () => {
  it("connects to the session's terminal path on the page host", () => {
    const { socket, terminal } = mountPanel();
    expect(socket.url).toBe(`ws://${window.location.host}/ws/terminal/s%201`);
    expect(terminal.opened).toBe(screen.getByTestId("terminal-mount"));
    expect(screen.getByRole("status")).toHaveTextContent("CONNECTING");
  });

  it("streams output in and keystrokes and size out", () => {
    const { socket, terminal } = mountPanel();
    act(() => socket.open());
    expect(screen.getByRole("status")).toHaveTextContent("LIVE");
    expect(socket.sent).toEqual([{ type: "resize", cols: 90, rows: 24 }]);

    act(() => socket.message({ type: "output", data: "\u001b[32mhi\u001b[0m" }));
    expect(terminal.written).toEqual(["\u001b[32mhi\u001b[0m"]);

    terminal.dataListener?.("ls\r");
    terminal.resizeListener?.({ cols: 3, rows: 1000 });
    expect(socket.sent.slice(1)).toEqual([
      { type: "input", data: "ls\r" },
      { type: "resize", cols: 10, rows: 300 },
    ]);
  });

  it("shows the exit code when claude exits", () => {
    const { socket } = mountPanel();
    act(() => socket.open());
    act(() => {
      socket.message({ type: "exit", code: 0 });
      socket.emit("close");
    });
    expect(screen.getByRole("status")).toHaveTextContent("EXITED · 0");
    expect(screen.getByRole("alert")).toHaveTextContent("claude exited with code 0.");
  });

  it("shows the server's refusal", () => {
    const { socket } = mountPanel();
    act(() => {
      socket.message({ type: "error", message: "Unknown session s 1." });
      socket.emit("close");
    });
    expect(screen.getByRole("status")).toHaveTextContent("ERROR");
    expect(screen.getByRole("alert")).toHaveTextContent("Unknown session s 1.");
  });

  it("reports a dropped connection", () => {
    const { socket } = mountPanel();
    act(() => socket.open());
    act(() => socket.emit("close"));
    expect(screen.getByRole("alert")).toHaveTextContent("The terminal connection closed.");
  });

  it("closes the socket and the terminal on unmount, and Close calls onClose", () => {
    const { view, socket, terminal, onClose } = mountPanel();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(socket.closed).toBe(true);
    expect(terminal.disposed).toBe(true);
  });
});

describe("terminal helpers", () => {
  it("uses wss on https pages", () => {
    expect(terminalUrl({ protocol: "https:", host: "x:1" }, "abc")).toBe(
      "wss://x:1/ws/terminal/abc",
    );
  });

  it("clamps sizes to the protocol's limits", () => {
    expect(resizeMessage(1000.4, 2)).toEqual({ type: "resize", cols: 500, rows: 5 });
  });
});
