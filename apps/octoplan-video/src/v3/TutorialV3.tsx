// The v3 tutorial (about 5 minutes): new idea or import → review → interview → goal → stages →
// hand off → Run Octogent → agents build. Scenes are in ./scenes, footage in public/shots/v3.
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import type { ComponentType } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { OctopusMetaphor, WhatIsClaude } from "../scenes/Explainers";
import { C, FONT } from "../theme";
import * as V from "./scenes";

type Scene = {
  id: string;
  Comp: ComponentType;
  frames: number;
  enter?: "fade" | "slide" | "wipe";
  /** Chapter shown in the corner while the scene plays. */
  chapter?: string;
};

const P1 = "PLAN IT";
const P2 = "HAND IT OFF";
const P3 = "BUILD IT";

export const SCENES_V3: Scene[] = [
  { id: "hook", Comp: V.Hook, frames: 180 },
  { id: "title", Comp: V.Title, frames: 160, enter: "wipe" },
  { id: "what-is-claude", Comp: WhatIsClaude, frames: 420, enter: "fade" },
  { id: "two-apps", Comp: V.TwoApps, frames: 260, enter: "slide" },
  { id: "seven-steps", Comp: V.SevenSteps, frames: 290, enter: "fade" },
  { id: "part-1", Comp: V.Part1, frames: 90, enter: "wipe" },
  { id: "home", Comp: V.HomeScene, frames: 240, enter: "fade", chapter: P1 },
  { id: "new-idea", Comp: V.NewIdea, frames: 300, enter: "slide", chapter: P1 },
  { id: "import", Comp: V.ImportScene, frames: 380, enter: "slide", chapter: P1 },
  { id: "reading", Comp: V.Reading, frames: 180, enter: "fade", chapter: P1 },
  { id: "review-top", Comp: V.ReviewTop, frames: 330, enter: "fade", chapter: P1 },
  { id: "review-items", Comp: V.ReviewItems, frames: 300, enter: "slide", chapter: P1 },
  { id: "assumption", Comp: V.Assumption, frames: 210, enter: "fade", chapter: P1 },
  { id: "disagree", Comp: V.Disagree, frames: 330, enter: "slide", chapter: P1 },
  { id: "interview", Comp: V.Interview, frames: 420, enter: "wipe", chapter: P1 },
  { id: "card-keys", Comp: V.CardKeys, frames: 230, enter: "fade", chapter: P1 },
  { id: "focus", Comp: V.FocusScene, frames: 190, enter: "slide", chapter: P1 },
  { id: "answered", Comp: V.Answered, frames: 340, enter: "fade", chapter: P1 },
  { id: "goal", Comp: V.GoalScene, frames: 310, enter: "slide", chapter: P1 },
  { id: "stages", Comp: V.StagesScene, frames: 220, enter: "fade", chapter: P1 },
  { id: "part-2", Comp: V.Part2, frames: 90, enter: "wipe" },
  { id: "handoff-generate", Comp: V.HandoffGenerate, frames: 230, enter: "fade", chapter: P2 },
  { id: "handoff-review", Comp: V.HandoffReview, frames: 300, enter: "slide", chapter: P2 },
  { id: "needs-octogent", Comp: V.NeedsOctogent, frames: 300, enter: "fade", chapter: P2 },
  { id: "run-octogent", Comp: V.RunOctogent, frames: 300, enter: "slide", chapter: P2 },
  { id: "handoff-done", Comp: V.HandoffDone, frames: 300, enter: "fade", chapter: P2 },
  { id: "part-3", Comp: V.Part3, frames: 90, enter: "wipe" },
  { id: "octopus", Comp: OctopusMetaphor, frames: 330, enter: "fade", chapter: P3 },
  { id: "build-step", Comp: V.BuildStep, frames: 220, enter: "slide", chapter: P3 },
  { id: "og-deck", Comp: V.OgDeck, frames: 330, enter: "fade", chapter: P3 },
  { id: "og-tentacle", Comp: V.OgTentacle, frames: 290, enter: "slide", chapter: P3 },
  { id: "og-agents", Comp: V.OgAgents, frames: 260, enter: "fade", chapter: P3 },
  { id: "octopus-rules", Comp: V.OctopusRules, frames: 240, enter: "slide", chapter: P3 },
  { id: "real-deck", Comp: V.RealDeck, frames: 300, enter: "wipe", chapter: P3 },
  { id: "loop", Comp: V.Loop, frames: 270, enter: "fade" },
  { id: "recap", Comp: V.Recap, frames: 330, enter: "slide" },
  { id: "get-started", Comp: V.GetStarted, frames: 330, enter: "fade" },
  { id: "outro", Comp: V.Outro, frames: 170, enter: "fade" },
];

export const TRANSITION_FRAMES_V3 = 12;

export const TOTAL_FRAMES_V3 =
  SCENES_V3.reduce((sum, scene) => sum + scene.frames, 0) -
  (SCENES_V3.length - 1) * TRANSITION_FRAMES_V3;

const transitionFor = (scene: Scene) => {
  const timing = linearTiming({ durationInFrames: TRANSITION_FRAMES_V3 });
  const key = `t-${scene.id}`;
  if (scene.enter === "slide") {
    return (
      <TransitionSeries.Transition
        key={key}
        presentation={slide({ direction: "from-right" })}
        timing={timing}
      />
    );
  }
  if (scene.enter === "wipe") {
    return (
      <TransitionSeries.Transition
        key={key}
        presentation={wipe({ direction: "from-left" })}
        timing={timing}
      />
    );
  }
  return <TransitionSeries.Transition key={key} presentation={fade()} timing={timing} />;
};

/** Start frame of each scene on the final timeline (transitions overlap). */
const starts = SCENES_V3.reduce<number[]>((acc, scene, i) => {
  const prev = acc[i - 1] ?? 0;
  const prevScene = SCENES_V3[i - 1];
  acc.push(i === 0 ? 0 : prev + (prevScene?.frames ?? 0) - TRANSITION_FRAMES_V3);
  void scene;
  return acc;
}, []);

/** Top-right chapter tag + progress bar: where you are in the video. */
const Chrome = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  let current: Scene | undefined;
  SCENES_V3.forEach((scene, i) => {
    if (frame >= (starts[i] ?? 0)) current = scene;
  });
  return (
    <>
      {current?.chapter ? (
        <div
          style={{
            position: "absolute",
            top: 26,
            right: 34,
            padding: "8px 16px",
            fontFamily: FONT.pixel,
            fontSize: 22,
            letterSpacing: "0.12em",
            color: C.bg,
            background: C.amber,
            boxShadow: `0 0 24px ${C.amber}66`,
          }}
        >
          {current.chapter}
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 6,
          background: `${C.border}88`,
        }}
      >
        <div
          style={{
            width: `${(frame / durationInFrames) * 100}%`,
            height: "100%",
            background: C.amber,
            boxShadow: `0 0 12px ${C.amber}`,
          }}
        />
      </div>
    </>
  );
};

export const TutorialV3 = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <TransitionSeries>
      {SCENES_V3.flatMap((scene, i) => {
        const items = [];
        if (i > 0) items.push(transitionFor(scene));
        items.push(
          <TransitionSeries.Sequence key={scene.id} durationInFrames={scene.frames}>
            <scene.Comp />
          </TransitionSeries.Sequence>,
        );
        return items;
      })}
    </TransitionSeries>
    <Chrome />
  </AbsoluteFill>
);
