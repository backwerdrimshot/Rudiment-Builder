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

## Release information

- **Build:** `2026-09-03`
- **Status:** MVP built and publicly available
- **Live app:** <https://rudiment-builder.backwerdrhythmshop.com/>
- **Public app guide:** <https://guides.backwerdrhythmshop.com/rudiment-builder/>
- **Repository:** <https://github.com/backwerdrimshot/Rudiment-Builder>

Build identifiers use ISO `YYYY-MM-DD`, based on the date the shipped app update
began. The value stays fixed while that release pass is completed across code and
documentation.

## The catalog

All **40 PAS International Drum Rudiments** are encoded, grouped by family:

| Family | Count | PAS range |
|---|---|---|
| Rolls | 15 | 1–15 |
| Diddles | 4 | 16–19 |
| Flams | 11 | 20–30 |
| Drags | 10 | 31–40 |

The chooser opens with a **search box** (matches names and aliases across all
40), **family** chips (Rolls / Diddles / Flams / Drags), and **level** chips
(Beginner / Intermediate / Advanced) that combine; cards are grouped by family
under sticky headers with live counts.

Every rudiment is structured data in `js/rudiment-data.js` — nothing is
hard-coded into the page, and there are no per-rudiment audio files. Each
record carries its PAS number and its N.A.R.D. heritage, shown as chips in
the app (see *Sources & educational lineage* below).

> **Proofing note:** the 19 hybrids that once carried source-varying notation
> were proofed on 2026-09-03 against the notation PAS published in May 2026 —
> 5 were confirmed as encoded and 14 were re-encoded. Three genuinely open
> musical questions remain, listed in [`REVIEW.md`](REVIEW.md).

## Features

- Large R/L sticking cells with accent marks (`>`), grace-note chips (flams),
  diddle underlines, counting-row subdivision guides, and beat grouping
- Current-stroke highlight synchronized to the audio clock
- Leading-hand control — left lead is a hand-swapped copy of the pattern
  (grace hands included); the source definition is frozen and never mutated
- Four-beat count-in in the family's soft "listen" voice
- Right and left strokes distinguishable by pitch **and** gentle stereo
  placement; accents brighter and louder; grace notes tucked underneath
- Optional **pulse under the sticking** (a soft click on every beat, so the
  grid never disappears through rests and ringing releases) or a lighter
  downbeat-only cue
- **Mute** for visual-only practice — the highlight, pips, and status keep
  running while a class plays to the teacher's count
- One-tap **"Start at N"** applies each rudiment's suggested starting tempo
- Live status: current BPM, phase, rep, step, and the next tempo — with a
  clear indication before every tempo change
- Pause = frozen audio clock (no duplicate events, exact resume); Reset always
  returns to a clean start
- Settings persist locally; **Copy link** shares one exact drill
- Keyboard: **Space** starts/pauses, **R** resets; visible focus states;
  respects reduced-motion preferences; screen wake lock while playing

## Local development

