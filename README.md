# Rudiment Room

**Choose the rudiment. See the sticking. Build the hands. Control the tempo.**

Rudiment Room is a focused, forever-free practice app from
[Backwerd Rhythm Shop](https://backwerdrhythmshop.com) for learning and
practicing established, named percussion rudiments. A student selects a
rudiment, sees a large original sticking display (accents, diddles, flams),
hears and watches the stroke sequence, and practices it three ways:

- **Fixed tempo** — loop continuously at one tempo; tempo nudges land at the
  next cycle boundary, never mid-pattern.
- **Steps** — step up (or down) from a starting BPM to an ending BPM
  in steps, with a chosen number of repetitions at each tempo and a four-beat
  "listen" transition that clicks **at the new tempo**.
- **Open–close–open** — slow → peak → slow as a predictable state sequence
  (closing / peak / opening back up), with seamless tempo changes at cycle
  boundaries and an on-screen warning before each change.
- **Build up** — learn a rudiment in layers at one tempo: the hands alone, then
  the accents, then the flams, drags or buzz. Layers come from the rudiment's own
  data (each only removes what is written, and the last is the rudiment as
  written), change at a cycle boundary with a warning, and a rudiment with
  nothing to add says so.

No account. No backend. No notation software feel.

## Release information

- **Build:** `2026-10-27.6`
- **Status:** MVP built and publicly available
- **Live app:** <https://rudiment-builder.backwerdrhythmshop.com/>
- **Public app guide:** <https://guides.backwerdrhythmshop.com/rudiment-builder/>
- **Repository:** <https://github.com/backwerdrimshot/Rudiment-Builder>

### Renamed from Rudiment Builder, 2026-09-03

Nothing in this app builds anything: a student picks a named rudiment and the
app plays it. Earning "Builder" would have meant freeform pattern construction,
which is **Stick Lab's** job by an explicit product boundary — so the app was
named for what it is instead.

**The rename is content-only so far.** These still carry the old name on
purpose, and are Taylor's to move:

| Still `rudiment-builder` | Why |
|---|---|
| The public hostname, DNS record and Workers route | Cloudflare work, and see the route caveat below |
| The GitHub repository name | A GitHub setting, not a file |
| `STORE_KEY` in `js/rudiment-app.js` | Renaming it factory-resets every existing user's saved settings |
| `assets/notation/` | Vendored; regenerate upstream, do not edit here |

A hostname move is the clean moment to fix the route compromise described under
**Deployment** — attach a proper custom domain and delete the stale GitHub Pages
DNS record — and needs a permanent redirect from the old host.

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

> **Proofing note:** every rudiment has been read against a reference. The
> sticking was proofed against the official 1984 PAS International Drum
> Rudiments chart, then re-checked rudiment by rudiment against the notation
> PAS published in May 2026 — one file per rudiment, so lengths and beam
> grouping are unambiguous. `REVIEW.md` records what each pass found. No
> rudiment carries an open notation flag.

## Features

- Large R/L sticking cells with accent marks (`>`), grace-note chips (flams),
  diddle underlines, counting-row subdivision guides, and beat grouping
- Current-stroke highlight synchronized to the audio clock
- The rudiment **written in notation** under the live sticking — one drawn card
  per rudiment, always with a right-hand lead; on a left lead the caption says
  to swap every R and L rather than letting the two displays quietly disagree
- Leading-hand control — left lead is a hand-swapped copy of the pattern
  (grace hands included); the source definition is frozen and never mutated
- Four-beat count-in in the family's soft "listen" voice
- Three **stroke sounds**. **Marching** (the default) is a recorded marching
  snare — MuseScore Drumline's solo snare, CC0 — with two takes per hand so
  repeated strokes never sound like one recording, and softer strokes darker as
  well as quieter. **Synth** is the synthesized snare, no audio files; **Tones**
  plays the right hand higher than the left so the sticking can be heard. All
  three keep gentle stereo placement and tuck grace notes underneath, and
  picking one while stopped plays a short sample. Switching never stops
  playback. The marching takes load only once Marching is chosen, and if they
  fail to load the synth snare plays in their place
- Buzz strokes (the multiple bounce roll) fill their written length, so a buzz
  roll sounds closed rather than like single strokes: Marching plays MDL's own
  recorded buzz stroke, tight for a short note and open for a long one; the
  synthesized voices play it as bounces
- **Your turn** — call and response in any mode: the app plays a cycle, then
  clicks while the student plays it back alone once, twice or three times. The
  highlight keeps moving (outlined rather than filled) so they can check
  themselves; the app never listens. Each rep becomes a trade, the tempo path
  and total time count it, a fixed-mode tempo change waits for the app's next
  cycle so a new tempo is always heard before it is played alone, and a share
  link carries it
- **Dynamics** — practice Full (the original loudness), Medium, Soft, or Swell,
  which rises from soft to full and back across each tempo's reps (two reps
  play soft, then full). The core decides the level from the playback position;
  a change lands on the next stroke without stopping, and a share link carries it
