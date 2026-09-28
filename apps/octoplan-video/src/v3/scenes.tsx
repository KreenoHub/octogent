// The v3 tutorial's scenes: real footage of Octoplan v3 and Octogent (tools/footageV3.mjs),
// toured with camera moves, highlights, cursor clicks and short captions for first-time users.
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop, Center, Cmd, KeyCap, PopCard } from "../components/Bits";
import { Caption, Kicker } from "../components/Caption";
import { Octopus } from "../components/Octopus";
import { C, FONT } from "../theme";
import { type Box, Chapter, R, StepChips, Tour, pad, union } from "./kit";

const S = (name: string) => `v3/${name}`;
const STEPS = ["Start", "Understand", "Interview", "Goal", "Stages", "Hand off", "Build"] as const;

// ---------------------------------------------------------------- intro

export const Hook = () => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 180], [0, -40]);
  return (
    <Backdrop glow={C.amber}>
      <Center style={{ gap: 36, transform: `translateY(${drift}px)` }}>
        <Caption text="Got an *idea?*" from={4} size={110} weight={900} />
        <Caption text="Or *half a project* lying around?" from={34} size={78} />
        <Caption
          text="Let's turn it into _working software_ built by a team of AI agents."
          from={78}
          size={54}
          weight={700}
        />
      </Center>
    </Backdrop>
  );
};

export const Title = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 4, fps, config: { damping: 12, stiffness: 120 } });
  return (
    <Backdrop>
      <Center style={{ gap: 30 }}>
        <div style={{ transform: `scale(${s})` }}>
          <Octopus size={190} />
        </div>
        <div
          style={{
            display: "flex",
            gap: 40,
            alignItems: "center",
            fontFamily: FONT.pixel,
            fontSize: 118,
            color: C.amber,
            opacity: interpolate(frame, [16, 28], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            textShadow: `0 0 50px ${C.amber}66`,
          }}
        >
          <span>OCTOPLAN</span>
          <span style={{ color: C.text, fontSize: 84 }}>+</span>
          <span>OCTOGENT</span>
        </div>
        <Caption text="*Plan* it. *Hand* it off. *Watch* it get built." from={44} size={56} />
        <Caption
          text="The complete beginner's tour — about 5 minutes."
          from={80}
          size={36}
          weight={600}
          style={{ color: C.muted }}
        />
      </Center>
    </Backdrop>
  );
};

