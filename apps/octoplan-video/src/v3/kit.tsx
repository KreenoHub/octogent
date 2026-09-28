// Building blocks for the v3 tutorial: tours over real screenshots driven by "beats" (where the
// camera looks, what gets highlighted, where the cursor clicks) plus captions, all timed in frames.
import type { ReactNode } from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop, Center } from "../components/Bits";
import { Caption, Kicker, LowerThird } from "../components/Caption";
import { type Cam, type Mark, type Point, Shot } from "../components/Shot";
import { C, FONT, SHOT_H, SHOT_W } from "../theme";
import { RECTS } from "./rects";

export type Box = readonly [number, number, number, number];

/** captureUi records boxes in the 1600x1000 CSS viewport; screenshots are drawn in 2000x1250. */
const CAPTURE_SCALE = SHOT_W / 1600;

/** A recorded element box in screenshot space, or `fallback` when it wasn't captured. */
export const R = (shot: string, name: string, fallback?: Box): Box => {
  const rect = RECTS[shot]?.[name];
  if (!rect) {
    if (fallback) return fallback;
    throw new Error(`No rect ${shot}.${name}`);
  }
  const [x, y, w, h] = rect;
  return [x * CAPTURE_SCALE, y * CAPTURE_SCALE, w * CAPTURE_SCALE, h * CAPTURE_SCALE];
};

/** Pads a box on every side (screenshot px). */
export const pad = ([x, y, w, h]: Box, p = 8): Box => [x - p, y - p, w + p * 2, h + p * 2];

export type Beat = {
  /** Frame the beat starts. */
  at: number;
  /** Where the camera goes: a box (fitted), "full", or nothing (stay). */
  focus?: Box | "full";
  /** Override the fitted zoom. */
  zoom?: number;
  /** Highlight a box from this beat until `until` (default: the next beat). */
  mark?: { box: Box; label?: string; side?: Mark["side"]; color?: string; until?: number };
  /** Move the cursor here and click (arrives at `at + 14`). */
  click?: Box;
};

export type Line = { at: number; text: string; kicker?: string };

const fitZoom = ([, , w, h]: Box) =>
  Math.max(1, Math.min(2.4, Math.min(SHOT_W / (w + 360), (SHOT_H - 260) / (h + 220))));

const center = ([x, y, w, h]: Box) => ({ x: x + w / 2, y: y + h / 2 });

/** The smallest box around both. */
export const union = (a: Box, b: Box): Box => {
  const x = Math.min(a[0], b[0]);
  const y = Math.min(a[1], b[1]);
  return [x, y, Math.max(a[0] + a[2], b[0] + b[2]) - x, Math.max(a[1] + a[3], b[1] + b[3]) - y];
};

/** Keeps the camera inside the screenshot so a zoom near an edge never shows empty space. */
const clampCam = (x: number, y: number, zoom: number) => {
  const halfW = SHOT_W / (2 * zoom);
  const halfH = (SHOT_W * (1080 / 1920)) / (2 * zoom);
  return {
    x: Math.min(Math.max(x, halfW), SHOT_W - halfW),
    y: Math.min(Math.max(y, halfH), SHOT_H - halfH),
  };
};

/** A screenshot tour: camera, highlights, cursor and lower-third captions from beats and lines. */
export const Tour = ({
  src,
  beats,
  lines,
  end,
}: {
  src: string;
  beats: readonly Beat[];
  lines: readonly Line[];
  /** Scene length, so the last caption and highlight can run to the end. */
  end: number;
}) => {
  const cams: Cam[] = [{ at: 0, x: SHOT_W / 2, y: SHOT_H / 2, zoom: 1 }];
  const marks: Mark[] = [];
  const cursor: Point[] = [];
  beats.forEach((beat, i) => {
    const next = beats[i + 1]?.at ?? end;
    if (beat.focus === "full") {
      cams.push({ at: beat.at + 22, x: SHOT_W / 2, y: SHOT_H / 2, zoom: 1 });
    } else if (beat.focus) {
      const c = center(beat.focus);
      const zoom = beat.zoom ?? fitZoom(beat.focus);
      // Nudge the view down a little so the focus clears the caption bar at the bottom.
      const a = clampCam(c.x, c.y + 70 / zoom, zoom);
      const b = clampCam(c.x, c.y + 70 / zoom, zoom * 1.03);
      cams.push({ at: beat.at + 22, ...a, zoom });
      cams.push({ at: next, ...b, zoom: zoom * 1.03 });
    }
    if (beat.mark) {
      marks.push({
        from: beat.at + 16,
        to: beat.mark.until ?? next - 4,
        box: beat.mark.box as [number, number, number, number],
        ...(beat.mark.label ? { label: beat.mark.label } : {}),
        ...(beat.mark.side ? { side: beat.mark.side } : {}),
        ...(beat.mark.color ? { color: beat.mark.color } : {}),
      });
    }
    if (beat.click) {
      const c = center(beat.click);
      const last = cursor.at(-1);
      cursor.push({ at: beat.at, x: last?.x ?? c.x + 160, y: last?.y ?? c.y + 120 });
      cursor.push({ at: beat.at + 14, x: c.x, y: c.y, click: true });
    }
  });
  cams.sort((a, b) => a.at - b.at);
  return (
    <AbsoluteFill>
      <Shot src={src} cams={cams} marks={marks} cursor={cursor} />
      {lines.map((line, i) => (
        <LowerThird
          key={`${line.at}-${i}`}
          text={line.text}
          from={line.at}
          {...(line.kicker ? { kicker: line.kicker } : {})}
          {...(lines[i + 1] ? { exitAt: (lines[i + 1] as Line).at - 8 } : {})}
        />
      ))}
    </AbsoluteFill>
  );
};

/** A full-screen chapter card: "PART 1 · PLAN IT". */
export const Chapter = ({ part, title, sub }: { part: string; title: string; sub: string }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14, stiffness: 140 } });
  return (
    <Backdrop>
      <Center style={{ gap: 26 }}>
        <Kicker text={part} from={0} />
        <div
          style={{
            fontFamily: FONT.pixel,
            fontSize: 132,
            color: C.amber,
            transform: `scale(${0.85 + 0.15 * s})`,
            opacity: s,
            textShadow: `0 0 60px ${C.amber}55`,
          }}
        >
          {title}
        </div>
        <Caption text={sub} from={14} size={48} weight={600} />
      </Center>
    </Backdrop>
  );
};

/** The seven steps as a row of chips; `active` lights up to that index, one by one. */
export const StepChips = ({
  labels,
  from = 0,
  every = 14,
  size = 30,
}: {
  labels: readonly string[];
  from?: number;
  every?: number;
  size?: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
      {labels.map((label, i) => {
        const t = frame - from - i * every;
        const s = spring({ frame: t, fps, config: { damping: 13, stiffness: 180 } });
        const lit = t > 8;
        return (
          <div
            key={label}
            style={{
              padding: `${size * 0.45}px ${size * 0.8}px`,
              fontFamily: FONT.mono,
              fontWeight: 700,
              fontSize: size,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: lit ? C.amber : C.muted,
              border: `3px solid ${lit ? C.amber : C.border}`,
              background: C.surface,
              opacity: s,
              transform: `translateY(${(1 - s) * 30}px)`,
              boxShadow: lit ? `0 0 24px ${C.amber}44` : "none",
            }}
          >
            {i + 1} {label}
          </div>
        );
      })}
    </div>
  );
};

/** Fades a whole scene in at the start (for scenes without their own entrance). */
export const FadeIn = ({ children }: { children: ReactNode }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        opacity: interpolate(frame, [0, 10], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
