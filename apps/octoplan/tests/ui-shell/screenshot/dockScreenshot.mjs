// D14 check: build the dock harness, shoot it with headless Chrome/Edge (no scrolling), and
// assert from the rendered DOM that the answer dock sits fully inside the viewport.
// Run from apps/octoplan: node tests/ui-shell/screenshot/dockScreenshot.mjs [out.png]
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import react from "@vitejs/plugin-react";
import { build } from "vite";

const here = fileURLToPath(new URL(".", import.meta.url));
const outDir = mkdtempSync(join(tmpdir(), "octoplan-dock-"));
const png = resolve(process.argv[2] ?? join(outDir, "dock.png"));

await build({
  configFile: false,
  root: here,
  base: "./",
  logLevel: "warn",
  plugins: [react()],
  build: { outDir, emptyOutDir: true },
});

const browsers = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];
const browser = browsers.find((path) => existsSync(path));
if (!browser) throw new Error("No Chrome or Edge found for the headless screenshot");

const url = pathToFileURL(join(outDir, "index.html")).href;
const flags = [
  "--headless=new",
  "--disable-gpu",
  "--allow-file-access-from-files",
  "--hide-scrollbars",
  "--window-size=1440,900",
  "--virtual-time-budget=4000",
  `--user-data-dir=${join(outDir, "profile")}`,
];
execFileSync(browser, [...flags, `--screenshot=${png}`, url], { stdio: "ignore" });
const dom = execFileSync(browser, [...flags, "--dump-dom", url], { encoding: "utf8" });

const attr = (name) => new RegExp(`data-${name}="([^"]*)"`).exec(dom)?.[1];
const result = {
  dock: attr("dock"),
  rect: attr("dock-rect"),
  streamScrolls: attr("stream-scrolls"),
};
console.log(JSON.stringify({ screenshot: png, ...result }));
if (result.dock !== "visible" || result.streamScrolls !== "true") process.exit(1);
