# REVIEW.md — hybrid rudiment proofing worksheet

**2026-08-25 update:** Taylor supplied the official 1984 PAS International Drum
Rudiments chart and every encoded rudiment was proofed against it. Thirteen
hybrids were corrected in [`js/rudiment-data.js`](js/rudiment-data.js) (each
carries a `// verified vs the official PAS chart 2026-08-25` comment), three
flagged rudiments were confirmed correct as encoded, and the heritage chips
were audited against the chart's Standard-26 asterisks (15, 18, 25 corrected to
"PAS addition (1984)"). The corrected stickings, accents, and grace placements
are pinned by the test case *"PAS chart proofing 2026-08-25"* in
[`tests/cases.js`](tests/cases.js).

### Corrected against the chart (13)

| PAS | Rudiment | Now encoded (right lead) |
|----:|----------|--------------------------|
| 23 | Flamacue | `lR L> R L` — the closing flam is the next cycle's downbeat |
| 28 | Swiss Army Triplet | `lR>= R= L`, one triplet, same lead repeats (mirror = left-lead practice) |
| 29 | Inverted Flam Tap | `lR> L \| lL> R` — flam, then the tap on the opposite hand |
| 30 | Flam Drag | `lR> L= L= R` — the drag written out as two sixteenths, opposite hand |
| 32 | Single Drag Tap | `llR L>` — accent on the tap |
| 33 | Double Drag Tap | `llR llR L>` — both drags on the same hand |
| 34 | Lesson 25 | `llR L R>` — sixteenths, accent on the final stroke, lead repeats |
| 35 | Single Dragadiddle | `R>= R= L R R` — measured same-hand diddle lead, no grace notes |
| 36 | Drag Paradiddle #1 | `R> llR L R= R=` — accented single, then the dragged paradiddle |
| 37 | Drag Paradiddle #2 | `R> llR llR L R= R=` — single plus two same-hand drags |
| 38 | Single Ratamacue | `llR L R L>` — dragged sixteenth triplet + accented eighth release |
| 39 | Double Ratamacue | `llR llR L R L>` — a dragged eighth in front |
| 40 | Triple Ratamacue | `llR llR llR L R L>` — two dragged eighths in front |

### Confirmed correct as encoded (flags cleared)

- **#11 Ten Stroke Roll** — four doubles + two accented taps + rest.
- **#25 Single Flammed Mill** — `lR>= R= L R` (heritage chip corrected: PAS addition).
- **#27 Pataflafla** — flams and accents on notes 1 and 4.

---

## Still open — Taylor's call (the last 3 `// REVIEW` tags)

These are the only rudiments still flagged. The encoding is a deliberate
teaching variant; the official chart draws them differently. Pick one per
rudiment, then clear the tag.

- ☐ **#2 Single Stroke Four** — encoded: accented 4-note sixteenth burst
  (`R> L R L`). Chart: eighth-note triplet + release on the beat, **no
  accent**.
- ☐ **#3 Single Stroke Seven** — encoded: accented sixteenths
  (`R L R L R L R>`). Chart: sextuplet + release on the beat, **no accent**.
- ☐ **#8 Six Stroke Roll** — sticking and both accents match the chart
  (`R> L= L= R= R= L>`). Encoded as an even sextuplet; the chart draws
  eighth – rolled body – eighth (unequal note values).

Also open, from `CLAUDE.md` (not chart contradictions, chart-consistent
expansions to confirm):

- ☑ ~~Lead-marker accents the chart doesn't print~~ — **decided by Taylor
  2026-08-25: dropped.** #1, #2, #3, #5, #6, #20, #31 now carry no accents,
  matching the chart.
- ☐ **#4 Multiple Bounce Roll** — chart: one sustained buzzed note; encoded as
  four alternating buzz strokes (classroom expansion).
- ☐ **#7 Five Stroke Roll** release placement (diddles on the beat, release on
  beats 2/4) — unchanged from the earlier decision; the chart's slash
  abbreviation expands consistently with this.

---

## Separately: errors to fix in the Notion "Rudiment Mastery Program" doc
*(Flagged in an earlier session; not yet re-verified. The app's data does
**not** inherit these; they're in the source doc:)*
- Numbered rolls (five/seven/nine/etc.) written as single strokes rather than measured doubles.
- A mislabeled ratamacue.
- Duplicate rudiment entries.
