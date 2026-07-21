# REVIEW.md — hybrid rudiment proofing worksheet

The ~28 core rudiments (single/double stroke, standard rolls, flam, flam accent,
paradiddles, basic drags) are high-confidence and shipped as-is. The 19 rudiments
below carry **notation choices that vary between sources**. They validate, expand
in both leads, and pass every test — but "passes the schema" is not "matches the
way *you* teach it." This sheet is for proofing the musical content against your
source of truth before you publicize the catalog.

**How to use it:** for each rudiment, compare the encoded sticking to your
reference. If it's right, tick the box. If not, edit the record in
[`js/rudiment-data.js`](js/rudiment-data.js) (each is tagged with a `// REVIEW:`
comment and its PAS number) and re-run [`tests/test.html`](tests/test.html).

### Notation legend
- Capital `R` / `L` — the primary stroke (which hand).
- `>` — accent. `~` — buzz (multiple bounce). `=` — this note is one half of a measured diddle (double).
- lowercase prefix — grace note(s) on the opposite hand: `lR` = a **flam** (one left grace) into a right primary; `llR` = a **drag** (two left graces) into a right primary.
- `·` — a rest / ring (no stroke on that grid slot). `|` separates beats. Sticking shown for the **right lead**; left lead is the exact mirror.

---

## Priority 1 — please decide before publishing

These are where I'm least sure the encoding matches standard practice.

### ☐ #29 Inverted Flam Tap  · eighth notes · 2-beat
```
R  rL>  |  L  lR>
```
Encoded as **alternating** singles with the flam on the second note of each beat
(primary hands R L L R). The more common Inverted Flam Tap uses **same-hand
pairs** — `R (fR)  L (fL)` — a tap then a flammed note on the *same* hand, which
is what distinguishes it from a plain Flam Tap by technique (up-flam vs down-flam)
rather than by letters. **Confirm which you teach.** If it's the same-hand form,
the graces need to move to the repeated hand.

### ☐ #23 Flamacue  · sixteenth notes · 1-beat
```
lR  L>  R  rL
```
Flam on beat 1, accent on the 2nd sixteenth, closing flam on the **4th sixteenth
(the "a")**. Many sources place the closing flam on the **next downbeat** (beat 2),
so the figure reads flam–accent–tap–tap–flam across the barline. Decide whether
the closing flam belongs inside this beat or on the following one.

### ☐ #38–40 Ratamacue family — subdivision is inconsistent across the three
| PAS | Name | Encoded | Felt as |
|----:|------|---------|---------|
| 38 | Single Ratamacue | `llR L R>  \|  rrL R L>` | **triplet** (3 primaries) |
| 39 | Double Ratamacue | `llR llR L R>  \|  rrL rrL R L>` | **sixteenths** (4 primaries) |
| 40 | Triple Ratamacue | `llR llR llR \| L R> llR  \|  rrL rrL rrL \| R L> rrL` | **triplet**, 4-beat cycle |

The three are encoded on **different grids** (triplet / sixteenth / triplet). Ratamacues
are usually felt as a consistent drag-plus-figure across the family. Also confirm the
**note count** of the single ratamacue — some traditions write it as a drag plus four
notes (drag + `R L R L`), not the drag + three shown here — and check the trailing
drag placement in the triple.

---

## Priority 2 — plausible standard encodings, confirm at a glance

Rolls & measured figures:

- ☐ **#2 Single Stroke Four** — `R> L R L` (1 beat, sixteenths). Encoded as a 4-note burst; some feel it as a triplet flourish into the next accent.
- ☐ **#3 Single Stroke Seven** — `R L R L | R L R> ·` (accent on the 7th, arrival note rings).
- ☐ **#8 Six Stroke Roll** — `R> L= L= R= R= L>` (sextuplet). The accent–diddle–diddle–accent variant (RLLRRL); several other six-stroke orderings exist.
- ☐ **#11 Ten Stroke Roll** — `R= R= L= L= | R= R= L= L= | R> L> · ·` (four doubles + two accented taps).

Flam hybrids:

- ☐ **#25 Single Flammed Mill** — `lR>= R= L R | …` (flam + RR diddle, then two singles). Sticking of the "mill" varies by source.
- ☐ **#27 Pataflafla** — `lR> L R rL> | lR> L R rL>` (flams on the outer notes of each beat, both accented).
- ☐ **#28 Swiss Army Triplet** — `lR>= R= L | …` (flam + same-hand diddle + single, in a triplet).
- ☐ **#30 Flam Drag** — `lR> llR R | …` (flam + drag + tap on the lead hand, in a triplet).

Drag hybrids:

- ☐ **#32 Single Drag Tap** — `llR> L | rrL> R` (drag into the accented note, then a tap).
- ☐ **#33 Double Drag Tap** — `llR rrL R> | …` (two drags then an accented tap, triplet).
- ☐ **#34 Lesson 25** — `llR L> R | rrL R> L` (drag, accented tap, tap).
- ☐ **#35 Single Dragadiddle** — `llR> L R= R= L= L=` (drag on the lead into a paradiddle-diddle, sextuplet).
- ☐ **#36 Drag Paradiddle #1** — `llR> L R= R= | …` (paradiddle led by an accented drag).
- ☐ **#37 Drag Paradiddle #2** — `llR> rrL R= R= | …` (paradiddle led by two drags).

---

## Separately: errors to fix in the Notion "Rudiment Mastery Program" doc
*(Flagged in an earlier session; not yet re-verified this pass — treat as a to-check
list, confirm against the live Notion page before editing.)* The app's data does
**not** inherit these; they're in your source doc:
- Numbered rolls (five/seven/nine/etc.) written as single strokes rather than measured doubles.
- A mislabeled ratamacue.
- Duplicate rudiment entries.

I did not touch Notion. If you want, I can pull the page and produce a precise diff.
