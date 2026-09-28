// "Run Octogent" (D58–D61): shows whether Octogent runs for this repo's workspace and starts it
// in a visible terminal. The server does the work and reports `octogent-status` events; this
// component only asks, shows and sends.
import type { OctogentStatus } from "@octogent/octoplan-protocol";
import { useEffect, useRef, useState } from "react";
import { useOctoplan } from "../../app/useOctoplan";
import "./octogent.css";

/** How often to re-check while Octogent isn't running (it may be started by hand, too). */
export const STATUS_POLL_MS = 5000;

export const TRUST_NOTE =
  "In Octogent, the first Claude terminal may ask whether to trust this folder. Accept it, or that terminal's first prompt is lost.";

const CHIP: Record<OctogentStatus["state"], string> = {
  "not-initialized": "Not set up",
  "not-running": "Not running",
  starting: "Starting…",
  running: "Running",
  "not-responding": "Not responding",
};

const isUp = (status: OctogentStatus | undefined) =>
  status?.state === "running" || status?.state === "not-responding";

export const OctogentLaunch = ({
  repoPath,
  fallbackUrl,
}: {
  repoPath: string;
  /** A known Octogent URL (OCTOGENT_URL, via the handoff result) for before a status arrives. */
  fallbackUrl?: string | undefined;
}) => {
  const { state, sendClientEvent } = useOctoplan();
  const status = state.octogentStatusByRepo[repoPath];
  /** The status seen when Run was clicked; the click is pending until a newer one arrives. */
  const [clickedAt, setClickedAt] = useState<OctogentStatus | undefined | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const running = status?.state === "running";

  const sendRef = useRef(sendClientEvent);
  sendRef.current = sendClientEvent;
  useEffect(() => {
    sendRef.current({ type: "request-octogent-status", repoPath });
    if (running) return;
    const timer = setInterval(
      () => sendRef.current({ type: "request-octogent-status", repoPath }),
      STATUS_POLL_MS,
    );
    return () => clearInterval(timer);
  }, [repoPath, running]);

  const pending = clickedAt !== null && status === clickedAt;
  const starting = pending || status?.state === "starting";
  const openUrl = isUp(status) ? status?.url : fallbackUrl;
  const canRun = status?.cliAvailable === true && !isUp(status) && !starting;

  const run = () => {
    if (sendClientEvent({ type: "launch-octogent", repoPath })) setClickedAt(status);
  };

  const copy = async (text: string) => {
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      setCopyNote("Copied.");
    } catch {
      setCopyNote("Couldn't copy — select the command and press Ctrl+C.");
    }
  };

  const chipState = starting ? "starting" : status?.state;
  return (
    <section className="op-og" aria-label="Octogent" data-testid="octogent-launch">
      <div className="op-og-row">
        <output className={`op-og-chip op-og-chip--${chipState ?? "unknown"}`}>
          {chipState ? CHIP[chipState] : "Checking…"}
          {running && status?.port ? ` :${status.port}` : ""}
        </output>
        {openUrl ? (
          <a
            className="op-button op-button--primary"
            href={openUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open Octogent
          </a>
        ) : null}
        {canRun ? (
          <button type="button" className="op-button op-button--primary" onClick={run}>
            Run Octogent
          </button>
        ) : null}
      </div>
      {status ? (
        <p className="op-og-message">{pending ? "Starting Octogent…" : status.message}</p>
      ) : null}
      {status?.workspace ? (
        <p className="op-og-where">
          Folder: <code>{status.workspace}</code>
        </p>
      ) : null}
      {status?.manualCommand ? (
        <div className="op-og-manual">
          <code>{status.manualCommand}</code>
          <button
            type="button"
            className="op-button"
            onClick={() => copy(status.manualCommand ?? "")}
          >
            Copy
          </button>
          {copyNote ? <output className="op-og-copy-note">{copyNote}</output> : null}
        </div>
      ) : null}
      {running ? <p className="op-og-hint">{TRUST_NOTE}</p> : null}
    </section>
  );
};
