# CLAUDE.md — Rudiment Builder

Focused trainer for **established, named rudiments** (Backwerd Rhythm Shop
family). Product boundary: no freeform pattern construction, no
mirror/reverse/invert tools, no notation editor — that is Stick Lab's job.
No accounts, no backend, no microphone/camera grading, ever.

## Stack + commands

Static app, **classic scripts** (no ES modules, no build step, no framework) —
the family convention; everything runs over `file://` and deploys to GitHub
Pages as-is. This machine has **no Node or Python**.

- Serve: `powershell -ExecutionPolicy Bypass -File serve.ps1` → http://localhost:8523/
  (Claude Code: `preview_start` name `rudiment-builder`, configured in the
  Pulse Pocket repo's `.claude/launch.json`.)
- Tests: open `tests/test.html` in a browser (53 cases; summary in
  `window.__TEST_RESULTS__`). With Node available: `node --test tests/`.
- Do **not** create a remote repo, push, or configure domains without Taylor.

## Architecture (keep these layers separate)

```
js/rudiment-data.js   DATA ONLY. Frozen records; no logic beyond deepFreeze.
js/rudiment-core.js   Pure logic, no DOM/audio. Dual browser/Node export.
js/rudiment-app.js    Scheduler + voices + DOM. Nothing musical decided here.
index.html            Markup + CSS only.
tests/cases.js        Runner-agnostic cases: {name, fn(assert, core)}.
```

Core pipeline: `withLead(rudiment, "R"|"L")` → playable pattern (deep copy;
left lead mirrors primaries AND grace hands; `leadingHand:"fixed"` ignores the
control) → `expandPattern` → beat-positioned events → `buildPlan(mode,
settings, pattern)` → stage list → `createPracticePlayback(plan)` → position
machine advanced by the scheduler **only at block boundaries**.

### Invariants (tests enforce most of these — keep them true)

- The registry is deep-frozen. Transforms copy; nothing mutates a definition.
- A tempo change never alters the pattern and never lands mid-cycle. Fixed
  mode uses `requestBpm()` → applied at the next `advanceBlock()`.
- Ladder transitions are 4-beat listen blocks clicking **at the upcoming
  tempo**. Open-close-open has no transitions — seamless change + visual
  warning on the final cycle of a stage. Count-in is always 4 beats.
- Open-close-open path: exact peak exactly once, descent retraces the ascent
  (`buildOcoRungs`, same semantics as Tempo Ladder's `buildLadder`).
- Pause = `audio.suspend()` (clock freezes → duplicate events impossible);
  stop/reset = `killPending()` (orphan the master gain) + state reset.
  `startPlayback` is idempotent: it tears down timers and orphans scheduled
  audio first. Structural changes during playback (rudiment/lead/mode/ladder
  numbers) call `stopIfActive()`; only fixed-mode BPM, the pulse/downbeat-cue
  toggles (picked up at the next block), and mute (master gain only; never in
  share links) apply without stopping.
- Scheduling: 25 ms tick, 0.12 s horizon, absolute times accumulated exactly
  from `AudioContext.currentTime` — never schedule audio off `setInterval`
  time. Visuals ride a timestamped queue flushed from BOTH rAF and the tick.
- A `suspended` statechange while status is "playing": if the page is hidden,
  book-keep a real pause; if visible, resume and only pause if still stuck
  (guards a pause→reset→start race vs. real OS interruptions).

### Rudiment data rules (validated at boot and in tests)

One cycle covers both leads' halves. `slot` indexes a `cycleBeats ×
slotsPerBeat` grid; `duration` (default 1) may not cross a beat boundary (MVP
display constraint — the cell spans its beat group). Diddle = **exactly two**
same-hand strokes on consecutive slots sharing a `diddle` id; `group` = a
bracket of **2+** same-hand consecutive strokes (e.g. the triple stroke roll).
`buzz:true` marks a multiple-bounce stroke (can't also carry a grace). Grace
hands must oppose the primary (`grace:[{hand}]`, 1 = flam, 2 = drag). `counting`
is **optional** — when omitted the core generates it from `slotsPerBeat`
(`countingFor`); when present it must match the grid length. Velocity tiers:
accent 1.0 / normal 0.62 / grace 0.2 (per-stroke `velocity` overrides). Invalid
data must fail loudly: `assertValidRegistry` throws one error naming every
problem, and the app disables itself at boot.

Educational lineage: every record carries `pas` (1–40) and a short `heritage`
chip — the N.A.R.D. Standard 26 lineage ("NARD Standard 26") or a post-NARD
marker like "PAS addition (1984)". All 40 are encoded; sticking is verified
against the published PAS chart, **except the ~19 hybrids tagged `// REVIEW:`
in the data and tracked in `REVIEW.md`**, which carry source-varying notation
and await Taylor's proofread. Tests pin the shipped values (catalog count,
family split, PAS coverage), so changing data means updating `tests/cases.js`.

## Validation expectations for changes

- Any core change: add/extend a case in `tests/cases.js`, run `tests/test.html`
  to green in the browser.
- Any app/scheduler change: browser-verify start/pause/resume/reset, a full
  ladder run, a full open-close-open run, and a mid-play tempo change (an
  in-page timeline probe beats screenshots for timing checks).
- Any UI change: check phone width (375), no horizontal scroll, touch targets
  ≥ 44 px, visible focus, reduced-motion still sane, nothing meaningful by
  color alone.

## Design language

Grid Board / Tempo Ladder visual language: cream paper `#f8e9d8`, navy ink
`#142a36`, burnt orange `#f36f3d` (deep `#c94b20`), sage selections, 2px ink
borders, hard offset shadows, Palatino serif accents, cyan `:focus-visible`.
Segmented controls use `aria-pressed`. Footer credits: `App · Backwerd Rhythm
Shop · © Backwerd Rimshot, LLC`.

## Decisions awaiting Taylor's musical review

- **The 19 hybrid rudiments in [`REVIEW.md`](REVIEW.md)** — the priority items:
  Inverted Flam Tap (alternating vs. same-hand pairs), Flamacue closing-flam
  placement, and the Ratamacue family's inconsistent subdivisions/note counts.
  Also flagged there: sticking errors in the Notion "Rudiment Mastery Program"
  doc (not re-verified this pass; the app data does not inherit them).
- Five Stroke Roll encoded PAS-card style: diddles on the beat, accented
  release ON beats 2/4 ringing through the beat (alternative: pickup placement
  releasing on the downbeat).
- Open-close-open phase words: Closing (ascent) / Peak / Opening back up.
- Resume replays from the exact paused instant (frozen clock), not from the
  top of the cycle. Flam grace lead: 35 ms, compressing at fast subdivisions.