export const TwoApps = () => (
  <Backdrop>
    <Center style={{ gap: 46 }}>
      <Caption text="Two apps. One team." from={0} size={76} />
      <div style={{ display: "flex", gap: 40, alignItems: "stretch" }}>
        <PopCard from={16} accent={C.amber}>
          <div style={{ width: 620 }}>
            <Kicker text="OCTOPLAN · THE PLANNER" from={16} />
            <Caption
              text="Claude asks you *clear questions,* one card at a time, and writes the answers down as a plan."
              from={24}
              size={40}
              align="left"
            />
          </div>
        </PopCard>
        <div
          style={{
            alignSelf: "center",
            fontFamily: FONT.pixel,
            fontSize: 70,
            color: C.amber,
            opacity: interpolate(useCurrentFrame(), [60, 72], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          →
        </div>
        <PopCard from={70} accent={C.green}>
          <div style={{ width: 620 }}>
            <Kicker text="OCTOGENT · THE BUILDERS" from={70} color={C.green} />
            <Caption
              text="A team of Claude agents, each with its own _to-do list,_ builds what you planned."
              from={78}
              size={40}
              align="left"
            />
          </div>
        </PopCard>
      </div>
      <Caption
        text="You stay in charge. The agents do the typing."
        from={150}
        size={44}
        weight={700}
        style={{ color: C.muted }}
      />
    </Center>
  </Backdrop>
);

export const SevenSteps = () => (
  <Backdrop>
    <Center style={{ gap: 50 }}>
      <Kicker text="THE WHOLE JOURNEY" from={0} />
      <Caption text="Seven steps. Octoplan shows you *where you are.*" from={4} size={64} />
      <StepChips labels={STEPS} from={40} every={16} size={34} />
      <Caption
        text="And a bar at the bottom always says *what to do next.* Just press it."
        from={170}
        size={44}
        weight={700}
      />
    </Center>
  </Backdrop>
);

// ---------------------------------------------------------------- part 1: plan it

export const Part1 = () => (
  <Chapter
    part="PART 1"
    title="PLAN IT"
    sub="In *Octoplan.* From an idea — or from what you already have."
  />
);

export const HomeScene = () => {
  const s = "01-home";
  return (
    <Tour
      src={S(s)}
      end={240}
      beats={[
        {
          at: 20,
          focus: pad(R(s, "newPath"), 40),
          mark: { box: R(s, "newPath"), label: "Brand-new idea" },
        },
        {
          at: 110,
          focus: pad(R(s, "importPath"), 40),
          mark: { box: R(s, "importPath"), label: "Something that exists", color: C.green },
        },
      ]}
      lines={[
        { at: 10, kicker: "STEP 1 · START", text: "Octoplan opens on *Home.* Two ways in." },
        { at: 110, text: "Start from an *idea* — or bring in a repo, notes or half a plan." },
      ]}
    />
  );
};

export const NewIdea = () => {
  const s = "02-new-form";
  return (
    <Tour
      src={S(s)}
      end={300}
      beats={[
        {
          at: 16,
          focus: pad(R(s, "idea"), 30),
          mark: { box: R(s, "idea"), label: "Say it in a sentence" },
        },
        {
          at: 100,
          focus: pad(R(s, "name"), 80),
          mark: { box: R(s, "name"), label: "Name suggested for you" },
        },
        {
          at: 160,
          focus: pad(R(s, "hint"), 60),
          mark: { box: R(s, "hint"), label: "Exactly what gets created" },
        },
        {
          at: 220,
          focus: pad(R(s, "submit"), 120),
          click: R(s, "submit"),
          mark: { box: R(s, "submit") },
        },
      ]}
      lines={[
        { at: 10, kicker: "NEW FROM AN IDEA", text: "Type the idea. That's really all." },
        { at: 100, text: "Octoplan picks a *name* and a *folder* for you." },
        {
          at: 160,
          text: "It creates the folder, *git,* a README with your idea — then starts asking questions.",
        },
      ]}
    />
  );
};

export const ImportScene = () => {
  const s = "03-import-form";
  return (
    <Tour
      src={S(s)}
      end={380}
      beats={[
        {
          at: 16,
          focus: pad(R(s, "main"), 40),
          mark: { box: R(s, "main"), label: "Main folder = your project" },
        },
        {
          at: 100,
          focus: pad(R(s, "extras"), 30),
          mark: { box: R(s, "extras"), label: "Files & folders from anywhere", color: C.green },
        },
        {
          at: 180,
          focus: pad(R(s, "pastes"), 30),
          mark: { box: R(s, "pastes"), label: "Paste notes, chats, specs" },
        },
        {
          at: 250,
          focus: pad(R(s, "git"), 80),
          mark: { box: R(s, "git"), label: "Git, without touching your files" },
        },
        {
          at: 310,
          focus: pad(R(s, "submit"), 120),
          click: R(s, "submit"),
          mark: { box: R(s, "submit") },
        },
      ]}
      lines={[
        {
          at: 10,
          kicker: "IMPORT WHAT EXISTS",
          text: "Point it at a *main folder* — a repo, or any folder.",
        },
        { at: 100, text: "Add a spec from Documents, a notes folder, *any* file." },
        { at: 180, text: "Paste text too: an idea from a chat, half a spec." },
        { at: 250, text: "Then *Import and read.* Nothing changes until you say so." },
      ]}
    />
  );
};

export const Reading = () => {
  const s = "04-reading";
  return (
    <Tour
      src={S(s)}
      end={180}
      beats={[
        {
          at: 14,
          focus: pad(R(s, "spinner"), 60),
          mark: { box: pad(R(s, "spinner"), 6), label: "Read-only" },
        },
        {
          at: 100,
          focus: pad(R(s, "stepper"), 30),
          mark: { box: R(s, "understand"), label: "Step 2: Understand", side: "bottom" },
        },
      ]}
      lines={[
        {
          at: 8,
          kicker: "STEP 2 · UNDERSTAND",
          text: "Claude *reads everything* — docs first, then code.",
        },
        { at: 100, text: "Usually under a minute. It can't change your files." },
      ]}
    />
  );
};

export const ReviewTop = () => {
  const s = "05-review-top";
  return (
    <Tour
      src={S(s)}
      end={330}
      beats={[
        {
          at: 16,
          focus: pad(union(R(s, "maturity"), R(s, "reasons")), 30),
          mark: { box: pad(R(s, "maturity"), 4), label: "How far along is it?" },
        },
        {
          at: 120,
          focus: pad(R(s, "sources"), 20),
          mark: { box: R(s, "sources"), label: "Every source, rated", color: C.green },
        },
        {
          at: 230,
          focus: pad(R(s, "footer"), 60),
          mark: { box: R(s, "apply"), label: "Nothing is written until here", side: "top" },
        },
      ]}
      lines={[
        {
          at: 10,
          kicker: "WHAT I UNDERSTOOD",
          text: "First, a verdict: raw idea, notes, partial plan, detailed plan — or *built.*",
        },
        { at: 120, text: "Each file and paste gets its own rating and a one-line summary." },
        { at: 230, text: "You check it *before* anything goes into your plan." },
      ]}
    />
  );
};

export const ReviewItems = () => {
  const s = "06-review-items";
  return (
    <Tour
      src={S(s)}
      end={300}
      beats={[
        {
          at: 16,
          focus: pad(R(s, "item"), 30),
          mark: { box: R(s, "item"), label: "Goals, decisions, gaps, risks" },
        },
        {
          at: 110,
          focus: pad(R(s, "keep"), 140),
          mark: { box: pad(R(s, "keep"), 6), label: "Keep or drop" },
          click: R(s, "keep"),
        },
        {
          at: 190,
          focus: pad(R(s, "evidence"), 40),
          mark: {
            box: pad(R(s, "evidence"), 6),
            label: "Proof: file + exact quote",
            color: C.green,
          },
        },
      ]}
      lines={[
        {
          at: 10,
          text: "Claude lists what your material already decides — and what it leaves open.",
        },
        { at: 110, text: "*Keep, edit or drop* anything. It saves as you go." },
        { at: 190, text: "Every item shows *where it came from* — the file and the exact words." },
      ]}
    />
  );
};

export const Assumption = () => {
  const s = "07-review-assumption";
  return (
    <Tour
      src={S(s)}
      end={210}
      beats={[
        {
          at: 14,
          focus: pad(R(s, "item"), 30),
          mark: { box: pad(R(s, "badge"), 6), label: "Claude's guess", color: C.amber },
        },
        {
          at: 110,
          focus: pad(R(s, "evidence"), 60),
          mark: { box: pad(R(s, "evidence"), 6), label: "…and why it guessed" },
        },
      ]}
      lines={[
        { at: 8, text: "Guesses are marked *assumption* — never passed off as facts." },
        { at: 110, text: "Keep one, and the interview will double-check it." },
      ]}
    />
  );
};

export const Disagree = () => {
  const s = "08-review-disagree";
  return (
    <Tour
      src={S(s)}
      end={330}
      beats={[
        {
          at: 14,
          focus: pad(R(s, "item"), 20),
          mark: { box: R(s, "item"), label: "Your files contradict each other", color: C.red },
        },
        {
          at: 140,
          focus: pad(R(s, "select"), 60),
          click: R(s, "select"),
          mark: { box: pad(R(s, "select"), 4), label: "Resolve it — or park it for later" },
        },
        {
          at: 250,
          focus: pad(R(s, "apply"), 160),
          click: R(s, "apply"),
          mark: { box: pad(R(s, "apply"), 4), label: "Apply", side: "top" },
        },
      ]}
      lines={[
        { at: 8, text: "Notes say *JSON*, the spec says *SQLite?* Octoplan catches that." },
        { at: 140, text: 'Settle it now, or *park* it: "ask me in the interview".' },
        { at: 250, text: "Happy? *Apply* — and the interview starts right away." },
      ]}
    />
  );
};

export const Interview = () => {
  const s = "09-interview";
  const card: Box = [436, 645, 1045, 350];
  const recommended: Box = [456, 722, 1010, 56];
  return (
    <Tour
      src={S(s)}
      end={420}
      beats={[
        {
          at: 16,
          focus: pad(R(s, "stepper"), 20),
          mark: { box: R(s, "interview"), label: "Step 3: Interview", side: "bottom" },
        },
        { at: 90, focus: card, mark: { box: card, label: "A question card" } },
        {
          at: 180,
          focus: card,
          zoom: 1.7,
          click: recommended,
          mark: { box: recommended, label: "Claude's suggestion", color: C.green },
        },
        {
          at: 280,
          focus: pad(R(s, "board"), 0),
          zoom: 1.6,
          mark: { box: R(s, "board"), label: "Your plan, filling in", side: "left" },
        },
      ]}
      lines={[
        {
          at: 10,
          kicker: "STEP 3 · INTERVIEW",
          text: "Now Claude asks about *only what's still open.*",
        },
        { at: 90, text: "Questions arrive as *cards* in a dock that never scrolls away." },
        { at: 180, text: "Click an option (or press 1–9). *Recommended* is Claude's pick." },
        { at: 280, text: "Every answer lands on the *plan board* on the right." },
      ]}
    />
  );
};

export const CardKeys = () => {
  const frame = useCurrentFrame();
  const keys: Array<[string, string]> = [
    ["1-9", "pick an option"],
    ["O", "type your own answer"],
    ["T", "not sure? mark it tentative"],
    ["P", "park it: decide later"],
    ["Enter", "send the round"],
  ];
  return (
    <Backdrop>
      <Center style={{ gap: 38 }}>
        <Kicker text="ANSWERING IS FAST" from={0} />
        <Caption text="Every card works *from the keyboard.*" from={4} size={62} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto auto",
            gap: "22px 40px",
            alignItems: "center",
          }}
        >
          {keys.map(([k, label], i) => (
            <div key={k} style={{ display: "contents" }}>
              <div style={{ justifySelf: "end" }}>
                <KeyCap
                  k={k}
                  from={24 + i * 18}
                  pressAt={40 + i * 18}
                  size={k.length > 2 ? 70 : 84}
                />
              </div>
              <div
                style={{
                  fontFamily: FONT.sans,
                  fontWeight: 700,
                  fontSize: 42,
                  color: C.text,
                  opacity: interpolate(frame, [30 + i * 18, 40 + i * 18], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }),
                }}
              >
                {label}
              </div>
            </div>
          ))}
        </div>
        <Caption
          text="Changed your mind later? Click an answer to *revise* it."
          from={140}
          size={40}
          weight={700}
        />
      </Center>
    </Backdrop>
  );
};

