// Starts the Octoplan server and the Vite web dev server together; Ctrl+C stops both.
import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const children = [
  spawn("pnpm", ["run", "dev:server"], { stdio: "inherit", shell: isWindows }),
  spawn("pnpm", ["run", "dev:web"], { stdio: "inherit", shell: isWindows }),
];

const stopAll = () => {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
};

for (const child of children) {
  child.on("exit", (code) => {
    stopAll();
    process.exit(code ?? 0);
  });
}

process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);