No Node or Python required.

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1
# then open http://localhost:8523/
```

(Any static file server pointed at this folder also works.)

## Testing

Runner-agnostic cases live in `tests/cases.js`:

- **Browser (no tooling):** open `tests/test.html` — 62 cases covering the full
  40-rudiment catalog (PAS coverage, family split), data validation, generated
  counting, buzz and grouped strokes, leading-hand transformation, stroke
  ordering, accents, grace notes, diddles, tempo paths, plans, the playback
  position machine, snapshot/restore, reset, and drift.
- **Node (when available):** `node --test tests/core.test.cjs` — the same 53
  cases, run headless.

  Name the file, not the directory. `node --test tests/` resolves `tests/` as a
  module path and fails with `Cannot find module .../tests` before running a
  single case — and it exits `0` while doing it, so a script that only checks
  the exit code reads that as a pass.

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

## Privacy and accessibility

Rudiment Builder requires no account or backend. Settings stay in the browser's local
storage. One script does load: a Cloudflare Web Analytics beacon that counts page views
and nothing else — no cookies, no fingerprinting, no following anyone to another site.
It carries the same site token as the rest of backwerdrhythmshop.com so this app's
numbers land beside the page that describes it, and it never sees a rudiment, a tempo or
a stored setting. The shop site's `/privacy/` describes it for visitors. Keyboard controls, visible focus, reduced-motion support, responsive layouts,
and screen wake lock support individual and classroom use.

## Deployment

Static site published as Cloudflare Workers static assets. `node build.mjs`
copies the `SITE_ASSETS` allowlist into `dist/`, and `npx wrangler deploy` ships
it. There is no deploy workflow, and none is wanted.

It used to publish through GitHub Pages via `actions/deploy-pages`, and that
stopped working on 15 August when Actions stopped running on this account. Every
merge between then and 22 August sat on `main` without reaching the public site,
which nothing announced — a deploy that never runs looks exactly like one that
succeeded. The README also claimed Pages was "the same setup as the sibling
apps"; it never was. The other twelve were on Workers the whole time.

### The route, and why it is a route

The public hostname is `rudiment-builder.backwerdrhythmshop.com`, served by a
**Workers route** (`rudiment-builder.backwerdrhythmshop.com/*`), not by a Worker
custom domain like every sibling app uses.

That is a compromise, not a preference. A custom domain refuses to attach while
another DNS record already claims the hostname — Cloudflare returns error 100117
— and the record pointing at GitHub Pages is still there. A route needs no such
thing: it intercepts matching requests ahead of the origin, over the existing
proxied record.

**The consequence is worth knowing before someone tidies up.** The GitHub Pages
site still exists behind that DNS record, frozen at its last successful build in
August. Delete the route and traffic silently falls back to it — an old copy of
this app, served as though it were current, with `/CLAUDE.md`, `/REVIEW.md`,
`/README.md` and `/serve.ps1` publicly readable again the way `path: '.'` left
them.

The clean end state is to delete the `rudiment-builder` DNS record in the
`backwerdrhythmshop.com` zone and attach a proper custom domain, which puts this
app on the same footing as the other twelve and removes the stale fallback. Until
that happens, the route is load-bearing: do not remove it.

## Support and feedback

- **Report a problem** emails `support@backwerdrhythmshop.com`.
- **Request a feature** emails `feedback@backwerdrhythmshop.com`.
- Both controls are available in the app footer and prefill the app name, build,
  page URL, and browser details to make follow-up easier.

## Sources & educational lineage

Rudiment Builder is an educational tool, and it teaches the *named, standard*
rudiments — so it wears its sources openly:

- **N.A.R.D.** — the National Association of Rudimental Drummers (formed at
  the 1932 American Legion national convention) published **"The 13 Essential
  Rudiments"** in 1933 and a second thirteen in 1936, completing the
  **26 Standard American Drum Rudiments** that defined American rudimental
  drumming for half a century.
- **PAS** — the Percussive Arts Society extended that lineage in 1984 with
  the **40 International Drum Rudiments**, today's standard reference and the
  source of the numbering shown in this app.

Each rudiment's chips show both: its PAS number and its heritage — the
N.A.R.D. Standard 26 lineage where it applies, or a "PAS addition (1984)"
marker for the rudiments the Percussive Arts Society added. Sticking, accents,
and grace-note structures follow the published PAS chart, proofed against the
notation PAS published in May 2026 (see [`REVIEW.md`](REVIEW.md) for the method
and the three questions still open); the data model, prose, teaching notes, and
all rendering are original to this app — no publisher's notation images are
copied or traced.

Rudiment Builder is an independent Backwerd Rhythm Shop project and is not
affiliated with or endorsed by the Percussive Arts Society or N.A.R.D.

## Family

Twelve free apps, all listed at
<https://apps.backwerdrhythmshop.com/>:

Pulse Pocket · Grid Board · Click Drop · Stick Lab · Rhythm Repper ·
Tempo Ladder · Count It · Mallet Board · Mallet Map · Scale Trail ·
Drum Map · **Rudiment Builder**

## Visit counter

The footer shows a running visit count next to the build stamp. It comes from our own
Cloudflare Worker at `counter.backwerdrhythmshop.com`, which stores exactly one thing:
an integer per app. No IP, no user agent, no cookie, no timestamp — nothing tied to a
visitor. Counted once per browser session; localhost and file:// only read the number
so development never inflates it.

It is progressive enhancement. If the endpoint is offline, blocked, or not yet
deployed, the footer renders exactly as it did before and the app is unaffected.

## Follow

Backwerd Rhythm Shop posts practice ideas, new app releases, and classroom tips:

- Facebook — <https://www.facebook.com/backwerdrhythmshop/>
- Instagram — <https://www.instagram.com/backwerdrhythmshop/>
- YouTube — <https://www.youtube.com/@backwerdrhythmshop>

These three links also appear as icon buttons in the app footer.

## Ownership

© 2026 Backwerd Rimshot, LLC. All rights reserved.
