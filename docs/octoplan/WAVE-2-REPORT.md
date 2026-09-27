# Wave 2 report — branching, git graph, ideas, stages, export, terminal

Date: 2026-09-27 · Branch: `feat/octoplan` · Coordinator: the octopus (D28, D33)

**Result: every wave-2 feature works live.** `e2e:wave2` ran against real Claude, git, `gh` and a PTY, and all 8 checks passed. With wave 1, all 34 tentacle tasks are done (Octogent Deck: bridge 6/6, integrations 5/5, modes 7/7, qcards 4/4, store 5/5, ui-shell 7/7).

## What shipped

| Tentacle | What | Commit | Tests |
|---|---|---|---|
| contracts (octopus) | Protocol events, the separate pop-out terminal channel, store/modes/integrations/PTY seams, web slots, node-pty + xterm (D33) | `328f322` | protocol 32 |
| store | Idea updates, stages, conversation branches; cross-project idea registry (`~/.octoplan/projects.json`) | `c8fd8d0` | 39 |
| modes | Brainstorm transitions (star, park, kill, adopt, merge, reopen), converge turn, staged build prompts, BrainstormBoard | `9da0cb1` | 112 |
| bridge | Pop-out terminal (`claude --resume` in a PTY over `/ws/terminal/<id>`), conversation branching (SDK fork), converge | `8d4bf60` | 53 |
| ui-shell | Card actions (pin, collapse, → task, → decision, park, follow-up), idea capture (I) and search, graph overlay (G), branch dialog (B), terminal panel, brainstorm board, stages list, Export to Octogent dialog, toasts | `65482d9` | 70 |
| integrations | Octogent tentacle export, git graph with lanes, ahead/behind, tentacle swimlanes, PR/CI badges, BranchGraph view, a Windows-safe exec that never uses a shell | `044b811` | 52 |
| wiring (octopus) | `planOps.ts` for the six plan events; real deps in `main.ts`; real components in the slots; converge marks ideas adopted (D34) | `63c902b` | 5 |

**Checks at the end of the wave:** Biome clean; octoplan **355/355**; protocol **32/32**; tsc clean; vite build OK.

## Live gate

`pnpm --filter @octogent/octoplan e2e:wave2 -- <octogent repo> <scratch with GOAL.md> <brainstorm scratch>`. The log is in [`evidence/wave-2-live-gate/e2e-wave2-run.log`](./evidence/wave-2-live-gate/e2e-wave2-run.log).

| Check | Result |
|---|---|
| Git graph (this repo, real git + gh) | 352 commits, 11 branches, 14 PRs, gh available |
| Staged prompts from GOAL.md | 5 stages written to `docs/plan/stages/` (copied to [`evidence/…/stages`](./evidence/wave-2-live-gate/stages/)) |
| Tentacle export wiring | Clear refusal where Octogent isn't running: "Start Octogent in this repo first (run `octogent` there)" |
| Brainstorm with real Claude | Claude added ideas through `plan_add_idea` (I1 "`hb <habit>` toggles today", I2 "Append-only plain-text log") |
| Star ideas | I1 and I2 starred through `update-idea` |
| Converge | Decisions 2 → 10, and I1 and I2 marked adopted |
| Branch session (SDK fork) | B1 "What if it syncs to a phone?" recorded in `branches.md`; the forked Claude session started |
| Pop-out terminal | 1,066 bytes streamed from `claude --resume <id>` in a real PTY |

The brainstorm repo's full `docs/plan` is in [`evidence/wave-2-live-gate/brainstorm-repo-plan/`](./evidence/wave-2-live-gate/brainstorm-repo-plan/), including both session logs: the brainstorm and its fork.

## Not verified live, and known gaps

- **Tentacle export with Octogent running.** Only the refusal path ran live. Creating the tentacle, preserving the managed block and deduping todos are covered by tests on recorded fixtures. I didn't create a test tentacle in your real Deck.
- **What the pop-out terminal showed.** The gate proves the PTY launches and streams output, but not what rendered. For a never-trusted scratch folder that's probably Claude's startup or trust screen.
- **No wave-2 screenshots.** The graph and brainstorm views were rendered only in component tests.
- **Fork PRs can badge the wrong branch.** The `gh pr list` fields have only `headRefName`, so a fork PR whose head is `main` attaches to local `main`. The fix is to add `headRepositoryOwner`.
- **Export overwrites CONTEXT.md notes.** It rewrites everything outside Octogent's managed block, so hand-written notes there are lost.
- **Branch cards.** A branch session opens with an empty conversation pane. The forked Claude has the full context, but the parent's cards aren't copied.
- **"Branch from this card"** isn't there yet: B always branches the active session (no `fromBlockId` from the UI).
- **Duplicated action rules.** The brainstorm board keeps its own copy of the legal-action table, because the web can't import server code.
- **Terminal on macOS.** The node-pty spawn-helper chmod (which `apps/api` does) isn't done; Windows is verified.

## Process notes

- **The in-worktree approach worked cleanly.** All 5 workers built in disjoint folders of the octopus worktree, ran their own checks, and made no git changes. The octopus reviewed and committed each tentacle separately. There were no isolation denials this wave, because the workers were told the right sandbox from the start.
- **Seeding stubs was worth it.** Every contract seam had a throwing stub, so the tree type-checked the whole time. The only cross-worker tsc errors were transient (test files importing modules that didn't exist yet).
- **Two tests tracked contract changes, not bugs.** The terminal socket test had used "Not wired yet" as its probe, and it changed once the events were wired. The deep-link test pulled in xterm through `CockpitLayout`, so its pure helper moved to `web/src/app/overlays.ts`.