export const FocusScene = () => {
  const s = "10-focus";
  return (
    <Tour
      src={S(s)}
      end={190}
      beats={[
        {
          at: 14,
          focus: pad(R(s, "round"), 20),
          mark: { box: R(s, "round"), label: "Just the question" },
        },
      ]}
      lines={[
        {
          at: 8,
          kicker: "FOCUS MODE · PRESS F",
          text: "Want zero distractions? *F* shows only the question, big.",
        },
      ]}
    />
  );
};

export const Answered = () => {
  const s = "11-answered";
  const round: Box = [400, 505, 1120, 256];
  const tools: Box = [382, 298, 700, 26];
  const needs = R(s, "needs");
  const coverage: Box = [1575, 820, 410, 380];
  return (
    <Tour
      src={S(s)}
      end={340}
      beats={[
        { at: 14, focus: round, mark: { box: round, label: "Answered rounds fold up" } },
        {
          at: 100,
          focus: pad(tools, 60),
          mark: { box: tools, label: "What Claude did, in one line", color: C.green },
        },
        {
          at: 170,
          focus: pad(needs, 30),
          zoom: 2,
          mark: { box: needs, label: "Needs your OK", side: "left" },
        },
        {
          at: 250,
          focus: coverage,
          zoom: 1.9,
          mark: { box: coverage, label: "12 topics, filling up", side: "left", color: C.green },
        },
      ]}
      lines={[
        { at: 8, text: "Answers fold into short *chips.* No walls of text." },
        { at: 100, text: "Claude's work shows as one line: decisions recorded, topics covered." },
        { at: 170, text: "*Needs attention* collects anything waiting for you." },
        { at: 250, text: "*Coverage* shows how complete the plan is." },
      ]}
    />
  );
};

