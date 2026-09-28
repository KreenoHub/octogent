# Gaps

Things the plan does not answer yet.

<!-- op:id=G2 -->
## G2 — Should import also clone from a git URL?
- dimension: scope
- status: open

D52 accepts only local paths. Cloning a URL into a chosen folder would make "import a repo I saw" one step. Default for v3: no; revisit after a week of use.

<!-- op:id=G3 -->
## G3 — When is the Interview step "done enough"?
- dimension: flows
- status: open

D62 calls Interview done when every coverage dimension is at least partial and no round is pending. That may be too loose for a raw idea or too strict for a detailed imported plan. Settle in wave 8 against real sessions; the step never blocks either way (D63).

<!-- op:id=G4 -->
## G4 — Which file kinds does ingest read?
- dimension: data
- status: open

The SDK's Read handles text, code and PDF. .docx, .pptx and images aren't covered. Default: list them in the inventory, skip their contents, and flag each skipped file in the review so the user can paste its text.

<!-- op:id=G5 -->
## G5 — Ingest caps for very large folders
- dimension: architecture
- status: open

D53 caps the inventory, but the numbers (entries listed, maxTurns, bytes read) aren't set. Start with 400 entries and 40 turns, measure time and cost on the e2e fixture and one real monorepo in wave 7, then fix them.
