import { Sequence, useCurrentFrame } from "remotion";
import { KeyCap } from "../components/Bits";
import { LowerThird } from "../components/Caption";
import { Shot } from "../components/Shot";
import { SHOT_H, SHOT_W } from "../theme";

const full = (at: number) => ({ at, x: SHOT_W / 2, y: SHOT_H / 2, zoom: 1 });

/** A key press shown in the top-right corner. */
const KeyHint = ({ k, from, pressAt }: { k: string; from: number; pressAt: number }) => {
  const frame = useCurrentFrame();
  if (frame < from - 2) return null;
  return (
    <div style={{ position: "absolute", right: 90, top: 80 }}>
      <KeyCap k={k} from={from} pressAt={pressAt} size={120} />
    </div>
  );
};

/** Octogent: the agents map. */
export const OctogentAgents = () => (
  <>
    <Shot
      src="octogent-agents"
      cams={[
        full(0),
        { at: 60, x: 990, y: 660, zoom: 1.9 },
        { at: 230, x: 990, y: 660, zoom: 2.05 },
      ]}
      marks={[
        {
          from: 70,
          to: 240,
          box: [930, 585, 120, 120],
          label: "The octopus: your coordinator",
          side: "left",
        },
        {
          from: 110,
          to: 240,
          box: [1100, 610, 115, 110],
          label: "A tentacle",
          side: "right",
          color: "#25d366",
        },
      ]}
    />
    <LowerThird
      kicker="OCTOGENT · AGENTS"
      text="Every *tentacle* is a lane of work your agents can pick up."
      from={20}
    />
  </>
);

/** Octogent: the Deck. */
export const OctogentDeck = () => (
  <>
    <Shot
      src="octogent-deck"
      cams={[
        full(0),
        { at: 70, x: 520, y: 360, zoom: 2.1 },
        { at: 230, x: 520, y: 360, zoom: 2.1 },
        { at: 300, x: 1000, y: 620, zoom: 1.05 },
      ]}
      marks={[
        { from: 80, to: 170, box: [316, 94, 118, 32], label: "Spawn an agent", side: "bottom" },
        {
          from: 130,
          to: 230,
          box: [637, 266, 80, 22],
          label: "6 of 6 to-dos done",
          side: "bottom",
          color: "#25d366",
        },
        {
          from: 180,
          to: 280,
          box: [322, 296, 392, 305],
          label: "The tentacle's to-do list (todo.md)",
          side: "right",
        },
      ]}
      cursor={[
        { at: 60, x: 900, y: 500 },
        { at: 95, x: 375, y: 110, click: true },
        { at: 160, x: 380, y: 112 },
      ]}
    />
    <Sequence from={0} durationInFrames={170}>
      <LowerThird
        kicker="OCTOGENT · DECK"
        text="The *Deck* shows every tentacle: its job, its to-do list and its progress."
        from={10}
        exitAt={160}
      />
    </Sequence>
    <Sequence from={170}>
      <LowerThird text="Here, Octoplan's own 6 tentacles, *built by agents*, all done." from={6} />
    </Sequence>
  </>
);

