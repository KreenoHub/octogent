# Risks

Includes every answer marked tentative.

<!-- op:id=R1 -->
## R1 — Concurrent appends create sync conflict copies
- likelihood: medium
- impact: medium
- origin: Q17
- status: open

If the phone and the PC both append to the same file before the folder has synced, Dropbox, iCloud and Syncthing save a conflict copy, and one side's check-offs disappear from the main log.
