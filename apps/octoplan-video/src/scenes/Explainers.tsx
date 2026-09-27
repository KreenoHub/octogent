import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop, Center, Cmd, KeyCap, PopCard } from "../components/Bits";
import { Caption, Kicker } from "../components/Caption";
import { Octopus } from "../components/Octopus";
import { C, FONT } from "../theme";

const TERMINAL_LINES = [
  "> claude",
  "Reading 42 files...",
  "Here's my plan (1 of 7): first we'll restructure the store, then...",
  "? Which database should we use? 1) SQLite 2) Postgres 3) JSON",
  "Running tests... 318 passed, 2 failed",
  "Actually, before that, let me also consider the authentication flow...",
  "? Should the API be public? (y/n)",
  "Editing src/server/routes.ts (+212 -48)",
  "As we discussed earlier (did we?), the decision was...",
  "? Which of these 4 options do you prefer for the cache?",
  "Scrolling... scrolling... where was that question again?",
];

/** 1. Hook: a chaotic terminal floods the screen, then freezes. */
export const Hook = () => {
  const frame = useCurrentFrame();
  const scroll = frame * 9;
  const shake = frame > 120 ? 0 : Math.sin(frame * 1.7) * 2;
  return (
    <Backdrop glow={C.red}>
      <div
        style={{
          position: "absolute",
          inset: 60,
          fontFamily: FONT.mono,
          fontSize: 30,
          color: C.green,
          overflow: "hidden",
          // Busy at first, then it steps back so the headline reads cleanly.
          opacity: interpolate(frame, [0, 14, 30, 110, 150], [0.95, 0.95, 0.32, 0.32, 0.14], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          transform: `translate(${shake}px, 0)`,
        }}
      >
        <div style={{ transform: `translateY(${-scroll % 1400}px)` }}>
          {Array.from({ length: 60 }, (_, i) => {
            const line = TERMINAL_LINES[i % TERMINAL_LINES.length] ?? "";
            return (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: lines repeat, so the index is the identity
                key={`l-${i}`}
                style={{ color: line.startsWith("?") ? C.amber : C.green, marginBottom: 10 }}
              >
                {line}
              </div>
            );
          })}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 60% 45% at 50% 50%, rgba(5,6,7,.92), rgba(5,6,7,.35) 70%, transparent)",
          opacity: interpolate(frame, [14, 30], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
      <Center>
        <Caption text="Planning with AI in a terminal..." from={20} size={84} />
        <Caption text="gets *messy.* Fast." from={70} size={120} weight={900} />
      </Center>
    </Backdrop>
  );
};

/** 2. The four pains. */
export const Pains = () => {
  const items = [
    ["01", "Questions get buried", "Claude asks something important... then it scrolls away."],
    ["02", "Walls of text", "Long answers you have to read top to bottom."],
    ["03", "Decisions get forgotten", "Close the window and the plan is gone."],
    ["04", "No big picture", "What's decided? What's left? Nobody knows."],
  ];
  return (
    <Backdrop>
      <Center style={{ gap: 50 }}>
        <Caption text="Sound familiar?" from={0} size={70} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 34, width: 1500 }}>
          {items.map(([n, title, body], i) => (
            <PopCard key={n} from={18 + i * 16} accent={i % 2 === 0 ? C.amber : C.red}>
              <div
                style={{ fontFamily: FONT.pixel, fontSize: 30, color: C.amber, marginBottom: 12 }}
              >
                {n}
              </div>
              <div style={{ fontFamily: FONT.sans, fontWeight: 800, fontSize: 44, color: C.text }}>
                {title}
              </div>
              <div
                style={{
                  fontFamily: FONT.sans,
                  fontWeight: 500,
                  fontSize: 28,
                  color: C.muted,
                  marginTop: 10,
                }}
              >
                {body}
              </div>
            </PopCard>
          ))}
        </div>
      </Center>
    </Backdrop>
  );
};