export const GoalScene = () => {
  const s = "12-goal";
  const why: Box = [381, 228, 1150, 100];
  const dod: Box = [370, 840, 1170, 290];
  const next: Box = [1800, 1207, 168, 34];
  return (
    <Tour
      src={S(s)}
      end={310}
      beats={[
        { at: 14, focus: why, mark: { box: why, label: "Why this matters" } },
        { at: 100, focus: dod, mark: { box: dod, label: "Definition of done", color: C.green } },
        {
          at: 210,
          focus: pad(next, 200),
          click: next,
          mark: { box: next, label: "Next step, one click", side: "top" },
        },
      ]}
      lines={[
        {
          at: 8,
          kicker: "STEP 4 · GOAL",
          text: "When the plan is clear: *Ask Claude to write GOAL.md.*",
        },
        { at: 100, text: "Every done-item is *checkable* — a command or a test you can run." },
        { at: 210, text: "The bottom bar already points at the next move." },
      ]}
    />
  );
};

export const StagesScene = () => {
  const s = "13-stages";
  return (
    <Tour
      src={S(s)}
      end={220}
      beats={[
        {
          at: 14,
          focus: pad(R(s, "list"), 20),
          mark: { box: R(s, "list"), label: "Step-by-step build prompts" },
        },
        {
          at: 120,
          focus: pad(R(s, "copy"), 140),
          click: R(s, "copy"),
          mark: { box: pad(R(s, "copy"), 4), label: "Copy any stage", color: C.green },
        },
      ]}
      lines={[
        {
          at: 8,
          kicker: "STEP 5 · STAGES",
          text: "*Generate stages:* the plan becomes build prompts, each with a test checkpoint.",
        },
        { at: 120, text: "Copy one into any Claude session — or hand everything to Octogent." },
      ]}
    />
  );
};

