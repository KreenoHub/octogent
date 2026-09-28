import type { CSSProperties, ReactNode } from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT } from "../theme";

/** Pixel keyboard key that pops in, then presses down at `pressAt`. */
export const KeyCap = ({
  k,
  from = 0,
  pressAt,
  size = 110,
}: { k: string; from?: number; pressAt?: number; size?: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - from, fps, config: { damping: 11, stiffness: 180 } });
  const pressed = pressAt !== undefined && frame >= pressAt && frame < pressAt + 6;
  return (
    <div
      style={{
        width: size * (k.length > 2 ? 1.9 : 1),
        height: size,
        borderRadius: size * 0.16,
        background: pressed ? C.amberDeep : C.surface2,
        border: `3px solid ${C.amber}`,
        boxShadow: pressed
          ? `0 2px 0 ${C.amberDeep}`
          : `0 ${size * 0.1}px 0 ${C.amberDeep}, 0 0 30px ${C.amber}44`,
        transform: `translateY(${pressed ? size * 0.08 : 0}px) scale(${pop})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // Bold sans, not the pixel font: in Silkscreen a P reads like an F.
        fontFamily: FONT.sans,
        fontWeight: 900,
        fontSize: size * (k.length > 2 ? 0.3 : 0.5),
        color: pressed ? C.bg : C.amber,
      }}
    >
      {k}
    </div>
  );
};

/** Background: deep black with a faint amber grid that drifts. */
export const Backdrop = ({ children, glow = C.amber }: { children?: ReactNode; glow?: string }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: "absolute", inset: 0, background: C.bg, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: -80,
          backgroundImage: `linear-gradient(${C.border}55 1px, transparent 1px), linear-gradient(90deg, ${C.border}55 1px, transparent 1px)`,
          backgroundSize: "80px 80px",
          transform: `translate(${(frame * 0.4) % 80}px, ${(frame * 0.25) % 80}px)`,
          opacity: 0.35,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 70% 20%, ${glow}22, transparent 55%), radial-gradient(circle at 15% 85%, ${C.red}33, transparent 50%)`,
        }}
      />
      {children}
    </div>
  );
};

export const Center = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 36,
      padding: "0 140px",
      ...style,
    }}
  >
    {children}
  </div>
);

/** A card that springs in (used for pain points, steps, the two-tools split). */
export const PopCard = ({
  from,
  children,
  style,
  accent = C.amber,
}: {
  from: number;
  children: ReactNode;
  style?: CSSProperties;
  accent?: string;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - from, fps, config: { damping: 13, stiffness: 150 } });
  return (
    <div
      style={{
        background: `${C.surface}ee`,
        border: `2px solid ${accent}`,
        borderRadius: 18,
        padding: "34px 38px",
        boxShadow: `0 20px 60px rgba(0,0,0,.55), 0 0 40px ${accent}22`,
        transform: `translateY(${(1 - s) * 60}px) scale(${0.85 + 0.15 * s})`,
        opacity: s,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Terminal-style command chip. */
export const Cmd = ({ children, from = 0 }: { children: string; from?: number }) => {
  const frame = useCurrentFrame();
  const shown = Math.max(0, Math.floor((frame - from) * 1.6));
  return (
    <div
      style={{
        fontFamily: FONT.mono,
        fontSize: 34,
        color: C.green,
        background: "#07090c",
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "16px 26px",
      }}
    >
      <span style={{ color: C.muted }}>{"> "}</span>
      {children.slice(0, shown)}
      <span style={{ opacity: frame % 20 < 10 ? 1 : 0 }}>▌</span>
    </div>
  );
};

/** Fades a whole scene in and out so hard cuts feel intentional. */
export const SceneFade = ({ children, duration }: { children: ReactNode; duration: number }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 8, duration - 8, duration], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <div style={{ position: "absolute", inset: 0, opacity: o }}>{children}</div>;
};
