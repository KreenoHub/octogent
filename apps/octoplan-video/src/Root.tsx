import { Composition } from "remotion";
import { TOTAL_FRAMES, Tutorial } from "./Tutorial";
import { FPS } from "./theme";
import { TOTAL_FRAMES_V3, TutorialV3 } from "./v3/TutorialV3";

export const Root = () => (
  <>
    <Composition
      id="Tutorial"
      component={Tutorial}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
    />
    <Composition
      id="TutorialV3"
      component={TutorialV3}
      durationInFrames={TOTAL_FRAMES_V3}
      fps={FPS}
      width={1920}
      height={1080}
    />
  </>
);
