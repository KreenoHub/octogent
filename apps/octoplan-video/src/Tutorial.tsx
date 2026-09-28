import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import type { ComponentType } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import {
  GetStarted,
  Hook,
  Loop,
  OctopusMetaphor,
  Outro,
  Pains,
  Title,
  TwoTools,
  WhatIsClaude,
} from "./scenes/Explainers";
import {
  Brainstorm,
  CockpitTour,
  ExportScene,
  Focus,
  Graph,
  IdeaCapture,
  NewSession,
  OctogentAgents,
  OctogentDeck,
  ParkRevise,
  PlanBoard,
  QuestionCards,
  Stages,
} from "./scenes/Tour";
import { C } from "./theme";

type Scene = { id: string; Comp: ComponentType; frames: number; enter?: "fade" | "slide" | "wipe" };

export const SCENES: Scene[] = [
  { id: "hook", Comp: Hook, frames: 170 },
  { id: "pains", Comp: Pains, frames: 290, enter: "fade" },
  { id: "title", Comp: Title, frames: 190, enter: "wipe" },
  { id: "what-is-claude", Comp: WhatIsClaude, frames: 450, enter: "slide" },
  { id: "two-tools", Comp: TwoTools, frames: 300, enter: "fade" },
  { id: "octopus", Comp: OctopusMetaphor, frames: 330, enter: "slide" },
  { id: "octogent-agents", Comp: OctogentAgents, frames: 250, enter: "fade" },
  { id: "octogent-deck", Comp: OctogentDeck, frames: 330, enter: "slide" },
  { id: "cockpit", Comp: CockpitTour, frames: 560, enter: "wipe" },
  { id: "new-session", Comp: NewSession, frames: 270, enter: "fade" },
  { id: "question-cards", Comp: QuestionCards, frames: 410, enter: "slide" },
  { id: "park-revise", Comp: ParkRevise, frames: 340, enter: "fade" },
  { id: "focus", Comp: Focus, frames: 260, enter: "slide" },
  { id: "plan-board", Comp: PlanBoard, frames: 380, enter: "fade" },
  { id: "idea", Comp: IdeaCapture, frames: 200, enter: "slide" },
  { id: "brainstorm", Comp: Brainstorm, frames: 310, enter: "fade" },
  { id: "graph", Comp: Graph, frames: 320, enter: "wipe" },
  { id: "stages", Comp: Stages, frames: 210, enter: "slide" },
  { id: "export", Comp: ExportScene, frames: 230, enter: "fade" },
  { id: "loop", Comp: Loop, frames: 260, enter: "wipe" },
  { id: "get-started", Comp: GetStarted, frames: 330, enter: "slide" },
  { id: "outro", Comp: Outro, frames: 200, enter: "fade" },
];

export const TRANSITION_FRAMES = 12;

export const TOTAL_FRAMES =
  SCENES.reduce((sum, scene) => sum + scene.frames, 0) - (SCENES.length - 1) * TRANSITION_FRAMES;

// Each branch builds its own element: the three presentations have incompatible generics.
const transitionFor = (scene: Scene) => {
  const timing = linearTiming({ durationInFrames: TRANSITION_FRAMES });
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

const ProgressBar = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
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
  );
};

export const Tutorial = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <TransitionSeries>
      {SCENES.flatMap((scene, i) => {
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
    <ProgressBar />
  </AbsoluteFill>
);
