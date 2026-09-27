# Risks

Includes every answer marked tentative.

<!-- op:id=R1 -->
## R1 — Workers don't cite D-ids, so drift badges lie
- likelihood: high
- impact: medium
- origin: Q41
- status: open

If tentacle workers omit decision ids in commits, D26 marks implemented work as untouched. Mitigation: stamp ids into every todo line, and have the harvest pass flag uncited commits.

<!-- op:id=R2 -->
## R2 — Harvest burns tokens and proposes noise
- likelihood: medium
- impact: medium
- origin: Q41
- status: open

The headless pass (D31) runs on every refresh with new commits and may propose trivial candidates. Mitigation: run only with new commits since the last mark, cap candidates per run, and feed rejected titles back as "don't propose".

<!-- op:id=R3 -->
## R3 — Collapsed UI hides the why behind questions
- likelihood: medium
- impact: medium
- origin: Q41
- status: open

The dock, prose digest and answer chips (D14/D15/D25) may hide the reasoning needed to answer well. Mitigation: the dock shows the latest prose digest line above the round, plus an expand-all hotkey.

<!-- op:id=R4 -->
## R4 — Injected digest confuses Claude
- likelihood: medium
- impact: high
- origin: Q41
- status: open

Claude may re-ask digest items, treat stale decisions as active, or over-cite. Mitigation: the digest labels its status explicitly, and a live gate runs on a repo with existing decisions and checks that no settled decision is re-asked.

<!-- op:id=R5 -->
## R5 — One-week budget for three waves is tight
- likelihood: medium
- impact: low
- origin: Q47
- status: open

Waves 1–2 took about 2 days, but wave 4 adds a headless harvest pass and wave 5 adds drift, which depends on worker citation habits (R1). If it slips, wave 5's drift/History is the part to defer.