// ---------------------------------------------------------------- part 2: hand it off

export const Part2 = () => (
  <Chapter
    part="PART 2"
    title="HAND IT OFF"
    sub="From plan to a team: *tentacles* with to-do lists."
  />
);

export const HandoffGenerate = () => {
  const s = "14-handoff-generate";
  return (
    <Tour
      src={S(s)}
      end={230}
      beats={[
        {
          at: 14,
          focus: pad(R(s, "steps"), 60),
          mark: { box: pad(R(s, "steps"), 4), label: "Generate → Review → Apply → Done" },
        },
        {
          at: 120,
          focus: pad(R(s, "wizard"), 20),
          mark: { box: R(s, "wizard"), label: "Claude proposes the split", color: C.green },
        },
      ]}
      lines={[
        {
          at: 8,
          kicker: "STEP 6 · HAND OFF",
          text: "Four clicks turn your plan into Octogent *tentacles.*",
        },
        { at: 120, text: "Claude splits the work: who owns which folders, and every to-do." },
      ]}
    />
  );
};

export const HandoffReview = () => {
  const s = "15-handoff-review";
  const card: Box = [381, 312, 1156, 380];
  const name: Box = [451, 350, 1080, 44];
  const todo: Box = [398, 578, 1122, 64];
  return (
    <Tour
      src={S(s)}
      end={300}
      beats={[
        { at: 14, focus: card, mark: { box: name, label: "A tentacle: a team member with a job" } },
        {
          at: 120,
          focus: pad(todo, 40),
          mark: { box: todo, label: 'One to-do, with "Done when…"', color: C.green },
        },
        {
          at: 210,
          focus: pad(R(s, "steps"), 60),
          mark: { box: pad(R(s, "steps"), 4), label: "Rename, add, move, delete — then Apply" },
        },
      ]}
      lines={[
        { at: 8, text: "Review everything. Rename tentacles, pick their folders." },
        {
          at: 120,
          text: "Each to-do says *exactly when it's done* — and which decision it serves.",
        },
        { at: 210, text: "Edits save by themselves. Then *Apply.*" },
      ]}
    />
  );
};

export const NeedsOctogent = () => {
  const s = "16-handoff-needs-octogent";
  const note: Box = [381, 400, 760, 26];
  return (
    <Tour
      src={S(s)}
      end={300}
      beats={[
        {
          at: 14,
          focus: pad(R(s, "results"), 30),
          mark: { box: R(s, "results"), label: "Octogent isn't running yet", color: C.red },
        },
        {
          at: 110,
          focus: pad(R(s, "launch"), 40),
          mark: { box: note, label: "The fix is right here" },
        },
        {
          at: 190,
          focus: pad(R(s, "run"), 200),
          click: R(s, "run"),
          mark: { box: pad(R(s, "run"), 4), label: "One click" },
        },
      ]}
      lines={[
        {
          at: 8,
          text: "First time? Octogent isn't running in this folder yet — and Octoplan *tells you.*",
        },
        { at: 110, text: "No terminal commands to remember." },
        { at: 190, text: "Press *Run Octogent.*" },
      ]}
    />
  );
};

