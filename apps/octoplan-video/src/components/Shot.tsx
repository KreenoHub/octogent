import {
  Easing,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, FONT, SHOT_H, SHOT_W } from "../theme";

/** Camera keyframe: center point (screenshot CSS px) and zoom (1 = whole width fits). */
export type Cam = { at: number; x: number; y: number; zoom: number };
/** Box in screenshot CSS px, visible between `from` and `to` (frames). */
export type Mark = {
  from: number;
  to: number;
  box: [number, number, number, number];
  label?: string;
  side?: "top" | "bottom" | "left" | "right";
  color?: string;
};
/** Cursor path point in screenshot CSS px; `click` shows a ripple. */
export type Point = { at: number; x: number; y: number; click?: boolean };

const VIEW_W = 1920;
const VIEW_H = 1080;
const BASE = VIEW_W / SHOT_W;

const ease = Easing.bezier(0.45, 0, 0.2, 1);

const camAt = (cams: readonly Cam[], frame: number) => {
  const first = cams[0] ?? { at: 0, x: SHOT_W / 2, y: SHOT_H / 2, zoom: 1 };
  if (frame <= first.at || cams.length === 1) return first;
  for (let i = 1; i < cams.length; i++) {
    const a = cams[i - 1] as Cam;
    const b = cams[i] as Cam;
    if (frame <= b.at) {
      const t = ease(Math.min(1, Math.max(0, (frame - a.at) / Math.max(1, b.at - a.at))));
      return {
        at: frame,
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        zoom: a.zoom + (b.zoom - a.zoom) * t,
      };
    }
  }
  return cams[cams.length - 1] as Cam;
};

const pointAt = (points: readonly Point[], frame: number) => {
  let current = points[0];
  if (!current) return null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Point;
    const b = points[i] as Point;
    if (frame <= b.at) {
      const t = ease(Math.min(1, Math.max(0, (frame - a.at) / Math.max(1, b.at - a.at))));
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    current = b;
  }
  return { x: current.x, y: current.y };
};

export const Shot = ({
  src,
  cams,
  marks = [],
  cursor = [],
  dim = 0,
}: {
  src: string;
  cams: readonly Cam[];
  marks?: readonly Mark[];
  cursor?: readonly Point[];
  /** Darken the screenshot (0..1) so captions read better. */
  dim?: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cam = camAt(cams, frame);
  const s = BASE * cam.zoom;
  const tx = VIEW_W / 2 - cam.x * s;
  const ty = VIEW_H / 2 - cam.y * s;
  const pos = cursor.length > 0 ? pointAt(cursor, frame) : null;

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: C.bg }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: SHOT_W,
          height: SHOT_H,
          transformOrigin: "0 0",
          transform: `translate(${tx}px, ${ty}px) scale(${s})`,
        }}
      >
        <Img
          src={staticFile(`shots/${src}.png`)}
          style={{ width: SHOT_W, height: SHOT_H, display: "block" }}
        />
        {dim > 0 ? (
          <div style={{ position: "absolute", inset: 0, background: `rgba(5,6,7,${dim})` }} />
        ) : null}

        {marks.map((mark, i) => {
          if (frame < mark.from - 2 || frame > mark.to + 10) return null;
          const inS = spring({
            frame: frame - mark.from,
            fps,
            config: { damping: 13, stiffness: 170 },
          });
          const out = interpolate(frame, [mark.to, mark.to + 10], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const pulse = 0.55 + 0.45 * Math.sin((frame - mark.from) / 5);
          const [x, y, w, h] = mark.box;
          const color = mark.color ?? C.amber;
          const inv = 1 / s;
          const side = mark.side ?? "bottom";
          const labelStyle =
            side === "top"
              ? { left: 0, bottom: h + 14 * inv }
              : side === "left"
                ? { right: w + 16 * inv, top: 0 }
                : side === "right"
                  ? { left: w + 16 * inv, top: 0 }
                  : { left: 0, top: h + 14 * inv };
          return (
            <div
              key={`${i}-${mark.from}`}
              style={{
                position: "absolute",
                left: x,
                top: y,
                width: w,
                height: h,
                opacity: inS * out,
                transform: `scale(${1.08 - 0.08 * inS})`,
                transformOrigin: "center",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: -6 * inv,
                  border: `${4 * inv}px solid ${color}`,
                  borderRadius: 10 * inv,
                  boxShadow: `0 0 ${28 * inv * pulse}px ${color}, inset 0 0 ${18 * inv * pulse}px ${color}55`,
                }}
              />
              {mark.label ? (
                <div
                  style={{
                    position: "absolute",
                    ...labelStyle,
                    whiteSpace: "nowrap",
                    padding: `${8 * inv}px ${16 * inv}px`,
                    background: color,
                    color: C.bg,
                    fontFamily: FONT.sans,
                    fontWeight: 800,
                    fontSize: 30 * inv,
                    borderRadius: 8 * inv,
                    boxShadow: `0 ${6 * inv}px ${24 * inv}px rgba(0,0,0,.6)`,
                  }}
                >
                  {mark.label}
                </div>
              ) : null}
            </div>
          );
        })}

        {pos ? (
          <div
            style={{
              position: "absolute",
              left: pos.x,
              top: pos.y,
              transform: `scale(${1 / s})`,
              transformOrigin: "0 0",
            }}
          >
            {cursor
              .filter((p) => p.click && frame >= p.at && frame < p.at + 18)
              .map((p) => {
                const t = (frame - p.at) / 18;
                return (
                  <div
                    key={p.at}
                    style={{
                      position: "absolute",
                      left: -40 * t,
                      top: -40 * t,
                      width: 80 * t,
                      height: 80 * t,
                      borderRadius: "50%",
                      border: `4px solid ${C.amber}`,
                      opacity: 1 - t,
                    }}
                  />
                );
              })}
            <svg
              width="44"
              height="54"
              viewBox="0 0 22 27"
              style={{ filter: "drop-shadow(0 4px 8px rgba(0,0,0,.7))" }}
            >
              <title>cursor</title>
              <path
                d="M1 1 L1 22 L7 16 L11 25 L14 24 L10 15 L18 15 Z"
                fill="#fff"
                stroke="#000"
                strokeWidth="1.4"
              />
            </svg>
          </div>
        ) : null}
      </div>
    </div>
  );
};