/** Octoplan: the cockpit tour. */
export const CockpitTour = () => (
  <>
    <Shot
      src="octoplan-cockpit"
      cams={[
        full(0),
        { at: 90, x: 300, y: 300, zoom: 1.7 },
        { at: 200, x: 960, y: 560, zoom: 1.35 },
        { at: 318, x: 960, y: 560, zoom: 1.35 },
        { at: 370, x: 1770, y: 560, zoom: 1.6 },
        { at: 500, x: 1770, y: 560, zoom: 1.6 },
        { at: 545, x: 1000, y: 625, zoom: 1 },
      ]}
      marks={[
        {
          from: 95,
          to: 190,
          box: [15, 175, 335, 160],
          label: "Your projects and sessions",
          side: "bottom",
        },
        {
          from: 205,
          to: 312,
          box: [383, 170, 1153, 97],
          label: "Unanswered questions always stay pinned here",
          side: "bottom",
        },
        {
          from: 378,
          to: 495,
          box: [1575, 215, 410, 170],
          label: "The live plan board",
          side: "left",
          color: "#25d366",
        },
        {
          from: 420,
          to: 495,
          box: [1575, 540, 410, 395],
          label: "Coverage: what's still undiscussed",
          side: "left",
        },
      ]}
    />
    <Sequence from={0} durationInFrames={95}>
      <LowerThird
        kicker="OCTOPLAN"
        text="Meet the *cockpit*: your planning conversation, organized."
        from={10}
        exitAt={86}
      />
    </Sequence>
    <Sequence from={95} durationInFrames={110}>
      <LowerThird
        text="Left: every project and every conversation you've had."
        from={4}
        exitAt={100}
      />
    </Sequence>
    <Sequence from={205} durationInFrames={120}>
      <LowerThird
        text="Middle: the conversation as *cards*, not a wall of text."
        from={4}
        exitAt={110}
      />
    </Sequence>
    <Sequence from={325}>
      <LowerThird text="Right: the *plan* building itself while you talk." from={4} />
    </Sequence>
  </>
);

/** Starting a session. */
export const NewSession = () => (
  <>
    <Shot
      src="octoplan-new-session"
      cams={[
        { at: 0, x: 1000, y: 625, zoom: 1 },
        { at: 60, x: 1000, y: 625, zoom: 1.75 },
      ]}
      marks={[
        {
          from: 70,
          to: 150,
          box: [688, 528, 624, 42],
          label: "1. Pick your project folder",
          side: "top",
        },
        { from: 120, to: 200, box: [688, 612, 624, 45], label: "2. Choose a mode", side: "top" },
        {
          from: 170,
          to: 250,
          box: [688, 698, 624, 42],
          label: "3. Say what you're planning",
          side: "bottom",
        },
      ]}
      cursor={[
        { at: 170, x: 1100, y: 740 },
        { at: 215, x: 1270, y: 774, click: true },
        { at: 260, x: 1275, y: 776 },
      ]}
    />
    <LowerThird
      kicker="STEP 1"
      text="Click *+ New session.* Deep interview? Quick align? Brainstorm? Your call."
      from={10}
    />
  </>
);

/** The heart: question cards. */
export const QuestionCards = () => (
  <>
    <Shot
      src="octoplan-cockpit"
      cams={[
        { at: 0, x: 960, y: 900, zoom: 1.6 },
        { at: 170, x: 960, y: 900, zoom: 1.6 },
        { at: 230, x: 820, y: 1010, zoom: 2.3 },
        { at: 400, x: 820, y: 1010, zoom: 2.3 },
      ]}
      marks={[
        {
          from: 20,
          to: 160,
          box: [420, 797, 1080, 130],
          label: "Claude asked. You clicked. Done.",
          side: "top",
        },
        {
          from: 60,
          to: 160,
          box: [434, 866, 410, 26],
          label: "Its recommendation, marked for you",
          side: "bottom",
          color: "#25d366",
        },
        { from: 240, to: 400, box: [762, 1010, 110, 24], label: "Not sure? Press T", side: "top" },
      ]}
    />
    <Sequence from={0} durationInFrames={170}>
      <LowerThird
        kicker="QUESTION CARDS"
        text="Claude's questions arrive as *cards*. Press *1-9* to pick, *Enter* to send."
        from={8}
        exitAt={162}
      />
    </Sequence>
    <Sequence from={170} durationInFrames={240}>
      <LowerThird
        text="Unsure? *T* marks it tentative, and Claude logs it as a risk to revisit."
        from={6}
      />
    </Sequence>
    <KeyHint k="T" from={230} pressAt={260} />
  </>
);

