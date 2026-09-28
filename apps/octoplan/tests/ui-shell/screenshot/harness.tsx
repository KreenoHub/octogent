// Headless-screenshot harness for the D14 answer dock: the real cockpit on a fake feed with a
// long stream and a pending round. Built and shot by dockScreenshot.mjs; not part of the app.
import type { MessageBlock, ServerEvent } from "@octogent/octoplan-protocol";
import { createRoot } from "react-dom/client";
import { createFakeTransport } from "../../../web/src/app/transport";
import { OctoplanProvider } from "../../../web/src/app/useOctoplan";
import { CockpitLayout } from "../../../web/src/components/CockpitLayout";
import "../../../web/src/styles.css";
import { round, sectionBlock, session, toolBlock } from "../fixtures";

const transport = createFakeTransport();
const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
createRoot(root).render(
  <OctoplanProvider transport={transport}>
    <CockpitLayout />
  </OctoplanProvider>,
);

const block = (b: MessageBlock): ServerEvent => ({
  type: "block",
  sessionId: "s1",
  block: b,
});

setTimeout(() => {
  const events: ServerEvent[] = [
    { type: "hello", protocolVersion: 1, serverVersion: "screenshot" },
    { type: "sessions", sessions: [session({ status: "waiting-for-answer" })] },
  ];
  for (let turn = 0; turn < 25; turn++) {
    events.push(block(sectionBlock(`p${turn}`, `Reply part ${turn + 1}`, 30)));
    events.push(block(toolBlock(`t${turn}a`, "Read", "Read · docs/plan/DECISIONS.md")));
    events.push(block(toolBlock(`t${turn}b`, "mcp__octoplan__plan_record_decision", "D14")));
  }
  events.push(block(sectionBlock("latest", "Why the dock matters", 8)));
  events.push({ type: "question-round", round: round() });
  events.push(block({ kind: "question-round", id: "b-r1", roundId: "r1", at: "x" }));
  for (const event of events) transport.emit(event);

  // Report geometry for the script: the dock must sit fully inside the viewport, unscrolled.
  requestAnimationFrame(() => {
    const dock = document.getElementById("op-answer-dock")?.getBoundingClientRect();
    const stream = document.querySelector(".op-stream");
    const visible =
      !!dock && dock.top >= 0 && dock.bottom <= window.innerHeight && dock.height > 40;
    document.body.dataset.dock = visible ? "visible" : "hidden";
    document.body.dataset.dockRect = dock
      ? `${Math.round(dock.top)}-${Math.round(dock.bottom)}`
      : "";
    document.body.dataset.streamScrolls = String(
      !!stream && stream.scrollHeight > stream.clientHeight,
    );
  });
}, 50);
