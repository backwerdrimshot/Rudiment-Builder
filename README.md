# Rudiment Builder

**Choose the rudiment. See the sticking. Build the hands. Control the tempo.**

Rudiment Builder is a focused, forever-free practice app from
[Backwerd Rhythm Shop](https://backwerdrhythmshop.com) for learning and
practicing established, named percussion rudiments. A student selects a
rudiment, sees a large original sticking display (accents, diddles, flams),
hears and watches the stroke sequence, and practices it three ways:

- **Fixed tempo** — loop continuously at one tempo; tempo nudges land at the
  next cycle boundary, never mid-pattern.
- **Tempo ladder** — climb (or descend) from a starting BPM to an ending BPM
  in steps, with a chosen number of repetitions at each tempo and a four-beat
  "listen" transition that clicks **at the new tempo**.
- **Open–close–open** — slow → peak → slow as a predictable state sequence
  (closing / peak / opening back up), with seamless tempo changes at cycle
  boundaries and an on-screen warning before each change.

No account. No backend. No notation software feel.

## Current rudiments (proof slice)

| Rudiment | PAS # | Family | Grid |
|---|---|---|---|
| Single Paradiddle | 16 | Diddle | Sixteenths, 2-beat cycle |
| Flam Accent | 21 | Flam | Triplet eighths, 2-beat cycle |
| Five Stroke Roll | 7 | Roll | Sixteenths, 4-beat cycle |

Pattern facts follow the Percussive Arts Society's 40 International Drum
Rudiments; the data model, prose, and rendering are original to this app.
Every rudiment is structured data in `js/rudiment-data.js` — nothing is
hard-coded into the page, and there are no per-rudiment audio files.

## Features

- Large R/L sticking cells with accent marks (`>`), grace-note chips (flams),
  diddle underlines, counting-row subdivision guides, and beat grouping
- Current-stroke highlight synchronized to the audio clock
- Leading-hand control — left lead is a hand-swapped copy of the pattern
  (grace hands included); the source definition is frozen and never mutated
- Four-beat count-in in the family's soft "listen" voice
- Right and left strokes distinguishable by pitch **and** gentle stereo
  placement; accents brighter and louder; grace notes tucked underneath
- Optional soft downbeat cue on beat one of every cycle
- Live status: current BPM, phase, rep, step, and the next tempo — with a
  clear indication before every tempo change
- Pause = frozen audio clock (no duplicate events, exact resume); Reset always
  returns to a clean start
- Settings persist locally; **Copy link** shares one exact drill
- Keyboard: **Space** starts/pauses, **R** resets; visible focus states;
  respects reduced-motion preferences; screen wake lock while playing

## Run it locally

No Node or Python required.

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1
# then open http://localhost:8523/
```

(Any static file server pointed at this folder also works.)

## Tests

Runner-agnostic cases live in `tests/cases.js`:

- **Browser (no tooling):** open `tests/test.html` — 43 cases covering data
  validation, leading-hand transformation, stroke ordering, accents, grace
  notes, diddles, tempo paths, plans, the playback position machine,
  snapshot/restore, reset, and drift.
- **Node (when available):** `node --test tests/`

## Architecture

```
index.html            markup + CSS (Backwerd Rhythm Shop visual language)
js/rudiment-data.js   frozen rudiment records — data only
js/rudiment-core.js   validation · withLead (leading hand) · expandPattern ·
                      buildPlan (fixed/ladder/oco) · playback position machine
js/rudiment-app.js    Web Audio look-ahead scheduler · voices · visual queue ·
                      transport · settings persistence + share links
tests/                cases.js (shared) · test.html (browser) · core.test.cjs (Node)
serve.ps1             tiny PowerShell dev server
```

The core is a classic script with no DOM or audio dependencies — the page and
the Node test runner load the same file. Playback truth lives on the
`AudioContext` timeline: a 25 ms look-ahead tick schedules strokes ahead of
time, the pure position machine advances only at cycle boundaries, and a
timestamped visual queue drives the display at hear-time.

## Deployment

Static site; `.github/workflows/pages.yml` deploys to GitHub Pages on push to
`main` (same setup as the sibling apps). Custom-subdomain setup happens in
Cloudflare + repo CNAME when the app is ready to publish.

## Family

Pulse Pocket · Grid Board · Click Drop · Stick Lab · Rhythm Repper ·
Tempo Ladder · **Rudiment Builder**

© Backwerd Rimshot, LLC