- **Quiz: name that rudiment** (in Settings) — ten multiple-choice questions, four
  names each, one right: **by ear** (the written rudiment is played, right lead,
  at its default tempo, in the chosen stroke sound) or **from the notation** (the
  drawn card, with a description that leaves the name out), or mixed, drawn from
  all 40, a level, or the rudiments marked learned. Wrong names come from the
  same family first. A right or wrong answer shows its name, and an ear question
  then shows what was heard written down; the results list what was missed with a
  **Practice it** button. Nothing is graded against playing and the score is not
  stored. No two rudiments are identical on the data, so every question has one
  right answer.
- **My progress** (in Settings) — the student's own record for the chosen
  rudiment and hand, on the device only. Each **Clean at** mark is also kept as
  a dated entry (the day's best, newest 90 kept) and drawn as a small line chart
  with the goal as a dashed line; the student can set a **goal tempo** per hand
  and see how near their best clean mark is; and can mark a rudiment **"I can
  play this"**. Every one of these is the student's claim: the app never
  listens. **Copy my progress** copies a plain-text summary that names no one.
  Clearing a rudiment's best also clears its history; the goal and the learned
  mark stay.
- **Learning path** (in the rudiment chooser) — "N of 40 learned" with a
  **Next up** pointer and a **Go to next** button, ✓ Learned and Next up badges on
  the cards, and an All / To learn / Learned filter. The order is derived from
  the data alone (level, then PAS number), so it invents no teaching sequence;
  a curated order would replace one function (`Core.learningPath`). When a goal
  is set, the chooser also names the rudiment and hand closest to it.
- **Routine** (in Settings) — save up to 8 drills and play them in order, each
  with its own count-in: "Add this drill" saves the drill as it is set up
  (rudiment, hand, mode and numbers, Your turn, dynamics), and a Fixed drill is
  given a length in reps because it would otherwise loop forever. A routine
  borrows the settings while it runs and puts the student's own back when it
  ends or when anything structural is touched, and nothing it plays is saved as
  the student's settings. It finishes with one **Copy practice log** covering
  every drill. The saved routine has its own storage key; the Assignment dialog
  can carry it in the link and QR code (`routine=`, a compact form the app
  re-validates on the way in), and a routine opened from a link is used for that
  visit without overwriting the saved one
- **Assignment** (in Settings, beside Copy link) — a teacher sets a drill and an
  optional **goal tempo** and gets a link, a **QR code** and a **printable
  sheet**. The code encodes the shop's short link
  `backwerdrhythmshop.com/rudiment-room` with the drill's settings in the query
  (the site redirects to the app and keeps the query), so a printed sheet
  survives a hostname move, as ADR 0271 in praxis-platform requires. A student
  who opens it sees the assigned goal, and the practice log names it. The app
  never listens: reaching the goal is still the student's own Clean mark
- **Class view** — large sticking and tempo with the setup panels out of the
  way, for a projector or a shared screen. Layout only; the drill and transport
  are untouched
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
- **Best clean tempo**, the student's own log: while playing (or paused, or
  once a run completes), **Clean at N** records the tempo just heard as one
  played cleanly. Each rudiment keeps its fastest mark per leading hand, shown
  in the rudiment panel and on its card in the chooser. The app never listens —
  "clean" is the student's call — and the log stays on the device. In Fixed
  mode, **Start at your best** sets the tempo to that best for the current hand
- **Copy practice log** appears when a Steps or Open–close–open run finishes:
  plain text for a class assignment with the date, rudiment, leading hand, the
  tempo steps completed, the best clean tempo the student marked, and the drill
  link. It names no one, sends nothing, and says the app does not grade
- **Works offline** after one visit: a service worker (`sw.js`) stores the
  whole build — page, scripts, fonts, all 40 notation cards and the marching
  snare, about 1.3 MB — and answers from it with no connection, share links
  included. One build is served at a time, never a mix; a new deploy is
  stored in full before it takes over, and an open tab says "reload when you
  finish practicing" rather than reloading itself. The footer says when the
  build is saved for offline use. Not over `file://`, which already runs from
  disk
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

