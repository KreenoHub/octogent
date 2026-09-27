import {
  type TerminalClientMessage,
  terminalPath,
  terminalServerMessageSchema,
} from "@octogent/octoplan-protocol";
// Pop-out terminal (D3): xterm + fit addon on the session's own socket, /ws/terminal/<id>,
// which runs `claude --resume <claudeSessionId>` in the session's repo. Styled like Octogent's
// terminal (apps/web/src/components/Terminal.tsx, read, not imported).
import { FitAddon } from "@xterm/addon-fit";
import { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import "xterm/css/xterm.css";
import "./terminal.css";

export type TerminalPanelProps = { sessionId: string; onClose: () => void };

export type TerminalState =
  | { kind: "connecting" }
  | { kind: "open" }
  | { kind: "exited"; code: number | null }
  | { kind: "error"; message: string };

export const terminalUrl = (location: Pick<Location, "protocol" | "host">, sessionId: string) =>
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${terminalPath(sessionId)}`;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)));

/** The server's schema only accepts 10–500 columns and 5–300 rows. */
export const resizeMessage = (cols: number, rows: number): TerminalClientMessage => ({
  type: "resize",
  cols: clamp(cols, 10, 500),
  rows: clamp(rows, 5, 300),
});

const statusLabel = (state: TerminalState) => {
  switch (state.kind) {
    case "connecting":
      return "CONNECTING";
    case "open":
      return "LIVE";
    case "exited":
      return state.code === null ? "EXITED" : `EXITED · ${state.code}`;
    case "error":
      return "ERROR";
  }
};

export const TerminalPanel = ({ sessionId, onClose }: TerminalPanelProps) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<TerminalState>({ kind: "connecting" });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    setState({ kind: "connecting" });
    const styles = window.getComputedStyle(document.documentElement);
    const background = styles.getPropertyValue("--terminal-bg").trim() || "#101722";
    const rootFontSize = Number.parseFloat(styles.fontSize);
    const terminal = new Terminal({
      cursorBlink: true,
      cursorInactiveStyle: "bar",
      cursorStyle: "bar",
      cursorWidth: 2,
      fontFamily: '"JetBrains Mono", "IBM Plex Mono", monospace',
      fontSize: Number.isFinite(rootFontSize) ? Math.max(13, Math.round(rootFontSize * 0.82)) : 13,
      theme: { background, foreground: "#f0f0f0", cursor: "#faa32c", cursorAccent: background },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(mount);
    const safeFit = () => {
      try {
        fit.fit();
      } catch {
        // A hidden or zero-size mount can't be measured; the next resize fits it.
      }
    };
    safeFit();
    terminal.focus();

    let finished = false;
    const socket = new WebSocket(terminalUrl(window.location, sessionId));
    const send = (message: TerminalClientMessage) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    };
    socket.addEventListener("open", () => {
      setState({ kind: "open" });
      send(resizeMessage(terminal.cols, terminal.rows));
    });
    socket.addEventListener("message", (event) => {
      let json: unknown;
      try {
        json = JSON.parse(String(event.data));
      } catch {
        return;
      }
      const parsed = terminalServerMessageSchema.safeParse(json);
      if (!parsed.success) return;
      const message = parsed.data;
      if (message.type === "output") {
        terminal.write(message.data);
      } else if (message.type === "exit") {
        finished = true;
        setState({ kind: "exited", code: message.code });
      } else {
        finished = true;
        setState({ kind: "error", message: message.message });
      }
    });
    socket.addEventListener("close", () => {
      if (!finished) {
        finished = true;
        setState({ kind: "error", message: "The terminal connection closed." });
      }
    });

    const dataDisposable = terminal.onData((data) => send({ type: "input", data }));
    const resizeDisposable = terminal.onResize(({ cols, rows }) => send(resizeMessage(cols, rows)));
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => safeFit());
    observer?.observe(mount);

    return () => {
      finished = true;
      observer?.disconnect();
      dataDisposable.dispose();
      resizeDisposable.dispose();
      socket.close();
      terminal.dispose();
    };
  }, [sessionId]);

  const ended = state.kind === "exited" || state.kind === "error";

  return (
    <section className="op-terminal" aria-label="Claude terminal" data-session-id={sessionId}>
      <header className="op-terminal-header">
        <span className="op-terminal-title">CLAUDE · --resume</span>
        <output className={`op-terminal-status op-terminal-status--${state.kind}`}>
          {statusLabel(state)}
        </output>
        <button type="button" className="op-terminal-close" onClick={onClose}>
          Close
        </button>
      </header>
      <div className="op-terminal-body">
        <div className="op-terminal-mount" ref={mountRef} data-testid="terminal-mount" />
        {ended ? (
          <div className="op-terminal-overlay" role="alert">
            {state.kind === "error"
              ? state.message
              : `claude exited${state.code === null ? "" : ` with code ${state.code}`}.`}
          </div>
        ) : null}
      </div>
    </section>
  );
};
