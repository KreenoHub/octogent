# Risks

Includes every answer marked tentative.

<!-- op:id=R6 -->
## R6 — Ingest misreads a mature plan
- likelihood: medium
- impact: high
- origin: D55
- status: open

A detailed spec may come out as a handful of vague goals, or inferred items may pass for decisions. Mitigation: every found item carries a source quote, inferred items are marked tentative (D56), and nothing is written until the user applies the review.

<!-- op:id=R7 -->
## R7 — Terminal launch differs on each OS and terminal
- likelihood: medium
- impact: medium
- origin: D59
- status: open

Only Windows is checked live (DOD9). macOS and Linux launchers may fail on some setups. Mitigation: the launcher is one small module with an injected spawn, every failure falls back to showing the command with a copy button, and e2e uses a fake launcher.

<!-- op:id=R8 -->
## R8 — The derived step disagrees with the user's sense of progress
- likelihood: medium
- impact: low
- origin: D62
- status: open

The rules in deriveWorkflow are guesses (G3). Mitigation: steps never block (D63), each shows its reason, and the rules are one pure function with table tests, so they're cheap to tune.

<!-- op:id=R9 -->
## R9 — Import is slow or costly on big folders
- likelihood: medium
- impact: medium
- origin: D53
- status: open

A monorepo plus extra folders can burn many turns. Mitigation: the server-side inventory, doc-first reading, caps (G5), and a visible progress line with a Cancel button during the pass.

<!-- op:id=R10 -->
## R10 — The trust dialog stalls Octogent's first terminal
- likelihood: high
- impact: medium
- origin: D61
- status: open

A known gotcha: in a folder Claude hasn't trusted yet, the first tentacle terminal waits on the untrusted-folder dialog and initial prompts die. Mitigation: the Build step shows a reminder to accept it, and new projects created by Octoplan are the most likely to hit it.
