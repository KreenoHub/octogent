import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadPixel } from "@remotion/google-fonts/Silkscreen";

// Octogent's palette (apps/web/src/styles/foundation.css + console-theme-tokens.css).
export const C = {
  bg: "#050607",
  surface: "#0b0d10",
  surface2: "#12151b",
  border: "#2b2f36",
  text: "#e6e8ec",
  muted: "#a9b0ba",
  amber: "#faa32c",
  amberDeep: "#d6a21a",
  red: "#8c0b12",
  green: "#25d366",
  blue: "#1e59a3",
  pink: "#ff4df0",
  cyan: "#00c8ff",
} as const;

export const FONT = {
  pixel: loadPixel().fontFamily,
  sans: loadInter("normal", { weights: ["500", "700", "800", "900"] }).fontFamily,
  mono: loadMono("normal", { weights: ["400", "700"] }).fontFamily,
};

export const FPS = 30;
export const sec = (s: number) => Math.round(s * FPS);

/** Screenshots are 3200x2000 (2x); all coordinates use their 2000x1250 CSS-pixel space. */
export const SHOT_W = 2000;
export const SHOT_H = 1250;
