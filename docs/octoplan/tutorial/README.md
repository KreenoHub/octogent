# Octoplan + Octogent: the tutorial videos

| Video | Covers | Length |
|---|---|---|
| [`octoplan-v3-tutorial.mp4`](octoplan-v3-tutorial.mp4) | **Current (v3).** The whole journey for a first-time user: a new idea or an import, the "What I understood" review, the interview, goal, stages, the handoff, Run Octogent, and the agents building in Octogent | about 5 min 20 s |
| [`octoplan-octogent-tutorial.mp4`](octoplan-octogent-tutorial.mp4) | The original (v1) tour: the cockpit, question cards, the plan board, brainstorm, graph, export | about 3.5 min |

Both are 1920x1080, 30 fps, with no voice: big animated captions carry the story. The written companion is [`../HOW-TO.md`](../HOW-TO.md). The source is a Remotion project in [`apps/octoplan-video`](../../../apps/octoplan-video).

## The v3 video, scene by scene

| Part | Scenes | What the viewer learns |
|---|---|---|
| Intro | Hook · Title · What is Claude · Two apps · Seven steps | Octoplan plans with you through question cards; Octogent's agents build. Seven steps, and a bar that always says what to do next. |
| 1 · Plan it | Home · New from an idea · Import · Reading · What I understood · Items and evidence · Assumptions · Disagreements · Interview · Card keys · Focus · Answered rounds · Goal · Stages | Both ways in; how an import is read and reviewed (maturity, found vs inferred, sources that disagree); answering cards; the plan board and coverage; GOAL.md and build prompts. |
| 2 · Hand it off | Generate · Review · Needs Octogent · Run Octogent · Done | Tentacles and to-dos; the "start Octogent first" moment and the one-click fix; the octopus prompt. |
| 3 · Build it | The octopus · Build step · Deck · A tentacle · Agents · Octopus prompt rules · A real finished project | What Octogent shows, how agents are started, and what "done" looks like. |
| Outro | The loop · Recap · Get started · Outro | Harvest brings build-time decisions back; the seven steps; the commands. |

All UI footage is real. Octoplan and Octogent shots come from a demo project ("tally", a small CLI) run on private ports by `tools/footageV3.mjs`. The finished-project shot is the real Octogent Deck for Octoplan's own build.

## Editing and re-rendering

From `apps/octoplan-video`:

```bash
pnpm install                                  # once, from the repo root
pnpm studio                                   # Remotion Studio: pick TutorialV3, scrub, preview
pnpm build                                    # typecheck
pnpm render:v3                                # writes docs/octoplan/tutorial/octoplan-v3-tutorial.mp4
pnpm render                                   # the v1 video
npx remotion still src/index.ts TutorialV3 out/frame.png --frame=2440   # one frame, for checks
```

- v3 scene order and lengths: `src/v3/TutorialV3.tsx` (`SCENES_V3`). The scenes: `src/v3/scenes.tsx`.
- A tour scene is a list of **beats** (`src/v3/kit.tsx`): where the camera looks, what gets highlighted, where the cursor clicks. Captions are **lines** with a start frame.
- Boxes come from `R(shot, name)`, which reads the element positions recorded at capture time (`src/v3/rects.ts`). So highlights follow the real UI after a re-shoot, with no hand-measured pixels (Octogent's own screens are the exception).
- In captions, `*words*` are painted amber and `_words_` green.

## Re-shooting the v3 footage

```bash
node tools/footageV3.mjs      # from apps/octoplan-video; takes a few minutes of real Claude time
node tools/rectsToTs.mjs      # refresh src/v3/rects.ts from the recorded element boxes
```

`footageV3.mjs` builds a demo repo, a spec and a notes folder in a temp folder, starts a private Octoplan (`:8797`, web `:5197`) and drives the whole workflow through it with real Claude: import, review, interview, GOAL.md, stages, handoff, and Run Octogent (headless, private home, `:9878`). It takes a screenshot at every step. The servers stay up at the end (`footage-state.json` in the temp folder) so single shots can be retaken with `tools/captureUi.mjs`. That tool can also click at a position (`clickAt`), choose a dropdown option (`select`), scroll to an element (`scrollIntoView`) and run a snippet (`eval`).

## Re-capturing the v1 screenshots

`tools/captureUi.mjs` follows the steps in `tools/shots.json` and saves 2x PNGs to `public/shots`. Start Octoplan and Octogent on the ports in that file, update the session ids, then run `pnpm capture -- tools/shots.json public/shots`. The v1 highlight boxes in `src/scenes/Tour.tsx` are fixed pixel positions, so check them after a layout change.
