// Captures real UI screenshots for the tutorial by driving headless Edge/Chrome over the
// DevTools protocol, so shots can include keyboard-only views (graph, idea capture, focus).
//
//   node tools/captureUi.mjs <shots.json> <outDir>
//
// shots.json: [{ "name": "cockpit", "url": "...", "steps": [ { "waitFor": "css" },
//   { "key": "g" }, { "clickText": "New session" }, { "click": "css" }, { "wait": 800 },
//   { "scroll": { "selector": "css", "top": 400 } } ] }]
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";

const [shotsPath, outDir] = process.argv.slice(2);
if (!shotsPath || !outDir) {
  console.error("Usage: node tools/captureUi.mjs <shots.json> <outDir>");
  process.exit(2);
}
const shots = JSON.parse(readFileSync(shotsPath, "utf8"));
mkdirSync(outDir, { recursive: true });

const BROWSERS = [
  process.env.CAPTURE_BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
].filter(Boolean);
const browserPath = BROWSERS.find((p) => existsSync(p));
if (!browserPath) throw new Error("No Edge/Chrome found; set CAPTURE_BROWSER");

const PORT = 9333;
const WIDTH = 1600;
const HEIGHT = 1000;
const browser = spawn(
  browserPath,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${join(tmpdir(), `octoplan-capture-${Date.now()}`)}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    "--hide-scrollbars",
    "--no-first-run",
    "--disable-gpu",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pageSocketUrl = async () => {
  for (let i = 0; i < 50; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = targets.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // browser still starting
    }
    await sleep(200);
  }
  throw new Error("DevTools endpoint did not come up");
};

const ws = new WebSocket(await pageSocketUrl());
await new Promise((r) => ws.once("open", r));
let nextId = 1;
const pending = new Map();
ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});
const cdp = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, (msg) =>
      msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result),
    );
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) =>
  (await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result
    ?.value;

const KEY_CODES = { Escape: ["Escape", 27], Enter: ["Enter", 13], Tab: ["Tab", 9] };
const press = async (key) => {
  const [code, vk] = KEY_CODES[key] ?? [`Key${key.toUpperCase()}`, key.toUpperCase().charCodeAt(0)];
  const text = key.length === 1 ? key : undefined;
  const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", ...base, ...(text ? { text } : {}) });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", ...base });
};

const waitFor = async (selector, timeoutMs = 20000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${selector}`);
};

await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", {
  width: WIDTH,
  height: HEIGHT,
  deviceScaleFactor: 2,
  mobile: false,
});

for (const shot of shots) {
  try {
    await cdp("Page.navigate", { url: shot.url });
    await sleep(1500);
    for (const step of shot.steps ?? []) {
      if (step.waitFor) await waitFor(step.waitFor, step.timeoutMs);
      if (step.key) await press(step.key);
      if (step.wait) await sleep(step.wait);
      if (step.click)
        await evaluate(`document.querySelector(${JSON.stringify(step.click)})?.click()`);
      if (step.clickText) {
        await evaluate(
          `[...document.querySelectorAll("button, a, [role=button]")].find((el) => el.textContent.trim().toLowerCase().includes(${JSON.stringify(step.clickText.toLowerCase())}))?.click()`,
        );
      }
      if (step.type) {
        await evaluate(
          `(() => { const el = document.querySelector(${JSON.stringify(step.type.selector)}); if (!el) return; const set = Object.getOwnPropertyDescriptor(el.__proto__, "value").set; set.call(el, ${JSON.stringify(step.type.text)}); el.dispatchEvent(new Event("input", { bubbles: true })); })()`,
        );
      }
      if (step.scrollIntoView) {
        await evaluate(
          `document.querySelector(${JSON.stringify(step.scrollIntoView)})?.scrollIntoView({ block: ${JSON.stringify(step.block ?? "center")} })`,
        );
      }
      if (step.select) {
        await evaluate(
          `(() => { const el = document.querySelector(${JSON.stringify(step.select.selector)}); if (!el) return; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(el, ${JSON.stringify(step.select.value)}); el.dispatchEvent(new Event("change", { bubbles: true })); })()`,
        );
      }
      if (step.eval) await evaluate(step.eval);
      // A real mouse click at CSS px (canvas views have no buttons to query).
      if (step.clickAt) {
        const [x, y] = step.clickAt;
        for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
          await cdp("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
        }
      }
      if (step.scroll) {
        await evaluate(
          `document.querySelector(${JSON.stringify(step.scroll.selector)})?.scrollTo(0, ${step.scroll.top})`,
        );
      }
    }
    await sleep(shot.settle ?? 900);
    const { data } = await cdp("Page.captureScreenshot", { format: "png" });
    const file = join(outDir, `${shot.name}.png`);
    writeFileSync(file, Buffer.from(data, "base64"));
    // Element boxes in CSS px (the screenshot's 2000x1250 space), so scenes can point at the
    // real UI instead of guessed coordinates. `rects: { name: "css selector" }`.
    if (shot.rects) {
      const rects = await evaluate(
        `(() => { const out = {}; for (const [name, sel] of Object.entries(${JSON.stringify(shot.rects)})) { const el = typeof sel === "string" && sel.startsWith("text=") ? [...document.querySelectorAll("button, a, h2, h3, span, p, label, li, summary, output, code")].find((e) => e.textContent.trim().toLowerCase().includes(sel.slice(5).toLowerCase())) : document.querySelector(sel); if (!el) continue; const r = el.getBoundingClientRect(); out[name] = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; } return out; })()`,
      );
      writeFileSync(join(outDir, `${shot.name}.json`), `${JSON.stringify(rects, null, 2)}\n`);
    }
    console.log(`captured ${shot.name} (${Math.round((data.length * 0.75) / 1024)} KB)`);
  } catch (error) {
    console.log(`FAILED ${shot.name}: ${error.message}`);
  }
}

ws.close();
browser.kill();
process.exit(0);
