/* Rudiment Room — rudiment definitions (all 40 PAS International Drum Rudiments).
   Structured data ONLY: no DOM, no audio. The small builder functions below
   just assemble stroke arrays (measured rolls especially) so long diddle
   sequences are generated correctly instead of hand-typed; the exported
   RUDIMENTS is plain data and is deep-frozen at the bottom.

   Pattern facts (sticking, accents, grace notes, groupings) follow the
   Percussive Arts Society's 40 International Drum Rudiments and standard
   rudimental pedagogy. The data model, prose, and rendering are original.

   ACCURACY NOTE: sticking, accents and grace structures follow the PAS
   chart. The 19 hybrids that once carried source-varying notation were
   proofed on 2026-09-03 against the notation PAS published in May 2026 — 5
   confirmed as encoded, 14 re-encoded. tests/cases.js pins every re-encoded
   sticking. REVIEW.md carries the three questions still open; only the
   Single Dragadiddle is still tagged "REVIEW" here.

   Record + stroke shape are documented in js/rudiment-core.js (validateRudiment).
   `counting` is omitted here and generated from the subdivision by the core.

   Classic script (works over file://); exports for Node at the bottom. */
(function (root) {
"use strict";

var R = "R", L = "L";
function other(h) { return h === R ? L : R; }

/* ---- builders (produce plain stroke arrays) ---- */

// Measured double-stroke roll, both halves (R lead then L lead), sixteenth grid.
// diddlesPerHalf doubles, then one accented release that rings to the end of its
// beat. Release lands where the diddles run out — on an upbeat for odd counts
// (7/11/15), which is how those rolls are counted. slotsPerBeat assumed 4.
function measuredRoll(diddlesPerHalf) {
  var spb = 4, strokes = [], did = 0, slot = 0;
  [R, L].forEach(function (lead) {
    for (var k = 0; k < diddlesPerHalf; k++) {
      var hand = (k % 2 === 0) ? lead : other(lead);
      did++;
      strokes.push({ slot: slot, hand: hand, diddle: did });
      strokes.push({ slot: slot + 1, hand: hand, diddle: did });
      slot += 2;
    }
    var lastHand = ((diddlesPerHalf - 1) % 2 === 0) ? lead : other(lead);
    var dur = spb - (slot % spb);
    strokes.push({ slot: slot, hand: other(lastHand), accent: true, duration: dur });
    slot += dur;
  });
  return strokes; // cycleBeats = slot / spb
}

// Paradiddle family: one accented lead, alternating singles, closing diddle.
// singlesBeforeDiddle = 2 (single), 4 (double), 6 (triple). Both leads. spb set
// so each half fills one or two beats.
function paradiddle(singlesBeforeDiddle, spb) {
  var strokes = [], did = 0, slot = 0;
  [R, L].forEach(function (lead) {
    var hand = lead;
    for (var i = 0; i < singlesBeforeDiddle; i++) {
      strokes.push(i === 0 ? { slot: slot, hand: hand, accent: true } : { slot: slot, hand: hand });
      hand = other(hand);
      slot++;
    }
    did++;
    // The diddle continues the alternation onto the next hand — which, because
    // paradiddles use an even number of singles, is the lead hand: RLRR, RLRLRR…
    var dHand = hand;
    strokes.push({ slot: slot, hand: dHand, diddle: did });
    strokes.push({ slot: slot + 1, hand: dHand, diddle: did });
    slot += 2;
  });
  return strokes;
}

var RUDIMENTS = [

  /* ============================================================
     I. ROLL RUDIMENTS (PAS 1–15)
     ============================================================ */

  /* 1 — Single Stroke Roll */
  { id: "single-stroke-roll", name: "Single Stroke Roll", pas: 1, family: "Roll",
    level: "Beginner", cycleBeats: 2, slotsPerBeat: 4, subdivision: "Sixteenth notes",
    tempo: { defaultBpm: 90, suggestedLo: 60, suggestedHi: 160 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "The foundation: even, alternating single strokes. Keep both hands matched in height and sound from slow to fast.",
    aliases: ["single stroke", "singles"],
    strokes: [
      { slot: 0, hand: R, accent: true }, { slot: 1, hand: L }, { slot: 2, hand: R }, { slot: 3, hand: L },
      { slot: 4, hand: R }, { slot: 5, hand: L }, { slot: 6, hand: R }, { slot: 7, hand: L },
    ] },

  /* 2 — Single Stroke Four */
  { id: "single-stroke-four", name: "Single Stroke Four", pas: 2, family: "Roll",
    level: "Beginner", cycleBeats: 1, slotsPerBeat: 6, subdivision: "Sixteenth-note triplet into an eighth",
    tempo: { defaultBpm: 80, suggestedLo: 60, suggestedHi: 150 }, leadingHand: "mirror",
    heritage: "PAS addition (1984)",
    teachingNote: "A flourish, not four flat notes: three fast singles across the first half of the beat landing on a longer fourth. Keep the triplet even and let the arrival ring.",
    aliases: ["single stroke 4"],
    strokes: [
      { slot: 0, hand: R, accent: true }, { slot: 1, hand: L }, { slot: 2, hand: R },
      { slot: 3, hand: L, duration: 3 },
    ] },

  /* 3 — Single Stroke Seven */
  { id: "single-stroke-seven", name: "Single Stroke Seven", pas: 3, family: "Roll",
    level: "Intermediate", cycleBeats: 2, slotsPerBeat: 6, subdivision: "Sextuplet into an arrival",
    tempo: { defaultBpm: 76, suggestedLo: 54, suggestedHi: 144 }, leadingHand: "mirror",
    heritage: "PAS addition (1984)",
    teachingNote: "Six single strokes filling one beat, arriving on the seventh at the top of the next. Keep the sextuplet even and let the arrival ring.",
    aliases: ["single stroke 7"],
    strokes: [
      { slot: 0, hand: R }, { slot: 1, hand: L }, { slot: 2, hand: R },
      { slot: 3, hand: L }, { slot: 4, hand: R }, { slot: 5, hand: L },
      { slot: 6, hand: R, accent: true, duration: 6 },
    ] },

  /* 4 — Multiple Bounce Roll (buzz) */
  { id: "multiple-bounce-roll", name: "Multiple Bounce Roll", pas: 4, family: "Roll",
    level: "Intermediate", cycleBeats: 2, slotsPerBeat: 2, subdivision: "Buzzed pulses",
    tempo: { defaultBpm: 80, suggestedLo: 50, suggestedHi: 132 }, leadingHand: "mirror",
    heritage: "PAS addition (1984)",
    teachingNote: "Each stroke is a controlled multiple bounce (a buzz), pressed evenly so the sounds overlap into a smooth roll. Sound, not stroke count, is the goal.",
    aliases: ["buzz roll", "closed roll", "concert roll", "orchestral roll"],
    strokes: [
      { slot: 0, hand: R, buzz: true }, { slot: 1, hand: L, buzz: true },
      { slot: 2, hand: R, buzz: true }, { slot: 3, hand: L, buzz: true },
    ] },

  /* 5 — Triple Stroke Roll */
  { id: "triple-stroke-roll", name: "Triple Stroke Roll", pas: 5, family: "Roll",
    level: "Intermediate", cycleBeats: 2, slotsPerBeat: 3, subdivision: "Triplet (three per hand)",
    tempo: { defaultBpm: 72, suggestedLo: 50, suggestedHi: 132 }, leadingHand: "mirror",
    heritage: "PAS addition (1984)",
    teachingNote: "Three even strokes per hand: RRR LLL. Let the second and third strokes rebound naturally without losing evenness.",
    aliases: ["triple stroke", "french roll"],
    strokes: [
      { slot: 0, hand: R, accent: true, group: 1 }, { slot: 1, hand: R, group: 1 }, { slot: 2, hand: R, group: 1 },
      { slot: 3, hand: L, group: 2 }, { slot: 4, hand: L, group: 2 }, { slot: 5, hand: L, group: 2 },
    ] },

  /* 6 — Double Stroke Open Roll (Long Roll) */
  { id: "double-stroke-open-roll", name: "Double Stroke Open Roll", pas: 6, family: "Roll",
    level: "Beginner", cycleBeats: 2, slotsPerBeat: 4, subdivision: "Sixteenth notes",
    tempo: { defaultBpm: 80, suggestedLo: 55, suggestedHi: 150 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "The long roll: clean, even double strokes. Match the two strokes of each hand in height and volume before adding speed.",
    aliases: ["long roll", "open roll", "double stroke roll"],
    strokes: [
      { slot: 0, hand: R, accent: true, diddle: 1 }, { slot: 1, hand: R, diddle: 1 },
      { slot: 2, hand: L, diddle: 2 }, { slot: 3, hand: L, diddle: 2 },
      { slot: 4, hand: R, diddle: 3 }, { slot: 5, hand: R, diddle: 3 },
      { slot: 6, hand: L, diddle: 4 }, { slot: 7, hand: L, diddle: 4 },
    ] },

  /* 7 — Five Stroke Roll */
  { id: "five-stroke-roll", name: "Five Stroke Roll", pas: 7, family: "Roll",
    level: "Beginner", cycleBeats: 4, slotsPerBeat: 4, subdivision: "Sixteenth notes",
    tempo: { defaultBpm: 76, suggestedLo: 60, suggestedHi: 132 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "Two doubles into an accented release: rr–ll–R. Play the doubles open and even at slow tempos and let them close up as speed rises.",
    aliases: ["5 stroke roll", "five-stroke"],
    strokes: [
      { slot: 0,  hand: R, diddle: 1 }, { slot: 1,  hand: R, diddle: 1 },
      { slot: 2,  hand: L, diddle: 2 }, { slot: 3,  hand: L, diddle: 2 },
      { slot: 4,  hand: R, accent: true, duration: 4 },
      { slot: 8,  hand: L, diddle: 3 }, { slot: 9,  hand: L, diddle: 3 },
      { slot: 10, hand: R, diddle: 4 }, { slot: 11, hand: R, diddle: 4 },
      { slot: 12, hand: L, accent: true, duration: 4 },
    ] },

  /* 8 — Six Stroke Roll */ // REVIEW: accent–diddle–diddle–accent variant (RLLRRL); other versions exist
  { id: "six-stroke-roll", name: "Six Stroke Roll", pas: 8, family: "Roll",
    level: "Intermediate", cycleBeats: 1, slotsPerBeat: 6, subdivision: "Sextuplet",
    tempo: { defaultBpm: 72, suggestedLo: 50, suggestedHi: 132 }, leadingHand: "mirror",
    heritage: "PAS addition (1984)",
    teachingNote: "Accented singles bracket two inner doubles: R–ll–rr–L. A common groove roll; keep the accents strong and the diddles relaxed.",
    aliases: ["6 stroke roll"],
    strokes: [
      { slot: 0, hand: R, accent: true },
      { slot: 1, hand: L, diddle: 1 }, { slot: 2, hand: L, diddle: 1 },
      { slot: 3, hand: R, diddle: 2 }, { slot: 4, hand: R, diddle: 2 },
      { slot: 5, hand: L, accent: true },
    ] },

  /* 9 — Seven Stroke Roll */
  { id: "seven-stroke-roll", name: "Seven Stroke Roll", pas: 9, family: "Roll",
    level: "Intermediate", cycleBeats: 4, slotsPerBeat: 4, subdivision: "Sixteenth notes",
    tempo: { defaultBpm: 72, suggestedLo: 54, suggestedHi: 132 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "Three doubles into an accented release. The release lands on the upbeat — count it carefully at slow tempos.",
    aliases: ["7 stroke roll"],
    strokes: measuredRoll(3) },

  /* 10 — Nine Stroke Roll */
  { id: "nine-stroke-roll", name: "Nine Stroke Roll", pas: 10, family: "Roll",
    level: "Intermediate", cycleBeats: 6, slotsPerBeat: 4, subdivision: "Sixteenth notes",
    tempo: { defaultBpm: 72, suggestedLo: 54, suggestedHi: 132 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "Four doubles into an accented release on the downbeat. A cornerstone roll — even doubles, clean release.",
    aliases: ["9 stroke roll"],
    strokes: measuredRoll(4) },

  /* 11 — Ten Stroke Roll */ // REVIEW: four doubles + two accented taps
  { id: "ten-stroke-roll", name: "Ten Stroke Roll", pas: 11, family: "Roll",
    level: "Intermediate", cycleBeats: 3, slotsPerBeat: 4, subdivision: "Sixteenth notes",
    tempo: { defaultBpm: 72, suggestedLo: 54, suggestedHi: 126 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "Four doubles then two accented single taps (R L). Keep the two closing taps clean and even with the roll.",
    aliases: ["10 stroke roll"],
    strokes: [
      { slot: 0, hand: R, diddle: 1 }, { slot: 1, hand: R, diddle: 1 },
      { slot: 2, hand: L, diddle: 2 }, { slot: 3, hand: L, diddle: 2 },
      { slot: 4, hand: R, diddle: 3 }, { slot: 5, hand: R, diddle: 3 },
      { slot: 6, hand: L, diddle: 4 }, { slot: 7, hand: L, diddle: 4 },
      { slot: 8, hand: R, accent: true }, { slot: 9, hand: L, accent: true },
    ] },

  /* 12 — Eleven Stroke Roll */
  { id: "eleven-stroke-roll", name: "Eleven Stroke Roll", pas: 12, family: "Roll",
    level: "Advanced", cycleBeats: 6, slotsPerBeat: 4, subdivision: "Sixteenth notes",
    tempo: { defaultBpm: 66, suggestedLo: 50, suggestedHi: 120 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "Five doubles into an accented release on the upbeat. Count the release placement carefully.",
    aliases: ["11 stroke roll"],
    strokes: measuredRoll(5) },

  /* 13 — Thirteen Stroke Roll */
  { id: "thirteen-stroke-roll", name: "Thirteen Stroke Roll", pas: 13, family: "Roll",
    level: "Advanced", cycleBeats: 8, slotsPerBeat: 4, subdivision: "Sixteenth notes",
    tempo: { defaultBpm: 66, suggestedLo: 50, suggestedHi: 120 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "Six doubles into an accented release on the downbeat. A long roll — hold evenness all the way to the release.",
    aliases: ["13 stroke roll"],
    strokes: measuredRoll(6) },

  /* 14 — Fifteen Stroke Roll */
  { id: "fifteen-stroke-roll", name: "Fifteen Stroke Roll", pas: 14, family: "Roll",
    level: "Advanced", cycleBeats: 8, slotsPerBeat: 4, subdivision: "Sixteenth notes",
    tempo: { defaultBpm: 63, suggestedLo: 48, suggestedHi: 112 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "Seven doubles into an accented release on the upbeat. Stamina and evenness are the challenge here.",
    aliases: ["15 stroke roll"],
    strokes: measuredRoll(7) },

  /* 15 — Seventeen Stroke Roll */
  { id: "seventeen-stroke-roll", name: "Seventeen Stroke Roll", pas: 15, family: "Roll",
    level: "Advanced", cycleBeats: 10, slotsPerBeat: 4, subdivision: "Sixteenth notes",
    tempo: { defaultBpm: 60, suggestedLo: 48, suggestedHi: 108 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "Eight doubles into an accented release on the downbeat. The longest measured roll in the set.",
    aliases: ["17 stroke roll"],
    strokes: measuredRoll(8) },

  /* ============================================================
     II. DIDDLE RUDIMENTS (PAS 16–19)
     ============================================================ */

  /* 16 — Single Paradiddle */
  { id: "single-paradiddle", name: "Single Paradiddle", pas: 16, family: "Diddle",
    level: "Beginner", cycleBeats: 2, slotsPerBeat: 4, subdivision: "Sixteenth notes",
    tempo: { defaultBpm: 80, suggestedLo: 60, suggestedHi: 140 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "One accent, then let the hand relax — the singles and the double should all match in sound. The sticking trades the lead hand every four notes by itself.",
    aliases: ["paradiddle", "RLRR LRLL"],
    strokes: paradiddle(2, 4) },

  /* 17 — Double Paradiddle */
  { id: "double-paradiddle", name: "Double Paradiddle", pas: 17, family: "Diddle",
    level: "Intermediate", cycleBeats: 2, slotsPerBeat: 6, subdivision: "Sextuplet",
    tempo: { defaultBpm: 80, suggestedLo: 60, suggestedHi: 132 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "Two pairs of alternating singles before the diddle: RLRLRR. Sits naturally in a triplet or 6/8 feel.",
    aliases: ["double paradiddle", "RLRLRR"],
    strokes: paradiddle(4, 6) },

  /* 18 — Triple Paradiddle */
  { id: "triple-paradiddle", name: "Triple Paradiddle", pas: 18, family: "Diddle",
    level: "Intermediate", cycleBeats: 4, slotsPerBeat: 4, subdivision: "Sixteenth notes",
    tempo: { defaultBpm: 80, suggestedLo: 60, suggestedHi: 126 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "Three pairs of alternating singles before the diddle: RLRLRLRR. Keep the long run of singles even into the closing double.",
    aliases: ["triple paradiddle", "RLRLRLRR"],
    strokes: paradiddle(6, 4) },

  /* 19 — Single Paradiddle-diddle */
  { id: "single-paradiddle-diddle", name: "Single Paradiddle-diddle", pas: 19, family: "Diddle",
    level: "Intermediate", cycleBeats: 1, slotsPerBeat: 6, subdivision: "Sextuplet",
    tempo: { defaultBpm: 76, suggestedLo: 54, suggestedHi: 126 }, leadingHand: "mirror",
    heritage: "PAS addition (1984)",
    teachingNote: "One single lead into two diddles: R–L–rr–ll. A favorite drum-set sticking; it keeps the same lead hand each time.",
    aliases: ["paradiddle-diddle", "RLRRLL"],
    strokes: [
      { slot: 0, hand: R, accent: true }, { slot: 1, hand: L },
      { slot: 2, hand: R, diddle: 1 }, { slot: 3, hand: R, diddle: 1 },
      { slot: 4, hand: L, diddle: 2 }, { slot: 5, hand: L, diddle: 2 },
    ] },

  /* ============================================================
     III. FLAM RUDIMENTS (PAS 20–30)
     ============================================================ */

  /* 20 — Flam */
  { id: "flam", name: "Flam", pas: 20, family: "Flam",
    level: "Beginner", cycleBeats: 2, slotsPerBeat: 1, subdivision: "Quarter notes",
    tempo: { defaultBpm: 80, suggestedLo: 50, suggestedHi: 132 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "One soft grace note tucked just ahead of the main stroke, so they sound almost as one thick note. Keep the grace low and the primary full.",
    aliases: ["flams"],
    strokes: [
      { slot: 0, hand: R, accent: true, grace: [{ hand: L }] },
      { slot: 1, hand: L, accent: true, grace: [{ hand: R }] },
    ] },

  /* 21 — Flam Accent */
  { id: "flam-accent", name: "Flam Accent", pas: 21, family: "Flam",
    level: "Beginner", cycleBeats: 2, slotsPerBeat: 3, subdivision: "Triplet eighth notes",
    tempo: { defaultBpm: 72, suggestedLo: 50, suggestedHi: 120 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "One flam starts each triplet. Keep the grace note low and soft, tucked just ahead of the accented primary, and let the two singles after it stay light.",
    aliases: ["flam accent no. 1"],
    strokes: [
      { slot: 0, hand: R, accent: true, grace: [{ hand: L }] }, { slot: 1, hand: L }, { slot: 2, hand: R },
      { slot: 3, hand: L, accent: true, grace: [{ hand: R }] }, { slot: 4, hand: R }, { slot: 5, hand: L },
    ] },

  /* 22 — Flam Tap */
  { id: "flam-tap", name: "Flam Tap", pas: 22, family: "Flam",
    level: "Beginner", cycleBeats: 2, slotsPerBeat: 2, subdivision: "Eighth notes",
    tempo: { defaultBpm: 76, suggestedLo: 54, suggestedHi: 132 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "A flam followed by a tap on the same hand: fR–R, fL–L. The tap uses the rebound of the flam's primary stroke.",
    aliases: ["flam taps"],
    strokes: [
      { slot: 0, hand: R, accent: true, grace: [{ hand: L }] }, { slot: 1, hand: R },
      { slot: 2, hand: L, accent: true, grace: [{ hand: R }] }, { slot: 3, hand: L },
    ] },

  /* 23 — Flamacue */
  { id: "flamacue", name: "Flamacue", pas: 23, family: "Flam",
    level: "Intermediate", cycleBeats: 2, slotsPerBeat: 4, subdivision: "Sixteenth notes",
    tempo: { defaultBpm: 72, suggestedLo: 50, suggestedHi: 120 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "A flam, an accent on the second sixteenth, two taps, and a closing flam on the following downbeat: fR L> R L fR. The inner accent is the character of the rudiment, and the closing flam lands on the beat rather than inside it.",
    aliases: ["flam cue"],
    strokes: [
      { slot: 0, hand: R, grace: [{ hand: L }] },
      { slot: 1, hand: L, accent: true },
      { slot: 2, hand: R },
      { slot: 3, hand: L },
      { slot: 4, hand: R, grace: [{ hand: L }], duration: 4 },
    ] },

  /* 24 — Flam Paradiddle */
  { id: "flam-paradiddle", name: "Flam Paradiddle", pas: 24, family: "Flam",
    level: "Intermediate", cycleBeats: 2, slotsPerBeat: 4, subdivision: "Sixteenth notes",
    tempo: { defaultBpm: 76, suggestedLo: 54, suggestedHi: 126 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "A paradiddle whose accented first note is flammed: fR L R R, fL R L L. Flam the lead, keep the diddle relaxed.",
    aliases: ["flam paradiddle", "flamadiddle"],
    strokes: [
      { slot: 0, hand: R, accent: true, grace: [{ hand: L }] }, { slot: 1, hand: L },
      { slot: 2, hand: R, diddle: 1 }, { slot: 3, hand: R, diddle: 1 },
      { slot: 4, hand: L, accent: true, grace: [{ hand: R }] }, { slot: 5, hand: R },
      { slot: 6, hand: L, diddle: 2 }, { slot: 7, hand: L, diddle: 2 },
    ] },

  /* 25 — Single Flammed Mill */ // REVIEW: flam + diddle + two singles; sticking varies
  { id: "single-flammed-mill", name: "Single Flammed Mill", pas: 25, family: "Flam",
    level: "Advanced", cycleBeats: 2, slotsPerBeat: 4, subdivision: "Sixteenth notes",
    tempo: { defaultBpm: 72, suggestedLo: 50, suggestedHi: 120 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "A flammed lead into a diddle, then two singles: fR–rr–L–R. Essentially an inverted flam paradiddle with the diddle up front.",
    aliases: ["flammed mill"],
    strokes: [
      { slot: 0, hand: R, accent: true, grace: [{ hand: L }], diddle: 1 }, { slot: 1, hand: R, diddle: 1 },
      { slot: 2, hand: L }, { slot: 3, hand: R },
      { slot: 4, hand: L, accent: true, grace: [{ hand: R }], diddle: 2 }, { slot: 5, hand: L, diddle: 2 },
      { slot: 6, hand: R }, { slot: 7, hand: L },
    ] },

  /* 26 — Flam Paradiddle-diddle */
  { id: "flam-paradiddle-diddle", name: "Flam Paradiddle-diddle", pas: 26, family: "Flam",
    level: "Advanced", cycleBeats: 2, slotsPerBeat: 6, subdivision: "Sextuplet",
    tempo: { defaultBpm: 72, suggestedLo: 50, suggestedHi: 120 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "A flammed lead into a paradiddle-diddle: fR L rr ll. Keeps the same lead hand, so it loops as a steady groove.",
    aliases: ["flam paradiddle diddle", "flamadiddle-diddle"],
    strokes: [
      { slot: 0, hand: R, accent: true, grace: [{ hand: L }] }, { slot: 1, hand: L },
      { slot: 2, hand: R, diddle: 1 }, { slot: 3, hand: R, diddle: 1 },
      { slot: 4, hand: L, diddle: 2 }, { slot: 5, hand: L, diddle: 2 },
      { slot: 6, hand: L, accent: true, grace: [{ hand: R }] }, { slot: 7, hand: R },
      { slot: 8, hand: L, diddle: 3 }, { slot: 9, hand: L, diddle: 3 },
      { slot: 10, hand: R, diddle: 4 }, { slot: 11, hand: R, diddle: 4 },
    ] },

  /* 27 — Pataflafla */ // REVIEW: flams on the outer notes with a central "flafla"
  { id: "pataflafla", name: "Pataflafla", pas: 27, family: "Flam",
    level: "Advanced", cycleBeats: 2, slotsPerBeat: 4, subdivision: "Sixteenth notes",
    tempo: { defaultBpm: 66, suggestedLo: 48, suggestedHi: 112 }, leadingHand: "mirror",
    heritage: "PAS addition (1984)",
    teachingNote: "Flams on the outer notes bracket two inner taps, with a back-to-back 'fla-fla' at the turn: fR L R fL fR L R fL.",
    aliases: ["pataflafla"],
    strokes: [
      { slot: 0, hand: R, accent: true, grace: [{ hand: L }] }, { slot: 1, hand: L }, { slot: 2, hand: R }, { slot: 3, hand: L, accent: true, grace: [{ hand: R }] },
      { slot: 4, hand: R, accent: true, grace: [{ hand: L }] }, { slot: 5, hand: L }, { slot: 6, hand: R }, { slot: 7, hand: L, accent: true, grace: [{ hand: R }] },
    ] },

  /* 28 — Swiss Army Triplet */ // REVIEW: flam + diddle-hand + single, in a triplet
  { id: "swiss-army-triplet", name: "Swiss Army Triplet", pas: 28, family: "Flam",
    level: "Advanced", cycleBeats: 2, slotsPerBeat: 3, subdivision: "Triplet eighth notes",
    tempo: { defaultBpm: 72, suggestedLo: 50, suggestedHi: 120 }, leadingHand: "mirror",
    heritage: "PAS addition (1984)",
    teachingNote: "A flam, then the flam hand plays again, then the other hand: fR R L. Feels like a flam accent but with a diddle-style lead.",
    aliases: ["swiss triplet", "swiss army"],
    strokes: [
      { slot: 0, hand: R, accent: true, grace: [{ hand: L }], diddle: 1 }, { slot: 1, hand: R, diddle: 1 }, { slot: 2, hand: L },
      { slot: 3, hand: L, accent: true, grace: [{ hand: R }], diddle: 2 }, { slot: 4, hand: L, diddle: 2 }, { slot: 5, hand: R },
    ] },

  /* 29 — Inverted Flam Tap */
  { id: "inverted-flam-tap", name: "Inverted Flam Tap", pas: 29, family: "Flam",
    level: "Advanced", cycleBeats: 2, slotsPerBeat: 2, subdivision: "Eighth notes",
    tempo: { defaultBpm: 72, suggestedLo: 50, suggestedHi: 120 }, leadingHand: "mirror",
    heritage: "PAS addition (1984)",
    teachingNote: "A flammed accent into a tap on the opposite hand: fR> L, fL> R. The flams fall on the beat and the taps pair across them — that inversion is what separates it from the Flam Tap.",
    aliases: ["inverted flam tap"],
    strokes: [
      { slot: 0, hand: R, accent: true, grace: [{ hand: L }] }, { slot: 1, hand: L },
      { slot: 2, hand: L, accent: true, grace: [{ hand: R }] }, { slot: 3, hand: R },
    ] },

  /* 30 — Flam Drag */
  { id: "flam-drag", name: "Flam Drag", pas: 30, family: "Flam",
    level: "Advanced", cycleBeats: 3, slotsPerBeat: 4, subdivision: "Eighth, two sixteenths, eighth",
    tempo: { defaultBpm: 66, suggestedLo: 48, suggestedHi: 112 }, leadingHand: "mirror",
    heritage: "PAS addition (1984)",
    teachingNote: "A flammed accent, then an open drag written out as two measured sixteenths, resolving back onto the lead hand: fR> L L R. The drag is counted, not crushed.",
    aliases: ["flam drag"],
    strokes: [
      { slot: 0, hand: R, accent: true, grace: [{ hand: L }], duration: 2 },
      { slot: 2, hand: L }, { slot: 3, hand: L },
      { slot: 4, hand: R, duration: 2 },
      { slot: 6, hand: L, accent: true, grace: [{ hand: R }], duration: 2 },
      { slot: 8, hand: R }, { slot: 9, hand: R },
      { slot: 10, hand: L, duration: 2 },
    ] },

  /* ============================================================
     IV. DRAG RUDIMENTS (PAS 31–40)
     ============================================================ */

  /* 31 — Drag (Ruff) */
  { id: "drag", name: "Drag", pas: 31, family: "Drag",
    level: "Beginner", cycleBeats: 2, slotsPerBeat: 1, subdivision: "Quarter notes",
    tempo: { defaultBpm: 76, suggestedLo: 50, suggestedHi: 126 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "Two quick grace notes tucked ahead of the main stroke: ll–R, rr–L. Keep the two graces low, even, and close to the primary.",
    aliases: ["ruff", "half drag", "drag ruff"],
    strokes: [
      { slot: 0, hand: R, accent: true, grace: [{ hand: L }, { hand: L }] },
      { slot: 1, hand: L, accent: true, grace: [{ hand: R }, { hand: R }] },
    ] },

  /* 32 — Single Drag Tap */
  { id: "single-drag-tap", name: "Single Drag Tap", pas: 32, family: "Drag",
    level: "Beginner", cycleBeats: 2, slotsPerBeat: 2, subdivision: "Eighth notes",
    tempo: { defaultBpm: 72, suggestedLo: 50, suggestedHi: 120 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "A drag into the lead hand, then an accented tap on the other: drag-R L>. The accent belongs to the tap, not to the drag underneath it.",
    aliases: ["single drag"],
    strokes: [
      { slot: 0, hand: R, grace: [{ hand: L }, { hand: L }] }, { slot: 1, hand: L, accent: true },
      { slot: 2, hand: L, grace: [{ hand: R }, { hand: R }] }, { slot: 3, hand: R, accent: true },
    ] },

  /* 33 — Double Drag Tap */
  { id: "double-drag-tap", name: "Double Drag Tap", pas: 33, family: "Drag",
    level: "Intermediate", cycleBeats: 3, slotsPerBeat: 2, subdivision: "Eighth notes",
    tempo: { defaultBpm: 66, suggestedLo: 48, suggestedHi: 112 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "Two drags on the same hand, then an accented tap on the other: drag-R drag-R L>. Both drags stay on the lead hand before the accent turns the figure around.",
    aliases: ["double drag"],
    strokes: [
      { slot: 0, hand: R, grace: [{ hand: L }, { hand: L }] }, { slot: 1, hand: R, grace: [{ hand: L }, { hand: L }] }, { slot: 2, hand: L, accent: true },
      { slot: 3, hand: L, grace: [{ hand: R }, { hand: R }] }, { slot: 4, hand: L, grace: [{ hand: R }, { hand: R }] }, { slot: 5, hand: R, accent: true },
    ] },

  /* 34 — Lesson 25 */
  { id: "lesson-25", name: "Lesson 25", pas: 34, family: "Drag",
    level: "Intermediate", cycleBeats: 2, slotsPerBeat: 4, subdivision: "Two sixteenths into an eighth",
    tempo: { defaultBpm: 72, suggestedLo: 50, suggestedHi: 120 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "A drag, a tap, and an accented arrival back on the lead hand: drag-R L R>. The accent closes the figure rather than opening it.",
    aliases: ["lesson twenty-five", "single drag tap no. 2"],
    strokes: [
      { slot: 0, hand: R, grace: [{ hand: L }, { hand: L }] }, { slot: 1, hand: L },
      { slot: 2, hand: R, accent: true, duration: 2 },
      { slot: 4, hand: L, grace: [{ hand: R }, { hand: R }] }, { slot: 5, hand: R },
      { slot: 6, hand: L, accent: true, duration: 2 },
    ] },

  /* 35 — Single Dragadiddle */ // REVIEW: PAS letters this drag on the primary hand; the core requires opposing grace hands, so it ships as an opposite-hand drag pending Taylor's call
  { id: "single-dragadiddle", name: "Single Dragadiddle", pas: 35, family: "Drag",
    level: "Intermediate", cycleBeats: 2, slotsPerBeat: 4, subdivision: "Sixteenth notes",
    tempo: { defaultBpm: 68, suggestedLo: 48, suggestedHi: 112 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "A single paradiddle whose accented first note carries a drag: drag-R> L R R. Four notes, not six — the diddle closes the figure.",
    aliases: ["dragadiddle"],
    strokes: [
      { slot: 0, hand: R, accent: true, grace: [{ hand: L }, { hand: L }] }, { slot: 1, hand: L },
      { slot: 2, hand: R, diddle: 1 }, { slot: 3, hand: R, diddle: 1 },
      { slot: 4, hand: L, accent: true, grace: [{ hand: R }, { hand: R }] }, { slot: 5, hand: R },
      { slot: 6, hand: L, diddle: 2 }, { slot: 7, hand: L, diddle: 2 },
    ] },

  /* 36 — Drag Paradiddle #1 */
  { id: "drag-paradiddle-1", name: "Drag Paradiddle #1", pas: 36, family: "Drag",
    level: "Advanced", cycleBeats: 3, slotsPerBeat: 4, subdivision: "Eighth pickup into sixteenths",
    tempo: { defaultBpm: 66, suggestedLo: 48, suggestedHi: 112 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "An accented pickup on the lead hand, then a single paradiddle whose first note carries a drag: R> drag-R L R R. The accent is the pickup — the drag underneath the next note stays soft.",
    aliases: ["drag paradiddle 1", "drag paradiddle one"],
    strokes: [
      { slot: 0, hand: R, accent: true, duration: 2 },
      { slot: 2, hand: R, grace: [{ hand: L }, { hand: L }] }, { slot: 3, hand: L },
      { slot: 4, hand: R, diddle: 1 }, { slot: 5, hand: R, diddle: 1 },
      { slot: 6, hand: L, accent: true, duration: 2 },
      { slot: 8, hand: L, grace: [{ hand: R }, { hand: R }] }, { slot: 9, hand: R },
      { slot: 10, hand: L, diddle: 2 }, { slot: 11, hand: L, diddle: 2 },
    ] },

  /* 37 — Drag Paradiddle #2 */
  { id: "drag-paradiddle-2", name: "Drag Paradiddle #2", pas: 37, family: "Drag",
    level: "Advanced", cycleBeats: 4, slotsPerBeat: 4, subdivision: "Eighth pickup, dragged eighth, sixteenths",
    tempo: { defaultBpm: 63, suggestedLo: 46, suggestedHi: 108 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "An accented pickup, a dragged eighth on the same hand, then a drag paradiddle: R> drag-R drag-R L R R. Both drags stay on the lead hand.",
    aliases: ["drag paradiddle 2", "drag paradiddle two"],
    strokes: [
      { slot: 0, hand: R, accent: true, duration: 2 },
      { slot: 2, hand: R, grace: [{ hand: L }, { hand: L }], duration: 2 },
      { slot: 4, hand: R, grace: [{ hand: L }, { hand: L }] }, { slot: 5, hand: L },
      { slot: 6, hand: R, diddle: 1 }, { slot: 7, hand: R, diddle: 1 },
      { slot: 8, hand: L, accent: true, duration: 2 },
      { slot: 10, hand: L, grace: [{ hand: R }, { hand: R }], duration: 2 },
      { slot: 12, hand: L, grace: [{ hand: R }, { hand: R }] }, { slot: 13, hand: R },
      { slot: 14, hand: L, diddle: 2 }, { slot: 15, hand: L, diddle: 2 },
    ] },

  /* 38 — Single Ratamacue */
  { id: "single-ratamacue", name: "Single Ratamacue", pas: 38, family: "Drag",
    level: "Intermediate", cycleBeats: 2, slotsPerBeat: 6, subdivision: "Sixteenth-note triplet into an eighth",
    tempo: { defaultBpm: 66, suggestedLo: 48, suggestedHi: 112 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "A drag into a fast triplet that resolves onto a longer accent: drag-R L R L>. Four notes — ra-ta-ma-cue — with the cue held.",
    aliases: ["ratamacue", "single rat"],
    strokes: [
      { slot: 0, hand: R, grace: [{ hand: L }, { hand: L }] }, { slot: 1, hand: L }, { slot: 2, hand: R },
      { slot: 3, hand: L, accent: true, duration: 3 },
      { slot: 6, hand: L, grace: [{ hand: R }, { hand: R }] }, { slot: 7, hand: R }, { slot: 8, hand: L },
      { slot: 9, hand: R, accent: true, duration: 3 },
    ] },

  /* 39 — Double Ratamacue */
  { id: "double-ratamacue", name: "Double Ratamacue", pas: 39, family: "Drag",
    level: "Advanced", cycleBeats: 3, slotsPerBeat: 6, subdivision: "Dragged eighth, triplet, accent",
    tempo: { defaultBpm: 60, suggestedLo: 46, suggestedHi: 104 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "The single ratamacue with one extra drag in front of it: drag-R, then drag-R L R resolving onto the accent. Same figure, one drag longer.",
    aliases: ["double rat"],
    strokes: [
      { slot: 0, hand: R, grace: [{ hand: L }, { hand: L }], duration: 3 },
      { slot: 3, hand: R, grace: [{ hand: L }, { hand: L }] }, { slot: 4, hand: L }, { slot: 5, hand: R },
      { slot: 6, hand: L, accent: true, duration: 3 },
      { slot: 9, hand: L, grace: [{ hand: R }, { hand: R }], duration: 3 },
      { slot: 12, hand: L, grace: [{ hand: R }, { hand: R }] }, { slot: 13, hand: R }, { slot: 14, hand: L },
      { slot: 15, hand: R, accent: true, duration: 3 },
    ] },

  /* 40 — Triple Ratamacue */
  { id: "triple-ratamacue", name: "Triple Ratamacue", pas: 40, family: "Drag",
    level: "Advanced", cycleBeats: 4, slotsPerBeat: 6, subdivision: "Two dragged eighths, triplet, accent",
    tempo: { defaultBpm: 60, suggestedLo: 46, suggestedHi: 100 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "The single ratamacue with two extra drags in front: drag-R drag-R, then drag-R L R resolving onto the accent. Keep all three drags even and the same weight.",
    aliases: ["triple rat"],
    strokes: [
      { slot: 0, hand: R, grace: [{ hand: L }, { hand: L }], duration: 3 },
      { slot: 3, hand: R, grace: [{ hand: L }, { hand: L }], duration: 3 },
      { slot: 6, hand: R, grace: [{ hand: L }, { hand: L }] }, { slot: 7, hand: L }, { slot: 8, hand: R },
      { slot: 9, hand: L, accent: true, duration: 3 },
      { slot: 12, hand: L, grace: [{ hand: R }, { hand: R }], duration: 3 },
      { slot: 15, hand: L, grace: [{ hand: R }, { hand: R }], duration: 3 },
      { slot: 18, hand: L, grace: [{ hand: R }, { hand: R }] }, { slot: 19, hand: R }, { slot: 20, hand: L },
      { slot: 21, hand: R, accent: true, duration: 3 },
    ] },

];

var RUDIMENT_MAP = {};
for (var i = 0; i < RUDIMENTS.length; i++) RUDIMENT_MAP[RUDIMENTS[i].id] = RUDIMENTS[i];

// The registry is the single source of truth — freeze it so no transform or UI
// code can mutate a definition (leading-hand changes must copy, never edit).
function deepFreeze(obj) {
  if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) deepFreeze(obj[k]);
  }
  return obj;
}
deepFreeze(RUDIMENTS);
deepFreeze(RUDIMENT_MAP);

var RudimentData = { RUDIMENTS: RUDIMENTS, RUDIMENT_MAP: RUDIMENT_MAP };

if (typeof module !== "undefined" && module.exports) module.exports = RudimentData;
else root.RudimentData = RudimentData;

})(typeof self !== "undefined" ? self : this);
