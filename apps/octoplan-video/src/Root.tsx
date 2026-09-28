import { Composition } from "remotion";
import { TOTAL_FRAMES, Tutorial } from "./Tutorial";
import { FPS } from "./theme";

export const Root = () => (
  <Composition
    id="Tutorial"
    component={Tutorial}
    durationInFrames={TOTAL_FRAMES}
    fps={FPS}
    width={1920}
    height={1080}
  />
);
