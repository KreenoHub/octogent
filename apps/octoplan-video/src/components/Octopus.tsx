import { useCurrentFrame } from "remotion";
import { C } from "../theme";

// Pixel octopus in Octogent's mascot style: a blocky head with two eyes and wiggling legs.
const HEAD = [
  "..XXXXXX..",
  ".XXXXXXXX.",
  "XXXXXXXXXX",
  "XX..XX..XX",
  "XX..XX..XX",
  "XXXXXXXXXX",
  "XXXXXXXXXX",
];

export const Octopus = ({
  size = 220,
  color = C.amber,
  legs = 6,
  wiggle = true,
}: {
  size?: number;
  color?: string;
  legs?: number;
  wiggle?: boolean;
}) => {
  const frame = useCurrentFrame();
  const px = size / 10;
  const bob = wiggle ? Math.sin(frame / 9) * px * 0.3 : 0;
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: px * 11,
        transform: `translateY(${bob}px)`,
      }}
    >
      {HEAD.map((row, y) =>
        [...row].map((cell, x) =>
          cell === "X" ? (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed pixel grid, never reordered
              key={`${x}-${y}`}
              style={{
                position: "absolute",
                left: x * px,
                top: y * px,
                width: px + 0.5,
                height: px + 0.5,
                background: color,
              }}
            />
          ) : null,
        ),
      )}
      {Array.from({ length: legs }, (_, i) => {
        const x = ((i + 0.5) * 10) / legs;
        const swing = wiggle ? Math.sin(frame / 6 + i) * px * 0.5 : 0;
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed set of legs, never reordered
            key={`leg-${i}`}
            style={{
              position: "absolute",
              left: x * px - px / 2 + swing,
              top: 7 * px,
              width: px,
              height: px * (i % 2 === 0 ? 3.4 : 2.6),
              background: color,
            }}
          />
        );
      })}
    </div>
  );
};
