// Production PtyFactory for the pop-out terminal. main.ts passes it as `deps.spawnPty`
// (wired by the octopus); tests always inject a fake instead.
import { spawn } from "node-pty";
import type { PtyFactory } from "./types";

export const createNodePtyFactory = (): PtyFactory => (file, args, options) => {
  const pty = spawn(file, args, { ...options, name: "xterm-256color" });
  return {
    onData: (listener) => {
      pty.onData(listener);
    },
    onExit: (listener) => {
      pty.onExit(({ exitCode }) => listener({ exitCode }));
    },
    write: (data) => pty.write(data),
    resize: (cols, rows) => pty.resize(cols, rows),
    kill: () => pty.kill(),
  };
};
