# Todo

_No wave-1 items. Integrations start after the MVP gate (Prompt 4)._

## Wave 2

- [x] **Export plan → Octogent tentacle** — `apps/octoplan/server/integrations/octogentExport.ts`: `exportToTentacle({ repoPath, tentacleId, goal, decisions, tasks })`. If `.octogent/tentacles/<id>/` is missing, run `octogent tentacle create <id> --description <one line>` (argument array, cwd = repoPath). Report "start Octogent in this repo first" if the CLI says the API is unreachable. Rewrite CONTEXT.md's human section from GOAL.md + active decisions, keeping the first heading and paragraph as the Deck name/description, and leave any `<!-- octogent:suggested-skills:start -->` block untouched. Append tasks to todo.md as `- [ ] ` lines, each ending in "Done when …", skipping exact duplicates. Done when tests with a temp repo and fake exec assert the CLI args, the CONTEXT.md content (managed block preserved), and duplicate-free todo appends.
- [x] **Git graph data** — `server/integrations/gitGraph.ts`: Parse `git log --all --date-order --format=%H%x1f%P%x1f%D%x1f%s%x1f%at` into commits with parents and refs, and assign lanes (a simple column allocator, first-parent stays in lane). `listBranches()` returns `GitBranchNode[]` with ahead/behind main from `git rev-list --left-right --count main...<branch>`. Map `octogent/*` branches to `tentacleId`. Done when fixture tests (recorded output with merges and worker branches) assert lanes, refs and tentacle mapping.
- [x] **Branch graph view (G)** — `web/src/integrations/BranchGraph.tsx`: an SVG with lanes, commit dots and ref labels in Octogent tokens, plus tentacle swimlanes grouping `octogent/*` branches with ahead/behind chips. Opened with G, closed with Esc, and a click on a branch shows its details. Done when a jsdom test renders fixture data and asserts lanes, labels and swimlane grouping, and a manual run on this repo shows the real graph.
- [x] **PR + CI badges** — `server/integrations/github.ts` reads `gh pr list --json number,title,headRefName,state,isDraft,url` and `gh pr checks <n> --json state` into `PrStatus[]`, polled with backoff only while the graph is open, and attaches badges to branch nodes. Without `gh` it returns an empty list plus a hint. Done when fixture tests cover passing/failing/pending/none and missing `gh`, and badges render in the graph.
- [x] **Conversation ↔ git branch mapping** — read and write `docs/plan/branches.md` through the store's branch records. In the graph, draw conversation branches (B-records) next to their `git-branch`, and let the user link an existing git branch to a conversation branch. Done when a test links B1 to a fixture branch and the graph test asserts the linked marker.

## v2

Planned in Octoplan (docs/plan/GOAL.md, DECISIONS.md D1–D43). Ids in brackets are the decisions each task implements; cite them in commit messages (D26).

### Wave 4 — memory (D41)

- [ ] [D36, D26] **Managed-block export with D-ids** — export writes only between `<!-- octoplan:start -->` / `<!-- octoplan:end -->` in CONTEXT.md, leaves hand notes and Octogent's managed block alone, and stamps each todo line with its D-ids (dedupe by text). Done when a test exports twice into a CONTEXT.md with hand notes and both managed blocks, and the hand notes are byte-identical.
- [ ] [D11, D31] **Harvest inputs** — collect commits on octogent/* branches and todo.md/CONTEXT.md diffs since the last harvest mark for the bridge's harvest pass. Done when a fixture repo test returns exactly the commits and todo diffs after the mark.

### Wave 5 — overview (D41)

- [ ] [D22] **Tentacle summary from disk** — parse `.octogent/tentacles/*/todo.md` checkboxes into per-tentacle n/m plus ahead/behind main, PR/CI and last activity, with no Octogent API. Done when a fixture test returns the right counts with Octogent not running.
- [ ] [D21, D23] **G tentacle cards** — G opens to one pixel card per tentacle (name, todo progress bar, CI and PR dots, ahead/behind arrows); the commit graph sits below as drill-down. Done when a component test renders one card per fixture tentacle and a headless screenshot is saved for e2e:v2.
- [ ] [D26, D24] **Drift computation** — grep git log on tentacle branches for D-ids: untouched (no cites), implemented (todo ticked or cited commits merged), diverged (a harvested candidate contradicts it). Done when a fixture test yields all three states.
- [ ] [D37] **Fork-PR badges** — read `headRepositoryOwner` from `gh pr list` so a fork PR headed at `main` no longer badges local main. Done when a test with that gh fixture shows no badge on local main.
- [ ] [D37, D39] **Live export check** — the gate creates a throwaway tentacle through a running Octogent and checks CONTEXT.md, todo.md and its G card. Done when e2e:v2 prints a pass line for the live export.

### Dogfood fixes (found while planning v2 in Octoplan)

- [ ] **Export can't target a section** — `appendTodos` appends at the end of todo.md, so a `## v2` (or per-wave) heading can't be chosen; the v2 plan was placed by hand. Done when export accepts an optional heading, creates it if missing, appends under it, and a test covers both cases.
- [ ] **Export from a worktree misses the live tentacles** — export writes `<repoPath>/.octogent/tentacles`, so a session opened on a git worktree targets an empty `.octogent` instead of the checkout Octogent runs in. Done when export resolves the Octogent workspace (e.g. the main worktree from `git rev-parse --git-common-dir`) and a test with a linked worktree writes to the main checkout's tentacle.
- [ ] **Export replaced CONTEXT.md wholesale (confirmed while dogfooding)** — exporting v2 into the six live tentacles would have overwritten their hand-written scope, so it wasn't run. Done when the D36 managed-block task above lands and a live export into an existing v1 tentacle leaves its Owns/Rules sections unchanged.

### Wave 6 — handoff to Octogent (D44–D48)

- [ ] [D48] **Resolve the Octogent workspace** — `resolveWorkspace` returns the main worktree (from `git rev-parse --git-common-dir`) when its `.octogent/` exists, else the repo. Done when a fixture with a linked worktree resolves to the main checkout and a plain repo resolves to itself.
- [ ] [D44, D36] **Apply a handoff** — `applyHandoff` creates missing tentacles with `octogent tentacle create`, rewrites only the octoplan-managed CONTEXT.md block, and appends todos under `## <heading>` / `### <wave>` with D-id stamps (dedupe by text). Done when a test applying twice into a workspace with a hand-written tentacle leaves its hand notes byte-identical and adds no duplicate todos.
- [ ] [D44] **Handoff wizard** — `HandoffWizard` in web/src/integrations/handoff: Generate (spinner from plan-job) → Review (rename/add/remove tentacles, edit owns, edit/move/delete todos, heading) → Apply → Done (per-tentacle results, Open Deck link, copy octopus prompt). Done when a component test walks all four steps with a fake transport and asserts the save-handoff and apply-handoff events.