- **Browser (no tooling):** open `tests/test.html` — every case covering the full
  40-rudiment catalog (PAS coverage, family split), data validation, generated
  counting, buzz and grouped strokes, leading-hand transformation, stroke
  ordering, accents, grace notes, diddles, tempo paths, plans, the playback
  position machine, snapshot/restore, reset, and drift.
- **Node (when available):** `node --test tests/core.test.cjs` — the same
  cases, run headless.

  Name the file, not the directory. `node --test tests/` resolves `tests/` as a
  module path and fails with `Cannot find module .../tests` before running a
  single case — and it exits `0` while doing it, so a script that only checks
  the exit code reads that as a pass.

- **The build and privacy tests:** `node --test tests/*.test.mjs` — cases
  over what `dist/` publishes and what the shipped page carries. **This is what
  CI's `validate` job runs, and it does not run the core cases**, so running
  only `core.test.cjs` before a push proves nothing about the checks that gate
  the merge. Run both.

## Architecture

```
index.html            markup + CSS (Backwerd Rhythm Shop visual language)
assets/brand/         design-tokens.css, copied verbatim from the site repo
assets/fonts/         the self-hosted brand faces + their OFL 1.1 licenses
assets/notation/      vendored notation (see its README); only rudiments/*.svg
                      and the Bravura license ship, via NOTATION_ASSETS
assets/audio/         the marching snare takes (generated by
                      tools/pack-marching-snare.py) + their CC0 credit
assets/vendor/        qrcode-generator (MIT) for the assignment QR code
js/rudiment-data.js   frozen rudiment records — data only
js/rudiment-core.js   validation · withLead (leading hand) · expandPattern ·
                      buildPlan (fixed/ladder/oco) · playback position machine · dynamics scale
js/rudiment-app.js    Web Audio look-ahead scheduler · voices · visual queue ·
                      transport · settings persistence + share links
tests/                cases.js (shared) · test.html (browser) · core.test.cjs (Node)
tools/                pack-marching-snare.py · publish.mjs (check and publish without Actions)
sw.js                 offline service worker; build.mjs writes dist/sw.js with
                      the build number and the files to store
serve.ps1             tiny PowerShell dev server
```

The core is a classic script with no DOM or audio dependencies — the page and
the Node test runner load the same file. Playback truth lives on the
`AudioContext` timeline: a 25 ms look-ahead tick schedules strokes ahead of
time, the pure position machine advances only at cycle boundaries, and a
timestamped visual queue drives the display at hear-time.

## Privacy and accessibility

Rudiment Room requires no account or backend. Settings, the saved routine, the progress record (history, goals, learned marks) and the
best-clean-tempo log stay in the browser's local storage. The best-tempo log and the
progress record never travel in a link; a routine
travels only when the teacher chooses to include it in an assignment link. For offline use the
browser also keeps a copy of the app's own files (Cache Storage, via `sw.js`); it holds
nothing about the student and sends nothing anywhere. One script does load: a Cloudflare Web Analytics beacon that counts page views
and nothing else — no cookies, no fingerprinting, no following anyone to another site.
It carries the same site token as the rest of backwerdrhythmshop.com so this app's
numbers land beside the page that describes it, and it never sees a rudiment, a tempo,
a stored setting or a logged tempo. The shop site's `/privacy/` describes it for visitors. Keyboard controls, visible focus, reduced-motion support, responsive layouts,
and screen wake lock support individual and classroom use.

## Deployment

Static site published as Cloudflare Workers static assets. `node build.mjs`
copies the `SITE_ASSETS` allowlist into `dist/`, and `npx wrangler deploy` ships
it. That still works by hand, and is still the fastest way to publish an urgent
fix.

**A merge now ships, once CI is green.** `.github/workflows/workers.yml` runs on
a successful **README standard** run against `main`, re-runs both test suites,
rebuilds `dist/` and proves the committed copy matches what `build.mjs` produces
from that commit, then deploys the exact commit CI validated.