/** Park + revise, shown on the plan board with the stale decision. */
export const ParkRevise = () => (
  <>
    <Shot
      src="octoplan-cockpit-board-open"
      cams={[
        { at: 0, x: 1770, y: 760, zoom: 2.1 },
        { at: 150, x: 1770, y: 760, zoom: 2.1 },
        { at: 205, x: 1780, y: 420, zoom: 1.9 },
      ]}
      marks={[
        {
          from: 20,
          to: 150,
          box: [1580, 862, 400, 26],
          label: "Parked questions wait here",
          side: "bottom",
        },
        {
          from: 170,
          to: 330,
          box: [1585, 285, 395, 22],
          label: "Now STALE: it needs a re-check",
          side: "bottom",
          color: "#ff4df0",
        },
      ]}
    />
    <Sequence from={0} durationInFrames={160}>
      <LowerThird
        text="Not ready to decide? *P* parks it. Claude carries on with a stated assumption."
        from={8}
        exitAt={152}
      />
    </Sequence>
    <Sequence from={160}>
      <LowerThird
        text="Changed your mind? *R* revises an answer, and every decision that depended on it gets re-checked."
        from={4}
      />
    </Sequence>
    <Sequence from={0} durationInFrames={160}>
      <KeyHint k="P" from={10} pressAt={40} />
    </Sequence>
    <Sequence from={160}>
      <KeyHint k="R" from={6} pressAt={30} />
    </Sequence>
  </>
);

/** Focus mode. */
export const Focus = () => (
  <>
    <Shot
      src="octoplan-focus"
      cams={[
        { at: 0, x: 1000, y: 400, zoom: 1.35 },
        { at: 240, x: 1000, y: 380, zoom: 1.5 },
      ]}
      marks={[
        {
          from: 40,
          to: 250,
          box: [445, 100, 120, 36],
          label: "Question 5 of about 8",
          side: "bottom",
        },
        {
          from: 80,
          to: 250,
          box: [340, 36, 1340, 26],
          label: "How covered is your plan",
          side: "bottom",
          color: "#25d366",
        },
        { from: 130, to: 250, box: [505, 300, 993, 55], label: "Press 1", side: "right" },
      ]}
    />
    <LowerThird
      kicker="FOCUS MODE"
      text="Press *F*: one question at a time, full screen. Perfect for long interviews."
      from={10}
    />
    <KeyHint k="F" from={4} pressAt={30} />
  </>
);

/** Plan board + coverage. */
export const PlanBoard = () => (
  <>
    <Shot
      src="octoplan-cockpit-board-open"
      cams={[
        { at: 0, x: 1000, y: 625, zoom: 1 },
        { at: 60, x: 1775, y: 560, zoom: 1.55 },
        { at: 360, x: 1775, y: 700, zoom: 1.55 },
      ]}
      marks={[
        {
          from: 70,
          to: 200,
          box: [1580, 255, 405, 560],
          label: "18 decisions, each with an ID",
          side: "left",
        },
        {
          from: 210,
          to: 360,
          box: [1580, 1060, 405, 180],
          label: "Coverage: 4 of 12 areas done",
          side: "left",
          color: "#25d366",
        },
      ]}
    />
    <Sequence from={0} durationInFrames={200}>
      <LowerThird
        kicker="PLAN BOARD"
        text="Every answer becomes *decisions, gaps and risks*, live."
        from={10}
        exitAt={192}
      />
    </Sequence>
    <Sequence from={200}>
      <LowerThird
        text="Saved as plain files in *docs/plan*. Close the window: nothing is lost."
        from={4}
      />
    </Sequence>
  </>
);

/** Idea capture. */
export const IdeaCapture = () => (
  <>
    <Shot
      src="octoplan-idea"
      cams={[
        { at: 0, x: 1000, y: 625, zoom: 1.1 },
        { at: 50, x: 1000, y: 625, zoom: 1.8 },
      ]}
      marks={[
        { from: 60, to: 190, box: [688, 585, 624, 42], label: "Any idea, any time", side: "top" },
      ]}
    />
    <LowerThird
      kicker="IDEAS"
      text="Had an idea mid-conversation? Press *I*, type it, keep going."
      from={10}
    />
    <KeyHint k="I" from={4} pressAt={30} />
  </>
);

