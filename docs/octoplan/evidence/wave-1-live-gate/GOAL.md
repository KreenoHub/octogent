# Goal — Tiny local-first CLI habit tracker

## Why

One person wants to track a few daily habits without handing the data to an app or cloud service. Owning the data locally is the reason to build it. Without a visible streak, habits lapse without anyone noticing, so a 7-day grid with a current-streak count is the core output. Scope stays deliberately tiny.

## Goals

- Log a named habit for today or a past date with one command; habits are created on first log (D5, D6)
- Undo a logged day and remove a stray habit with confirmation (D6, D9)
- Show each habit's last 7 days as a grid plus the current streak, where an unlogged today doesn't break the streak (D4, D10)
- Keep all data in one local, user-owned file (D7)

## Non-goals

- Reminders or notifications (D3)
- Sync, cloud backup or multi-machine use (D8)
- History or charts beyond 7 days (D8)
- Non-daily schedules such as 3x/week (D8)
- Multiple users or accounts (D2)

## Definition of done

- [ ] Running `habit log read` on a fresh install creates habit `read` and the weekly view shows today marked for it <!-- op:id=DOD1 status=partial -->
  - evidence: Flow agreed (D5); command name and stack still open (G3, G5)
- [ ] Running `habit log read --date <yesterday>` then the weekly view shows yesterday marked and a current streak of 2 once today is also logged <!-- op:id=DOD2 status=partial -->
  - evidence: D6, D10; date format open (G5)
- [ ] With yesterday logged and today not logged, the weekly view shows a current streak of 1, not 0 <!-- op:id=DOD3 status=partial -->
  - evidence: D10
- [ ] Running undo on a logged day removes it and the weekly view no longer shows that day marked <!-- op:id=DOD4 status=partial -->
  - evidence: D6; undo target semantics open (G5)
- [ ] Running `habit rm read` prompts for confirmation, and after answering y the weekly view no longer lists `read` <!-- op:id=DOD5 status=partial -->
  - evidence: D9
- [ ] The data file exists at a documented local path and opens as readable plain text <!-- op:id=DOD6 status=partial -->
  - evidence: D7; format and path open (G2)
- [ ] The project's test command passes on Windows, covering the streak rule and the 7-day grid <!-- op:id=DOD7 status=partial -->
  - evidence: Stack and test command not chosen (G3, G7)
