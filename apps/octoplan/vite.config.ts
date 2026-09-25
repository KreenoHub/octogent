import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const serverOrigin = `http://127.0.0.1:${process.env.OCTOPLAN_PORT ?? "8790"}`;
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: here("./web"),
  // Reuse Octogent's favicon and assets rather than copying them.
  publicDir: here("../web/public"),
  plugins: [react()],
  build: {
    outDir: here("./dist/web"),
    emptyOutDir: true,
  },
  server: {
    // Explicit IPv4 loopback: "localhost" binds only [::1] on Windows, and D4 keeps Octoplan local-only.
    host: "127.0.0.1",
    port: Number.parseInt(process.env.OCTOPLAN_WEB_PORT ?? "5190", 10),
    proxy: {
      "/api": { target: serverOrigin, changeOrigin: true },
      "/ws": { target: serverOrigin.replace("http", "ws"), ws: true },
    },
  },
  test: {
    root: here("."),
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: [here("./tests/setup.ts")],
  },
} as never);
