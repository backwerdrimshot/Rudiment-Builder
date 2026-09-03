# REVIEW.md — hybrid rudiment proofing worksheet

**Status: proofed 2026-09-03 against the notation the Percussive Arts Society
published in May 2026.** Of the 19 hybrids listed here, **5 were confirmed
correct as encoded and 14 were re-encoded.** What remains below is the short
list of genuinely open musical questions — the places where PAS's reading and
this app's model disagree for a reason, rather than by mistake.

## What was checked, and how

Each of the 19 was read directly from PAS's per-rudiment chart at
`pas.org/rudiment/<n>-<slug>/` — the vector notation uploaded in May 2026,
which shows beaming, tuplet brackets, accents, grace notes and sticking
letters for both leads. Where the engraving left room for doubt (mainly the
ratamacue subdivisions), onset timings were measured from PAS's own
demonstration recordings on the same pages and compared against the notated
rhythm.

Facts were reproduced — names, numbers, stickings, relative rhythm. No PAS
prose, image or PDF was copied into this repository.

### Confirmed correct, no change

- **#8 Six Stroke Roll** — accented outer notes with the diddles between.
- **#11 Ten Stroke Roll** — eight roll strokes into two accented sixteenths.
- **#25 Single Flammed Mill** — flam with a diddle, then two singles.
- **#27 Pataflafla** — flams on the outer notes of each group, both accented.
- **#28 Swiss Army Triplet** — flam, same-hand diddle, single.

### Re-encoded

| PAS | Rudiment | What was wrong |
|----:|----------|----------------|
| 2 | Single Stroke Four | Four flat sixteenths; PAS writes a sixteenth-note triplet onto a held eighth. |
| 3 | Single Stroke Seven | Seven sixteenths; PAS writes a sextuplet arriving on the next beat. |
| 23 | Flamacue | The closing flam sat on the 4th sixteenth and the fifth note was missing. PAS puts the closing flam on the **following downbeat**. |
| 29 | Inverted Flam Tap | Hands were right (R L L R) but the cycle started one eighth late, so the flams sat on notes 2 and 4 instead of 1 and 3. |
| 30 | Flam Drag | Three same-hand primaries with a crushed drag; PAS writes the drag out as two measured sixteenths — R L L R. |
| 32 | Single Drag Tap | Accent was on the drag; it belongs to the tap. |
| 33 | Double Drag Tap | Second drag was on the opposite hand. Both drags stay on the lead hand. |
| 34 | Lesson 25 | Accent was on note 2; PAS accents the closing note, and writes two sixteenths into an eighth. |
| 35 | Single Dragadiddle | Encoded as a paradiddle-**diddle** (six notes). PAS shows a single paradiddle — four. |
| 36 | Drag Paradiddle #1 | Missing the accented eighth pickup; the accent had been moved onto the drag. |
| 37 | Drag Paradiddle #2 | Missing the pickup, and the second drag was on the opposite hand. |
| 38 | Single Ratamacue | Three primaries on an eighth-triplet grid; PAS has four — a sixteenth-note triplet onto an accented eighth. |
| 39 | Double Ratamacue | Four primaries on a sixteenth grid; PAS has five, on the same figure as #38 with one extra drag eighth. |
| 40 | Triple Ratamacue | Accent on the wrong note and a spurious trailing drag. |

The ratamacue question REVIEW.md used to ask — whether the three agree on
subdivision — has a clean answer: **PAS uses one figure for all three**, a
sixteenth-note triplet resolving onto an accented eighth, with zero, one or
two drag eighths in front of it. All three now sit on a sextuplet grid and
share that shape.

Regression contract: `tests/cases.js` pins the rendered sticking of every
re-encoded rudiment plus a structural case per fix. Changing any of them
means a musical decision was made, not a refactor.

---

## Still open — Taylor's call

### ☐ #35 Single Dragadiddle — which hand plays the drag?

PAS letters this rudiment's drag on the **same hand as the note it decorates**
(a small `R` into a big `R`), which is what distinguishes a dragadiddle from a
flam-adiddle by technique rather than by letters.

`validateRudiment` in `js/rudiment-core.js` requires grace hands to **oppose**
the primary, so honouring PAS here is a **schema change plus a new test**, not
a data edit. Shipped for now with an opposite-hand drag, tagged `// REVIEW:` in
the data.

The consequence of leaving it: #35 and #36 now differ only by #36's accented
pickup, where PAS distinguishes them by the drag hand as well.

### ☐ Meter for the drag family

PAS prints #30, #33, #36, #37 and #39 with **no triplet bracket**, so read
literally their figures span 1½ or 2 beats rather than the tidy single beat the
old triplet grids gave them. The re-encoding follows PAS. If you teach these in
6/8 — which is traditional — say so and they can move back onto triplet grids
without changing a single stroke's hand or accent.

### ☐ House accents PAS does not print

The app accents the first note of #1, #2, #3, #5 and #31 where the PAS chart
marks no accent at all. As a cycle marker this is defensible and probably good
teaching, but it is the app speaking rather than PAS. Kept as-is; worth a line
in the teaching notes if you want it stated.

---

## Downstream, once the above is settled

- **`assets/notation/rudiments/`** was rendered from this repo's data before the
  corrections. All 14 changed rudiments need re-rendering from the canonical
  directory in `backwerdrimshot/praxis-platform` (`data/notation-svg/`) and
  re-copying here; `manifest.json` still marks the old 19 `review: true`.
- **Praxis** marks 21 flam and drag stickings `stickingReviewed: false` over the
  same material. These findings resolve them — reconcile once rather than
  proofing the same rudiments twice.