/** 3. Title reveal. */
export const Title = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 6, fps, config: { damping: 12, stiffness: 120 } });
  const glitch = frame > 40 && frame < 46 ? 8 : 0;
  return (
    <Backdrop>
      <Center style={{ gap: 30 }}>
        <div style={{ transform: `scale(${s})` }}>
          <Octopus size={200} />
        </div>
        <Caption text="Meet" from={18} size={48} weight={600} style={{ color: C.muted }} />
        <div
          style={{
            display: "flex",
            gap: 40,
            alignItems: "center",
            fontFamily: FONT.pixel,
            fontSize: 120,
            color: C.amber,
            textShadow: `${glitch}px 0 ${C.red}, ${-glitch}px 0 ${C.cyan}, 0 0 50px ${C.amber}66`,
            opacity: interpolate(frame, [26, 36], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <span>OCTOGENT</span>
          <span style={{ color: C.text, fontSize: 90 }}>+</span>
          <span>OCTOPLAN</span>
        </div>
        <Caption
          text="A calmer way to *plan* and *build* with Claude."
          from={60}
          size={52}
          weight={700}
        />
      </Center>
    </Backdrop>
  );
};

/** 4. What is Claude Code? For someone who has never used it. */
export const WhatIsClaude = () => {
  const frame = useCurrentFrame();
  const step = frame < 150 ? 0 : frame < 300 ? 1 : 2;
  return (
    <Backdrop>
      <div style={{ position: "absolute", left: 140, top: 150, width: 820 }}>
        <Kicker text="FIRST, THE BASICS" from={0} />
        <div style={{ height: 30 }} />
        <Caption
          text="*Claude* is an AI assistant you talk to in plain language."
          from={8}
          size={54}
          align="left"
        />
        <div style={{ height: 40 }} />
        {step >= 1 ? (
          <Caption
            text="*Claude Code* is Claude working inside your project folder: it reads files, writes code and runs commands."
            from={150}
            size={44}
            align="left"
            weight={700}
          />
        ) : null}
        <div style={{ height: 40 }} />
        {step >= 2 ? (
          <Caption
            text="When it needs you, it asks a question with options. That's where _Octoplan_ comes in."
            from={300}
            size={44}
            align="left"
            weight={700}
          />
        ) : null}
      </div>
      <div style={{ position: "absolute", right: 140, top: 230, width: 620 }}>
        <PopCard from={40}>
          <div style={{ fontFamily: FONT.mono, fontSize: 26, color: C.muted }}>you</div>
          <div
            style={{
              fontFamily: FONT.sans,
              fontSize: 34,
              fontWeight: 700,
              color: C.text,
              marginTop: 8,
            }}
          >
            "Help me plan a habit-tracker app."
          </div>
        </PopCard>
        <div style={{ height: 30 }} />
        {step >= 2 ? (
          <PopCard from={310}>
            <div style={{ fontFamily: FONT.mono, fontSize: 26, color: C.amber }}>claude asks</div>
            <div
              style={{
                fontFamily: FONT.sans,
                fontSize: 32,
                fontWeight: 800,
                color: C.text,
                margin: "10px 0 16px",
              }}
            >
              Who is this app for?
            </div>
            {["Just me (Recommended)", "My family", "A whole team"].map((option, i) => (
              <div
                key={option}
                style={{
                  fontFamily: FONT.sans,
                  fontSize: 28,
                  color: i === 0 ? C.green : C.text,
                  padding: "10px 16px",
                  border: `1px solid ${i === 0 ? C.green : C.border}`,
                  borderRadius: 10,
                  marginTop: 10,
                }}
              >
                {i + 1}. {option}
              </div>
            ))}
          </PopCard>
        ) : null}
      </div>
    </Backdrop>
  );
};

/** 5. Two tools, two jobs. */
export const TwoTools = () => {
  const frame = useCurrentFrame();
  const arrow = interpolate(frame, [70, 100], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <Backdrop>
      <Center style={{ gap: 60 }}>
        <Caption text="Two tools. Two jobs." from={0} size={76} />
        <div style={{ display: "flex", alignItems: "center", gap: 50 }}>
          <PopCard from={20} style={{ width: 620 }}>
            <div style={{ fontFamily: FONT.pixel, fontSize: 56, color: C.amber }}>OCTOPLAN</div>
            <div
              style={{
                fontFamily: FONT.sans,
                fontSize: 40,
                fontWeight: 800,
                color: C.text,
                marginTop: 14,
              }}
            >
              Decide <span style={{ color: C.amber }}>what</span> to build
            </div>
            <div style={{ fontFamily: FONT.sans, fontSize: 28, color: C.muted, marginTop: 12 }}>
              Claude interviews you with clickable question cards, and every answer becomes part of
              a saved plan.
            </div>
          </PopCard>
          <div
            style={{
              fontFamily: FONT.pixel,
              fontSize: 90,
              color: C.amber,
              opacity: arrow,
              transform: `translateX(${(1 - arrow) * -40}px)`,
            }}
          >
            →
          </div>
          <PopCard from={45} style={{ width: 620 }} accent={C.green}>
            <div style={{ fontFamily: FONT.pixel, fontSize: 56, color: C.green }}>OCTOGENT</div>
            <div
              style={{
                fontFamily: FONT.sans,
                fontSize: 40,
                fontWeight: 800,
                color: C.text,
                marginTop: 14,
              }}
            >
              <span style={{ color: C.green }}>Build</span> it with many agents
            </div>
            <div style={{ fontFamily: FONT.sans, fontSize: 28, color: C.muted, marginTop: 12 }}>
              A dashboard that runs lots of Claude sessions at once, each with its own job and to-do
              list.
            </div>
          </PopCard>
        </div>
      </Center>
    </Backdrop>
  );
};

/** Octogent's metaphor before the screenshots: one octopus, many tentacles. */
export const OctopusMetaphor = () => {
  const frame = useCurrentFrame();
  const jobs = ["Docs", "Database", "API", "Frontend", "Tests", "Release"];
  return (
    <Backdrop glow={C.green}>
      <div style={{ position: "absolute", left: 140, top: 170, width: 760 }}>
        <Kicker text="OCTOGENT" from={0} color={C.green} />
        <div style={{ height: 24 }} />
        <Caption text="One *octopus.* Many *tentacles.*" from={6} size={72} align="left" />
        <div style={{ height: 34 }} />
        <Caption
          text="Each tentacle is one area of your project, with its own notes and its own to-do list."
          from={50}
          size={42}
          align="left"
          weight={700}
        />
        <div style={{ height: 30 }} />
        <Caption
          text="Agents pick up to-dos and work side by side, without stepping on each other."
          from={120}
          size={42}
          align="left"
          weight={700}
        />
      </div>
      <div style={{ position: "absolute", right: 440, top: 330 }}>
        <Octopus size={220} />
        {jobs.map((job, i) => {
          const angle = (i / jobs.length) * Math.PI * 2 - Math.PI / 2;
          const r = 300;
          const show = interpolate(frame, [40 + i * 10, 55 + i * 10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={job}
              style={{
                position: "absolute",
                left: 110 + Math.cos(angle) * r - 80,
                top: 120 + Math.sin(angle) * r - 26,
                width: 160,
                textAlign: "center",
                fontFamily: FONT.sans,
                fontWeight: 800,
                fontSize: 28,
                color: C.bg,
                background: [C.amber, C.green, C.pink, C.cyan, C.amberDeep, C.green][i],
                padding: "10px 0",
                borderRadius: 12,
                opacity: show,
                transform: `scale(${0.6 + 0.4 * show})`,
              }}
            >
              {job}
            </div>
          );
        })}
      </div>
    </Backdrop>
  );
};

/** 16. The loop. */
export const Loop = () => {
  const frame = useCurrentFrame();
  const steps = [
    ["PLAN", "Answer Claude's questions", C.amber],
    ["DECIDE", "Decisions land in docs/plan", C.amber],
    ["EXPORT", "Tasks go to an Octogent tentacle", C.green],
    ["BUILD", "Agents work the to-do list", C.green],
    ["TRACK", "Watch branches on the graph", C.cyan],
  ] as const;
  const active = Math.floor(frame / 36) % steps.length;
  return (
    <Backdrop>
      <Center style={{ gap: 60 }}>
        <Caption text="The whole loop" from={0} size={72} />
        <div style={{ display: "flex", gap: 26, alignItems: "stretch" }}>
          {steps.map(([name, body, color], i) => (
            <PopCard
              key={name}
              from={14 + i * 10}
              accent={color}
              style={{
                width: 300,
                padding: "30px 26px",
                background: i === active && frame > 60 ? `${color}22` : `${C.surface}ee`,
              }}
            >
              <div style={{ fontFamily: FONT.pixel, fontSize: 34, color }}>{name}</div>
              <div
                style={{
                  fontFamily: FONT.sans,
                  fontSize: 28,
                  fontWeight: 700,
                  color: C.text,
                  marginTop: 14,
                }}
              >
                {body}
              </div>
            </PopCard>
          ))}
        </div>
        <Caption
          text="...and around again, as the project grows."
          from={70}
          size={44}
          weight={600}
          style={{ color: C.muted }}
        />
      </Center>
    </Backdrop>
  );
};

/** 17. Getting started. */
export const GetStarted = () => (
  <Backdrop>
    <div style={{ position: "absolute", left: 140, top: 110, right: 140 }}>
      <Kicker text="GET STARTED" from={0} />
      <div style={{ height: 20 }} />
      <Caption text="Three steps. That's it." from={4} size={70} align="left" />
      <div style={{ display: "flex", flexDirection: "column", gap: 34, marginTop: 50 }}>
        <PopCard from={30}>
          <div
            style={{
              fontFamily: FONT.sans,
              fontSize: 36,
              fontWeight: 800,
              color: C.text,
              marginBottom: 16,
            }}
          >
            <span style={{ color: C.amber }}>1.</span> Open your project folder and start Octogent
          </div>
          <Cmd from={40}>octogent</Cmd>
        </PopCard>
        <PopCard from={110}>
          <div
            style={{
              fontFamily: FONT.sans,
              fontSize: 36,
              fontWeight: 800,
              color: C.text,
              marginBottom: 16,
            }}
          >
            <span style={{ color: C.amber }}>2.</span> Start Octoplan (from the Octogent folder)
          </div>
          <Cmd from={120}>pnpm --filter @octogent/octoplan dev</Cmd>
        </PopCard>
        <PopCard from={200}>
          <div style={{ fontFamily: FONT.sans, fontSize: 36, fontWeight: 800, color: C.text }}>
            <span style={{ color: C.amber }}>3.</span> Open{" "}
            <span style={{ fontFamily: FONT.mono, color: C.green }}>127.0.0.1:5190</span>, click{" "}
            <span style={{ color: C.amber }}>+ New session</span>, and answer the cards.
          </div>
        </PopCard>
      </div>
    </div>
  </Backdrop>
);

/** 18. Outro. */
export const Outro = () => {
  const frame = useCurrentFrame();
  return (
    <Backdrop>
      <Center style={{ gap: 34 }}>
        <Octopus size={160} />
        <Caption text="Think with *Octoplan.*" from={10} size={96} weight={900} />
        <Caption text="Build with _Octogent._" from={30} size={96} weight={900} />
        <div
          style={{
            display: "flex",
            gap: 22,
            marginTop: 20,
            opacity: interpolate(frame, [60, 75], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          {["F", "I", "B", "G"].map((k, i) => (
            <KeyCap key={k} k={k} from={60 + i * 4} size={80} pressAt={90 + i * 10} />
          ))}
        </div>
      </Center>
    </Backdrop>
  );
};