export const RunOctogent = () => {
  const s = "17-run-octogent";
  return (
    <Tour
      src={S(s)}
      end={300}
      beats={[
        {
          at: 14,
          focus: pad(R(s, "launch"), 30),
          mark: { box: pad(R(s, "chip"), 4), label: "Running — on its real port", color: C.green },
        },
        {
          at: 120,
          focus: pad(R(s, "open"), 200),
          mark: { box: pad(R(s, "open"), 4), label: "Open it" },
        },
        {
          at: 200,
          focus: pad(R(s, "trust"), 30),
          mark: { box: pad(R(s, "trust"), 6), label: "Remember this one!", color: C.red },
        },
      ]}
      lines={[
        {
          at: 8,
          text: "Octoplan sets Octogent up, opens it in a *terminal window,* and waits for it.",
        },
        { at: 120, text: "Already running? The button just becomes *Open Octogent.*" },
        { at: 200, text: "Tip: the first agent may ask to *trust this folder.* Say yes." },
      ]}
    />
  );
};

export const HandoffDone = () => {
  const s = "18-handoff-done";
  return (
    <Tour
      src={S(s)}
      end={300}
      beats={[
        {
          at: 14,
          focus: pad(R(s, "done"), 10),
          zoom: 1.5,
          mark: { box: pad(R(s, "done"), 4), label: "Retry apply → written", color: C.green },
        },
        {
          at: 110,
          focus: pad(R(s, "prompt"), 20),
          mark: { box: R(s, "prompt"), label: "The octopus prompt" },
        },
        {
          at: 210,
          focus: pad(R(s, "copy"), 200),
          click: R(s, "copy"),
          mark: { box: pad(R(s, "copy"), 4), label: "Copy" },
        },
      ]}
      lines={[
        { at: 8, text: "*Retry apply* — the tentacles and their to-dos are now in Octogent." },
        {
          at: 110,
          text: "Octoplan also wrote the *octopus prompt:* instructions for the lead agent.",
        },
        { at: 210, text: "Copy it. You'll paste it into Octogent in a second." },
      ]}
    />
  );
};

// ---------------------------------------------------------------- part 3: build it

export const Part3 = () => (
  <Chapter part="PART 3" title="BUILD IT" sub="In *Octogent.* Your agents take it from here." />
);

export const BuildStep = () => {
  const s = "19-build";
  return (
    <Tour
      src={S(s)}
      end={220}
      beats={[
        {
          at: 14,
          focus: pad(R(s, "cards"), 20),
          mark: { box: R(s, "cards"), label: "Each tentacle's progress" },
        },
        {
          at: 120,
          focus: pad(R(s, "stepper"), 20),
          mark: { box: R(s, "build"), label: "Step 7: Build", side: "bottom", color: C.green },
        },
      ]}
      lines={[
        {
          at: 8,
          kicker: "STEP 7 · BUILD",
          text: "Back in Octoplan, *Build* tracks every tentacle as the to-dos get ticked.",
        },
        { at: 120, text: "You can always see how far along the build is." },
      ]}
    />
  );
};

export const OgDeck = () => {
  const s = "20-og-deck";
  const card: Box = [314, 90, 410, 580];
  const progress: Box = [626, 240, 92, 22];
  const spawn: Box = [316, 94, 118, 32];
  return (
    <Tour
      src={S(s)}
      end={330}
      beats={[
        {
          at: 14,
          focus: "full",
          mark: { box: [312, 88, 1256, 1120], label: "The Deck: your tentacles", side: "bottom" },
        },
        {
          at: 100,
          focus: card,
          mark: { box: pad(progress, 4), label: "0 of 11 to-dos", color: C.green },
        },
        {
          at: 200,
          focus: pad(spawn, 200),
          click: spawn,
          mark: { box: pad(spawn, 4), label: "Spawn an agent" },
        },
      ]}
      lines={[
        {
          at: 8,
          kicker: "OCTOGENT · DECK (PRESS 2)",
          text: "Here they are: the three tentacles Octoplan handed off.",
        },
        { at: 100, text: "Each has its own *to-do list* — straight from your plan." },
        { at: 200, text: "*Spawn* starts a Claude agent on that tentacle." },
      ]}
    />
  );
};