/** Brainstorm board. */
export const Brainstorm = () => (
  <>
    <Shot
      src="octoplan-brainstorm"
      cams={[
        { at: 0, x: 1000, y: 625, zoom: 1 },
        { at: 60, x: 1780, y: 560, zoom: 1.6 },
        { at: 280, x: 1780, y: 780, zoom: 1.6 },
      ]}
      marks={[
        { from: 70, to: 170, box: [1605, 363, 70, 36], label: "Star the good ones", side: "left" },
        {
          from: 130,
          to: 280,
          box: [1595, 765, 370, 232],
          label: "Claude adds its own ideas too",
          side: "left",
          color: "#25d366",
        },
        {
          from: 200,
          to: 300,
          box: [1752, 217, 225, 34],
          label: "Converge: starred ideas become decisions",
          side: "left",
        },
      ]}
      cursor={[
        { at: 50, x: 1400, y: 500 },
        { at: 90, x: 1640, y: 381, click: true },
        { at: 150, x: 1650, y: 400 },
      ]}
    />
    <LowerThird
      kicker="BRAINSTORM MODE"
      text="Star, park, merge or kill ideas, then hit *Converge*."
      from={10}
    />
  </>
);

/** Git graph. */
export const Graph = () => (
  <>
    <Shot
      src="octoplan-graph"
      cams={[
        { at: 0, x: 1000, y: 500, zoom: 1.05 },
        { at: 150, x: 1000, y: 460, zoom: 1.2 },
        { at: 300, x: 1600, y: 380, zoom: 1.7 },
      ]}
      marks={[
        {
          from: 30,
          to: 150,
          box: [60, 190, 1170, 360],
          label: "Every branch and commit",
          side: "bottom",
        },
        {
          from: 170,
          to: 320,
          box: [1253, 185, 690, 205],
          label: "Which tentacle is doing what",
          side: "bottom",
          color: "#25d366",
        },
      ]}
    />
    <LowerThird
      kicker="BRANCH GRAPH"
      text="Press *G*: see your whole project's branches, and each agent's lane, at a glance."
      from={10}
    />
    <KeyHint k="G" from={4} pressAt={30} />
  </>
);

/** Stages. */
export const Stages = () => (
  <>
    <Shot
      src="octoplan-stages"
      cams={[
        { at: 0, x: 1000, y: 625, zoom: 1 },
        { at: 50, x: 1780, y: 650, zoom: 1.6 },
      ]}
      marks={[
        {
          from: 60,
          to: 200,
          box: [1578, 440, 405, 505],
          label: "5 ready-to-run build prompts",
          side: "left",
        },
        {
          from: 100,
          to: 200,
          box: [1510, 1190, 480, 40],
          label: "Saved to docs/plan/stages",
          side: "top",
          color: "#25d366",
        },
      ]}
      cursor={[
        { at: 20, x: 1300, y: 300 },
        { at: 45, x: 1625, y: 186, click: true },
        { at: 80, x: 1640, y: 200 },
      ]}
    />
    <LowerThird
      kicker="STAGES"
      text="Turn the plan into *build-it-in-stages* prompts, each with its own checklist."
      from={10}
    />
  </>
);

/** Export to Octogent. */
export const ExportScene = () => (
  <>
    <Shot
      src="octoplan-export"
      cams={[
        { at: 0, x: 1000, y: 625, zoom: 1.1 },
        { at: 50, x: 1000, y: 625, zoom: 1.7 },
      ]}
      marks={[
        {
          from: 60,
          to: 200,
          box: [603, 586, 794, 180],
          label: "Tasks, straight from your goal",
          side: "top",
        },
        {
          from: 120,
          to: 220,
          box: [1307, 784, 90, 34],
          label: "One click",
          side: "bottom",
          color: "#25d366",
        },
      ]}
      cursor={[
        { at: 100, x: 1150, y: 700 },
        { at: 140, x: 1350, y: 800, click: true },
        { at: 190, x: 1355, y: 802 },
      ]}
    />
    <LowerThird
      kicker="EXPORT"
      text="Send the tasks to an *Octogent tentacle*, and let the agents build."
      from={10}
    />
  </>
);
