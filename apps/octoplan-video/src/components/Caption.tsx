import type { CSSProperties } from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT } from "../theme";

/**
 * Splits emphasis that may span several words: "*Claude Code*" paints both words amber.
 * A word opening with * or _ starts a run; a word whose text ends with the marker (before
 * trailing punctuation) closes it.
 */
export const emphasize = (words: readonly string[]) => {
  let mode: "amber" | "green" | null = null;
  return words.map((raw) => {
    let word = raw;
    let current = mode;
    if (!current && /^[*_]/.test(word)) {
      current = word.startsWith("*") ? "amber" : "green";
      word = word.slice(1);
    }
    const marker = current === "amber" ? "*" : "_";
    const closing = current ? new RegExp(`\\${marker}([.,!?:;)]*)$`) : null;
    if (closing?.test(word)) {
      word = word.replace(closing, "$1");
      mode = null;
    } else {
      mode = current;
    }
    return { raw, word, amber: current === "amber", green: current === "green" };
  });
};

/**
 * Kinetic caption: words spring up one after another. Wrap words in *stars* to paint
 * them amber, in _underscores_ for green.
 */
export const Caption = ({
  text,
  from = 0,
  size = 64,
  align = "center",
  stagger = 3,
  weight = 800,
  style,
  exitAt,
}: {
  text: string;
  from?: number;
  size?: number;
  align?: "center" | "left";
  stagger?: number;
  weight?: number;
  style?: CSSProperties;
  exitAt?: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(" ");
  const exit =
    exitAt === undefined
      ? 1
      : interpolate(frame, [exitAt, exitAt + 8], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: align === "center" ? "center" : "flex-start",
        gap: `0 ${size * 0.28}px`,
        fontFamily: FONT.sans,
        fontWeight: weight,
        fontSize: size,
        lineHeight: 1.15,
        letterSpacing: "-0.01em",
        color: C.text,
        // Keeps captions legible over busy screenshots and the scrolling terminal.
        textShadow: "0 4px 24px rgba(0,0,0,.85), 0 0 2px rgba(0,0,0,.9)",
        opacity: exit,
        ...style,
      }}
    >
      {emphasize(words).map(({ raw, word, amber, green }, i) => {
        const s = spring({
          frame: frame - from - i * stagger,
          fps,
          config: { damping: 14, stiffness: 160 },
        });
        return (
          <span
            key={`${i}-${raw}`}
            style={{
              display: "inline-block",
              transform: `translateY(${(1 - s) * size * 0.7}px) scale(${0.9 + 0.1 * s})`,
              opacity: s,
              color: amber ? C.amber : green ? C.green : undefined,
              textShadow: amber ? `0 0 ${size * 0.4}px ${C.amber}55` : undefined,
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};

/** Small uppercase label above a caption ("STEP 2", "OCTOPLAN"). */
export const Kicker = ({
  text,
  from = 0,
  color = C.amber,
}: { text: string; from?: number; color?: string }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame - from, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const x = interpolate(frame - from, [0, 12], [-20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        fontFamily: FONT.pixel,
        fontSize: 30,
        letterSpacing: "0.14em",
        color,
        opacity: o,
        transform: `translateX(${x}px)`,
      }}
    >
      {text}
    </div>
  );
};

/** Lower-third caption bar used over screenshots. */
export const LowerThird = ({
  kicker,
  text,
  from = 0,
  exitAt,
}: {
  kicker?: string;
  text: string;
  from?: number;
  exitAt?: number;
}) => {
  const frame = useCurrentFrame();
  const inO = interpolate(frame - from, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const outO =
    exitAt === undefined
      ? 1
      : interpolate(frame, [exitAt, exitAt + 8], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        padding: "70px 110px 64px",
        background: `linear-gradient(180deg, transparent, ${C.bg}ee 38%, ${C.bg})`,
        opacity: inO * outO,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {kicker ? <Kicker text={kicker} from={from} /> : null}
      <Caption text={text} from={from + 4} size={50} align="left" stagger={2} />
    </div>
  );
};