**Publishing when Actions cannot run.** The workflow depends on GitHub's hosted
runners, and a hold on the account (a failed payment, or an Actions spending
limit) stops them before any step starts: the run fails in a second or two with
0 billable milliseconds and an empty log, which is how it looked on 2026-10-27.
`node tools/publish.mjs` does the workflow's checks on your own machine: a clean
checkout of exactly `origin/main`, both test suites, the README standard script
(read out of `readme-standard.yml` and run as written, so the two cannot
drift), and a fresh build that must match the committed `dist/`. It publishes
nothing on its own. `node tools/publish.mjs --deploy` then runs
`wrangler deploy` with the exact version `workers.yml` pins (it needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`)
and confirms the live site's `capabilities.json` reports the new build. It
touches no domain, DNS or route. When Actions works again, the workflow is the
normal path and this is the fallback.

This section previously read *"There is no deploy workflow, and none is
wanted."* That was a deliberate choice and it had a cost nobody could see from
here: **a merge to this repository published nothing at all.** GitHub Pages was
retired, no Cloudflare Workers Builds connection was ever made, and the only
thing that shipped this app was somebody remembering to run the command above.
Every check stayed green throughout, because every check reads this repository.

It was found on 2026-09-05 by reading Cloudflare's version history rather than
anything here: the Worker's last publish was a hand deploy ninety-five minutes
after the merge it shipped, and not one version in its history carries the
branch alias a Workers Builds preview leaves. The shop site's
`docs/HOW-EACH-APP-DEPLOYS.md` table had this app recorded as shipping on merge,
which it did not — the same row it warns about, a copy carried forward without
evidence.

**`dist/` is tracked here, unlike every sibling**, so what deploys is a
committed artifact rather than one built at deploy time. That makes it a
hand-kept copy of something generated, and the failure mode is a commit whose
`dist/` was never rebuilt: the deploy succeeds and ships the previous build's
assets. The workflow rebuilds and diffs before deploying, so that fails loudly
at the one moment it matters.

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

- **Report a problem** opens the shop's problem form in a new tab, with the app name, build, and page address filled in. The page address is the same as a share link: the rudiment and its settings. Saved best tempos stay in the browser and are not sent.
- **Request a feature** opens the shop's feature form the same way.
- **Email support** (`support@backwerdrhythmshop.com`) and **Email feedback** (`feedback@backwerdrhythmshop.com`) are plain email links in the Feedback dialog, always available. They never depend on a form, and no form is required to send a message.
- If a form is ever unset, its form control falls back to the matching email address.

## Sources & educational lineage

Rudiment Room is an educational tool, and it teaches the *named, standard*
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
and what each pass found); the data model, prose, teaching notes, and
all rendering are original to this app — no publisher's notation images are
copied or traced. The notation cards are no exception: they are engraved from
this app's own data with glyphs extracted from Bravura (SIL OFL 1.1).
The Marching sound is the solo snare from [MuseScore Drumline](https://github.com/musescore/mdl)
(CC0), recorded by Amir Oosman and S. Christian Collins, with sample
programming by S. Christian Collins; `assets/audio/LICENSE-marching-snare.txt`
says what was done to it.

The assignment QR code is drawn by [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)
2.0.4 (MIT, Kazuhiko Arase), vendored in `assets/vendor/qrcode-generator/` with its
license. "QR Code" is a registered trademark of DENSO WAVE INCORPORATED.

**Praxis ids.** Praxis publishes the 40 rudiments as permanent skill ids,
`rudiment.<name>.core`. 38 of this app's ids already match. The two that differ
are mapped by `Core.PRAXIS_ALIAS` (`double-stroke-open-roll` is Praxis's
`double-stroke-roll`; `single-paradiddle-diddle` is `paradiddle-diddle`), and
`Core.praxisSkillId(id)` returns the skill id. Neither project renames anything.

Rudiment Room is an independent Backwerd Rhythm Shop project and is not
affiliated with or endorsed by the Percussive Arts Society or N.A.R.D.

## Family

Eleven free apps, all listed at
<https://apps.backwerdrhythmshop.com/>:

Pulse Pocket · Grid Board · Click Drop · Stick Lab · Rhythm Repper ·
Count It · Mallet Board · Mallet Map · Scale Trail · Drum Map ·
**Rudiment Room**

## Follow

Backwerd Rhythm Shop posts practice ideas, new app releases, and classroom tips:

- Facebook — <https://www.facebook.com/backwerdrhythmshop/>
- Instagram — <https://www.instagram.com/backwerdrhythmshop/>
- YouTube — <https://www.youtube.com/@backwerdrhythmshop>

These three links also appear as icon buttons in the app footer.

## Ownership

© 2026 Backwerd Rimshot, LLC. All rights reserved.

## Compact practice workspace

The laptop view keeps the main instrument or exercise and its practice controls together. Help contains the instructions, and About contains the app name, its build, More apps, the guide and the copyright. The support links are in the footer and the Feedback dialog. Long reference material and exercise grids scroll inside their own panels; narrow and zoomed windows retain normal page scrolling.