export const OgTentacle = () => {
  const s = "22-og-tentacle";
  const actions: Box = [627, 322, 1352, 48];
  const todos: Box = [627, 460, 1352, 530];
  return (
    <Tour
      src={S(s)}
      end={290}
      beats={[
        {
          at: 14,
          focus: actions,
          zoom: 1.6,
          mark: { box: actions, label: "Create Agent — or a whole swarm" },
        },
        {
          at: 130,
          focus: todos,
          zoom: 1.4,
          mark: { box: todos, label: "The agent's checklist", color: C.green, side: "top" },
        },
      ]}
      lines={[
        {
          at: 8,
          kicker: "OCTOGENT · AGENTS (PRESS 1)",
          text: "Click a tentacle: *Create Agent,* or spawn a swarm for big lists.",
        },
        { at: 130, text: "Agents work through the list and tick items off as they finish." },
      ]}
    />
  );
};

export const OgAgents = () => {
  const s = "21-og-agents";
  const boss: Box = [930, 575, 130, 120];
  return (
    <Tour
      src={S(s)}
      end={260}
      beats={[
        {
          at: 14,
          focus: [760, 440, 480, 430],
          mark: { box: boss, label: "The octopus: your lead agent", side: "right" },
        },
        {
          at: 130,
          focus: [760, 440, 480, 430],
          mark: {
            box: boss,
            label: "Paste the octopus prompt here",
            color: C.green,
            side: "right",
          },
        },
      ]}
      lines={[
        { at: 8, text: "In the middle: the *octopus.* It coordinates the tentacles." },
        {
          at: 130,
          text: "Open it, *paste the octopus prompt* — it plans the waves and starts the agents.",
        },
      ]}
    />
  );
};

export const OctopusRules = () => (
  <Backdrop glow={C.green}>
    <Center style={{ gap: 36 }}>
      <Kicker text="WHAT THE OCTOPUS PROMPT TELLS THE TEAM" from={0} color={C.green} />
      <div style={{ display: "grid", gap: 22, width: 1300 }}>
        {[
          ["Who does what", "every tentacle and the folders it owns"],
          ["In what order", "waves: foundations first, then features"],
          ["No collisions", "each agent stays in its own folders"],
          ["Leave a trail", "commits cite the decision they implement (D12…)"],
        ].map(([title, body], i) => (
          <PopCard key={title} from={10 + i * 20} accent={i % 2 ? C.amber : C.green}>
            <div style={{ display: "flex", gap: 30, alignItems: "baseline" }}>
              <div
                style={{
                  fontFamily: FONT.sans,
                  fontWeight: 900,
                  fontSize: 42,
                  color: C.text,
                  width: 360,
                }}
              >
                {title}
              </div>
              <div style={{ fontFamily: FONT.sans, fontWeight: 600, fontSize: 34, color: C.muted }}>
                {body}
              </div>
            </div>
          </PopCard>
        ))}
      </div>
    </Center>
  </Backdrop>
);

export const RealDeck = () => {
  const s = "23-og-real-deck";
  const card: Box = [314, 90, 410, 555];
  const done: Box = [620, 265, 97, 22];
  return (
    <Tour
      src={S(s)}
      end={300}
      beats={[
        {
          at: 14,
          focus: "full",
          mark: {
            box: [312, 88, 1676, 1120],
            label: "6 tentacles · every to-do done",
            color: C.green,
          },
        },
        { at: 140, focus: card, mark: { box: pad(done, 4), label: "12 of 12 ✓", color: C.green } },
      ]}
      lines={[
        {
          at: 8,
          kicker: "A REAL PROJECT",
          text: 'This is what "done" looks like. Real footage: *Octoplan itself* was built this way.',
        },
        { at: 140, text: "Every to-do ticked, by agents, from a plan made in Octoplan." },
      ]}
    />
  );
};

