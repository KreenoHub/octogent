# Octoplan + Octogent: the tutorial video

[`octoplan-octogent-tutorial.mp4`](octoplan-octogent-tutorial.mp4) is a 1920x1080, 30 fps video, about 3.5 minutes long. It has no voice: big animated captions carry the story. It is made for someone new to Claude, and it explains what the two tools are, what they are for, and how to use them on the real UI.

The source is a Remotion project in [`apps/octoplan-video`](../../../apps/octoplan-video).

## What it covers

| # | Scene | What the viewer learns |
|---|-------|------------------------|
| 1 | Hook | Planning with AI in a terminal gets messy, fast. |
| 2 | Pains | Questions get buried, walls of text, forgotten decisions, no big picture. |
| 3 | Title | Octoplan + Octogent: a calmer way to plan and build with Claude. |
| 4 | What is Claude | Claude, then Claude Code (Claude working inside your project folder), and the questions it asks you. |
| 5 | Two tools | Two tools, two jobs: Octoplan plans, Octogent builds. |
| 6 | The octopus | Each tentacle is one area of the project with its own notes and to-do list; agents work side by side. |
| 7 | Octogent: Agents | Every tentacle is a lane of work your agents can pick up. |
| 8 | Octogent: Deck | The Deck: every tentacle's job, to-do list and progress (here, Octoplan's own 6 tentacles). |
| 9 | Octoplan cockpit | Left: projects and conversations. Middle: question cards. Right: the plan building itself. |
| 10 | New session | + New session, and the session types (deep interview, quick align, brainstorm). |
| 11 | Question cards | 1–9 to pick, Enter to send, T to mark an answer tentative. |
| 12 | Park and revise | P parks a question, R revises an answer and dependent decisions go STALE. |
| 13 | Focus | F: one question at a time, full screen. |
| 14 | Plan board | Decisions, gaps and risks, live, saved as plain files in `docs/plan`. |
| 15 | Idea capture | I: jot an idea down mid-conversation and keep going. |
| 16 | Brainstorm | Star, park, merge or kill ideas, then Converge. |
| 17 | Graph | G: the project's branches, and each agent's lane, at a glance. |
| 18 | Stages | The plan becomes build-in-stages prompts, each with its own checklist. |
| 19 | Export | Send the tasks to an Octogent tentacle and let the agents build. |
| 20 | The loop | Plan, build, and around again as the project grows. |
| 21 | Get started | The commands that start both tools. |
| 22 | Outro | Think with Octoplan. Build with Octogent. |

Every UI shot is a real screenshot of Octoplan and Octogent. They come from a demo project (a small habit-tracker CLI) running on its own ports, so no real sessions appear in the video.

## Editing and re-rendering

From `apps/octoplan-video`:

```bash
pnpm install                                  # once, from the repo root
pnpm studio                                   # Remotion Studio: scrub, tweak, preview live
pnpm build                                    # typecheck
pnpm render                                   # writes docs/octoplan/tutorial/octoplan-octogent-tutorial.mp4
pnpm still -- out/frame.png --frame=3450      # one frame as a PNG, for quick checks
```

- Scene order and lengths live in `src/Tutorial.tsx` (`SCENES`).
- The talking scenes are in `src/scenes/Explainers.tsx`. The UI tour scenes are in `src/scenes/Tour.tsx`.
- In captions, `*words*` are painted amber and `_words_` green.
- `Shot` (in `src/components/Shot.tsx`) moves the camera over a screenshot with `cams` keyframes and draws labelled highlight boxes with `marks`. Coordinates are in the screenshot's CSS pixels (2000x1250).

## Re-capturing the screenshots

`tools/captureUi.mjs` drives headless Edge over the DevTools protocol. It follows the steps in `tools/shots.json` (wait, press a key, click, type, scroll) and saves 2x PNGs.

1. Start Octoplan and Octogent on the ports in `tools/shots.json`, with a demo project that has a couple of answered sessions.
2. Update the session ids in `tools/shots.json`.
3. Run `pnpm capture -- tools/shots.json public/shots`.

If a screen's layout changes, check the `marks` boxes in `Tour.tsx`, because they point at fixed pixel positions.