export const Loop = () => {
  const frame = useCurrentFrame();
  const items = [
    ["Plan", "question cards → decisions", C.amber],
    ["Hand off", "tentacles + to-dos", C.amber],
    ["Build", "agents tick to-dos", C.green],
    ["Harvest", "decisions made while building come back", C.green],
  ] as const;
  return (
    <Backdrop>
      <Center style={{ gap: 44 }}>
        <Caption text="And it *comes back around.*" from={0} size={70} />
        <div style={{ display: "flex", gap: 22, alignItems: "center" }}>
          {items.map(([title, body, color], i) => (
            <div key={title} style={{ display: "flex", alignItems: "center", gap: 22 }}>
              <PopCard from={16 + i * 22} accent={color}>
                <div style={{ width: 300 }}>
                  <div style={{ fontFamily: FONT.pixel, fontSize: 34, color }}>{title}</div>
                  <div
                    style={{
                      fontFamily: FONT.sans,
                      fontWeight: 600,
                      fontSize: 28,
                      color: C.muted,
                      marginTop: 10,
                    }}
                  >
                    {body}
                  </div>
                </div>
              </PopCard>
              {i < items.length - 1 ? (
                <div
                  style={{
                    fontFamily: FONT.pixel,
                    fontSize: 44,
                    color: C.amber,
                    opacity: interpolate(frame, [30 + i * 22, 40 + i * 22], [0, 1], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    }),
                  }}
                >
                  →
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <Caption
          text="Agents' choices show up in *Needs attention.* Accept or reject — your plan stays true."
          from={120}
          size={42}
          weight={700}
        />
      </Center>
    </Backdrop>
  );
};

export const Recap = () => {
  const lines: Array<[string, string]> = [
    ["Start", "new idea, or import what you have"],
    ["Understand", "check what Claude read; keep, edit, drop"],
    ["Interview", "answer the cards"],
    ["Goal", "a checkable definition of done"],
    ["Stages", "step-by-step build prompts"],
    ["Hand off", "tentacles + to-dos + octopus prompt"],
    ["Build", "Run Octogent, paste the prompt, watch"],
  ];
  return (
    <Backdrop>
      <Center style={{ gap: 24 }}>
        <Kicker text="RECAP" from={0} />
        <Caption text="The whole thing, in *seven steps.*" from={4} size={58} />
        <div style={{ display: "grid", gap: 14, width: 1250, marginTop: 10 }}>
          {lines.map(([step, what], i) => (
            <PopCard key={step} from={20 + i * 14} accent={i < 5 ? C.amber : C.green}>
              <div style={{ display: "flex", gap: 26, alignItems: "baseline" }}>
                <div style={{ fontFamily: FONT.pixel, fontSize: 30, color: C.amber, width: 60 }}>
                  {i + 1}
                </div>
                <div
                  style={{
                    fontFamily: FONT.sans,
                    fontWeight: 900,
                    fontSize: 36,
                    color: C.text,
                    width: 280,
                  }}
                >
                  {step}
                </div>
                <div
                  style={{ fontFamily: FONT.sans, fontWeight: 600, fontSize: 30, color: C.muted }}
                >
                  {what}
                </div>
              </div>
            </PopCard>
          ))}
        </div>
      </Center>
    </Backdrop>
  );
};

export const GetStarted = () => (
  <Backdrop>
    <Center style={{ gap: 30, alignItems: "flex-start", width: 1400 }}>
      <Kicker text="GET STARTED" from={0} />
      <Caption
        text="You need Node, git and *Claude Code* (logged in)."
        from={4}
        size={52}
        align="left"
      />
      <Caption
        text="1. Start Octoplan — in the octogent repo:"
        from={40}
        size={40}
        align="left"
        weight={700}
      />
      <Cmd from={56}>pnpm --filter @octogent/octoplan dev</Cmd>
      <Caption
        text="2. Open *127.0.0.1:5190* and pick a way in."
        from={110}
        size={40}
        align="left"
        weight={700}
      />
      <Caption
        text="3. Once, install Octogent's command:"
        from={160}
        size={40}
        align="left"
        weight={700}
      />
      <Cmd from={176}>pnpm install && pnpm build && npm install -g .</Cmd>
      <Caption
        text="Stuck? Press the button in the *Next* bar. The written guide: docs/octoplan/HOW-TO.md"
        from={240}
        size={36}
        align="left"
        weight={600}
        style={{ color: C.muted }}
      />
    </Center>
  </Backdrop>
);

export const Outro = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 12, stiffness: 110 } });
  return (
    <Backdrop>
      <Center style={{ gap: 24 }}>
        <div style={{ transform: `scale(${s})` }}>
          <Octopus size={170} />
        </div>
        <Caption text="*Plan* with Octoplan." from={10} size={92} weight={900} />
        <Caption text="_Build_ with Octogent." from={30} size={92} weight={900} />
      </Center>
    </Backdrop>
  );
};
