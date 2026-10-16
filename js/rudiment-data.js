/* Rudiment Room — rudiment definitions (all 40 PAS International Drum Rudiments).
   Structured data ONLY: no DOM, no audio. The small builder functions below
   just assemble stroke arrays (measured rolls especially) so long diddle
   sequences are generated correctly instead of hand-typed; the exported
   RUDIMENTS is plain data and is deep-frozen at the bottom.

   Pattern facts (sticking, accents, grace notes, groupings) follow the
   Percussive Arts Society's 40 International Drum Rudiments and standard
   rudimental pedagogy. The data model, prose, and rendering are original.

   ACCURACY NOTE: proofed against the official 1984 PAS International Drum
   Rudiments chart on 2026-08-25 (see REVIEW.md) — 13 hybrids corrected,
   flags cleared where verified. Taylor settled the #2 and #3 rhythms on
   2026-08-29. Re-checked on 2026-09-03 against the per-rudiment SVGs PAS
   published in May 2026 (pas.org/rudiment/<n>-<slug>/), which settled #8
   and shortened #1. **No "// REVIEW" tags remain.**

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

  /* 1 — Single Stroke Roll */ // verified vs the PAS per-rudiment SVG (PAS-rud-01, published 2026-05): eight thirty-seconds, one beamed group per lead
  { id: "single-stroke-roll", name: "Single Stroke Roll", pas: 1, family: "Roll",
    level: "Beginner", cycleBeats: 1, slotsPerBeat: 8, subdivision: "Thirty-second notes",
    tempo: { defaultBpm: 90, suggestedLo: 60, suggestedHi: 160 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "The foundation: even, alternating single strokes. Keep both hands matched in height and sound from slow to fast.",
    breakdown: [
      "Play R L R L slowly, with both sticks at the same height and volume.",
      "Raise the tempo in small steps. Stop at the first tempo where the sound stops being even.",
      "Repeat the exercise starting on the left, so both hands lead equally.",
      "Keep each stroke relaxed and rebounding as the tempo rises.",
    ],
    aliases: ["single stroke", "singles"],
    strokes: [
      { slot: 0, hand: R }, { slot: 1, hand: L }, { slot: 2, hand: R }, { slot: 3, hand: L },
      { slot: 4, hand: R }, { slot: 5, hand: L }, { slot: 6, hand: R }, { slot: 7, hand: L },
    ] },

  /* 2 — Single Stroke Four */ // rhythm chosen by Taylor 2026-08-29: the ratamacue figure — a sixteenth-note triplet into an eighth release, matching the official PAS chart
  { id: "single-stroke-four", name: "Single Stroke Four", pas: 2, family: "Roll",
    level: "Beginner", cycleBeats: 1, slotsPerBeat: 6, subdivision: "Sixteenth-note triplet into an eighth release",
    tempo: { defaultBpm: 80, suggestedLo: 60, suggestedHi: 150 }, leadingHand: "mirror",
    heritage: "PAS addition (1984)",
    teachingNote: "Four single strokes in the ratamacue's rhythm: three quick strokes into a longer fourth. Keep the first three even and let the fourth land.",
    breakdown: [
      "Play R L R evenly across the first half of the beat.",
      "Let the fourth stroke, L, fill the second half of the beat.",
      "Repeat with the lead switched, so the held stroke falls on both hands.",
      "Keep the first three strokes even, then let the fourth sound for its full length.",
    ],
    aliases: ["single stroke 4"],
    strokes: [
      { slot: 0, hand: R }, { slot: 1, hand: L }, { slot: 2, hand: R },
      { slot: 3, duration: 3, hand: L },
    ] },

  /* 3 — Single Stroke Seven */ // rhythm chosen by Taylor 2026-08-29: a sextuplet with a quarter at the end, matching the official PAS chart
  { id: "single-stroke-seven", name: "Single Stroke Seven", pas: 3, family: "Roll",
    level: "Intermediate", cycleBeats: 2, slotsPerBeat: 6, subdivision: "Sextuplet into a quarter",
    tempo: { defaultBpm: 76, suggestedLo: 54, suggestedHi: 144 }, leadingHand: "mirror",
    heritage: "PAS addition (1984)",
    teachingNote: "A sextuplet of six single strokes arriving on a seventh: the run is even, the arrival rings.",
    breakdown: [
      "Play six even singles, R L R L R L, across the first beat.",
      "Hold the seventh stroke, R, for the whole second beat.",
      "Check that the six singles are evenly spaced before you add the held stroke.",
      "Repeat with the lead switched, so the held stroke falls on both hands.",
    ],
    aliases: ["single stroke 7"],
    strokes: [
      { slot: 0, hand: R }, { slot: 1, hand: L }, { slot: 2, hand: R },
      { slot: 3, hand: L }, { slot: 4, hand: R }, { slot: 5, hand: L },
      { slot: 6, duration: 6, hand: R },
    ] },

  /* 4 — Multiple Bounce Roll (buzz) */
  { id: "multiple-bounce-roll", name: "Multiple Bounce Roll", pas: 4, family: "Roll",
    level: "Intermediate", cycleBeats: 2, slotsPerBeat: 2, subdivision: "Buzzed pulses",
    tempo: { defaultBpm: 80, suggestedLo: 50, suggestedHi: 132 }, leadingHand: "mirror",
    heritage: "PAS addition (1984)",
    teachingNote: "Each stroke is a controlled multiple bounce (a buzz), pressed evenly so the sounds overlap into a smooth roll. Sound, not stroke count, is the goal.",
    breakdown: [
      "Press each stroke into a buzz, starting with the right hand, and let each buzz close cleanly.",
      "Alternate R and L on each eighth note, keeping the buzzes even in length.",
      "Listen for one sustained sound rather than counting separate bounces.",
      "At slow tempos, lower the stick height so each buzz stays controlled.",
    ],
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
    breakdown: [
      "Play three even right-hand strokes, R R R, as a triplet.",
      "Switch to the left for three even strokes, L L L.",
      "Let each stroke rebound rather than pushing the next one down.",
      "Repeat at a steady tempo until the triplets match from hand to hand.",
    ],
    aliases: ["triple stroke", "french roll"],
    strokes: [
      { slot: 0, hand: R, group: 1 }, { slot: 1, hand: R, group: 1 }, { slot: 2, hand: R, group: 1 },
      { slot: 3, hand: L, group: 2 }, { slot: 4, hand: L, group: 2 }, { slot: 5, hand: L, group: 2 },
    ] },

  /* 6 — Double Stroke Open Roll (Long Roll) */
  { id: "double-stroke-open-roll", name: "Double Stroke Open Roll", pas: 6, family: "Roll",
    level: "Beginner", cycleBeats: 2, slotsPerBeat: 4, subdivision: "Sixteenth notes",
    tempo: { defaultBpm: 80, suggestedLo: 55, suggestedHi: 150 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "The long roll: clean, even double strokes. Match the two strokes of each hand in height and volume before adding speed.",
    breakdown: [
      "Play one double, R R, with the second stroke rebounding from the first.",
      "Alternate doubles, one per hand: R R L L R R L L.",
      "Match the two strokes in each double in height and volume.",
      "Speed up only when each double sounds like the one before it.",
    ],
    aliases: ["long roll", "open roll", "double stroke roll"],
    strokes: [
      { slot: 0, hand: R, diddle: 1 }, { slot: 1, hand: R, diddle: 1 },
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
    breakdown: [
      "Play two doubles at a steady sixteenth-note pulse: R R, then L L.",
      "Land the accented R on beat two and let it ring to the end of the beat.",
      "Play L L and R R on beat three, then finish beat four with an accented L.",
      "At slow tempos, keep the doubles open and even. Let them close up as the tempo rises.",
    ],
    aliases: ["5 stroke roll", "five-stroke"],
    strokes: [
      { slot: 0,  hand: R, diddle: 1 }, { slot: 1,  hand: R, diddle: 1 },
      { slot: 2,  hand: L, diddle: 2 }, { slot: 3,  hand: L, diddle: 2 },
      { slot: 4,  hand: R, accent: true, duration: 4 },
      { slot: 8,  hand: L, diddle: 3 }, { slot: 9,  hand: L, diddle: 3 },
      { slot: 10, hand: R, diddle: 4 }, { slot: 11, hand: R, diddle: 4 },
      { slot: 12, hand: L, accent: true, duration: 4 },
    ] },

  /* 8 — Six Stroke Roll */ // verified vs the PAS per-rudiment SVG (PAS-rud-08, published 2026-05): strokes and accents match; the chart's 8th–rolled body–8th is the CLOSED form, carried by rudiments/closed/closed-08-six-stroke-roll.svg, not a different rhythm
  { id: "six-stroke-roll", name: "Six Stroke Roll", pas: 8, family: "Roll",
    level: "Intermediate", cycleBeats: 1, slotsPerBeat: 6, subdivision: "Sextuplet",
    tempo: { defaultBpm: 72, suggestedLo: 50, suggestedHi: 132 }, leadingHand: "mirror",
    heritage: "PAS addition (1984)",
    teachingNote: "Accented singles bracket two inner doubles: R–ll–rr–L. A common groove roll; keep the accents strong and the diddles relaxed.",
    breakdown: [
      "Start with an accented R, then play the doubles L L and R R.",
      "End on an accented L, so the pattern closes on the opposite hand.",
      "Keep the accents strong and the doubles relaxed and quieter.",
      "Repeat with the lead switched, so both hands take the accents.",
    ],
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
    breakdown: [
      "Play three doubles, one pair at a time: R R, L L, R R.",
      "Finish with an accented release on the left, falling on the upbeat of beat two.",
      "Count the pattern aloud at a slow tempo until the release lands where you expect.",
      "Play the second half from the left lead, letting each release ring to the end of its beat.",
    ],
    aliases: ["7 stroke roll"],
    strokes: measuredRoll(3) },

  /* 10 — Nine Stroke Roll */
  { id: "nine-stroke-roll", name: "Nine Stroke Roll", pas: 10, family: "Roll",
    level: "Intermediate", cycleBeats: 6, slotsPerBeat: 4, subdivision: "Sixteenth notes",
    tempo: { defaultBpm: 72, suggestedLo: 54, suggestedHi: 132 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "Four doubles into an accented release on the downbeat. A cornerstone roll — even doubles, clean release.",
    breakdown: [
      "Play four doubles, moving between hands after each pair: R R, L L, R R, L L.",
      "Finish with an accented release on the right, on the downbeat of beat three.",
      "Keep the doubles even, and let the release ring to the end of its beat.",
      "Play the second half from the left lead, the same way.",
    ],
    aliases: ["9 stroke roll"],
    strokes: measuredRoll(4) },

  /* 11 — Ten Stroke Roll */ // verified vs the official PAS chart 2026-08-25: four doubles + two accented taps + rest
  { id: "ten-stroke-roll", name: "Ten Stroke Roll", pas: 11, family: "Roll",
    level: "Intermediate", cycleBeats: 3, slotsPerBeat: 4, subdivision: "Sixteenth notes",
    tempo: { defaultBpm: 72, suggestedLo: 54, suggestedHi: 126 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "Four doubles then two accented single taps (R L). Keep the two closing taps clean and even with the roll.",
    breakdown: [
      "Play four doubles: R R L L R R L L, moving between hands after each pair.",
      "Close with two accented single taps, R then L, on the first two sixteenths of beat three.",
      "Rest on the last two sixteenths of beat three before the pattern repeats.",
      "Keep the taps as even as the doubles, so the ending sounds like part of the roll.",
    ],
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
    breakdown: [
      "Play five doubles, one pair at a time: R R, L L, R R, L L, R R.",
      "Finish with an accented release on the left, falling on the upbeat of beat three.",
      "Count the release aloud at a slow tempo. It is easy to land it early or late.",
      "Play the second half from the left lead, with the release on the upbeat again.",
    ],
    aliases: ["11 stroke roll"],
    strokes: measuredRoll(5) },

  /* 13 — Thirteen Stroke Roll */
  { id: "thirteen-stroke-roll", name: "Thirteen Stroke Roll", pas: 13, family: "Roll",
    level: "Advanced", cycleBeats: 8, slotsPerBeat: 4, subdivision: "Sixteenth notes",
    tempo: { defaultBpm: 66, suggestedLo: 50, suggestedHi: 120 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "Six doubles into an accented release on the downbeat. A long roll — hold evenness all the way to the release.",
    breakdown: [
      "Play six doubles, one pair at a time, moving between hands after each pair.",
      "Finish with an accented release on the right, on the downbeat of beat four.",
      "Keep the doubles even all the way to the release. The last doubles are where the sound usually slips.",
      "Play the second half from the left lead, with the same shape.",
    ],
    aliases: ["13 stroke roll"],
    strokes: measuredRoll(6) },

  /* 14 — Fifteen Stroke Roll */
  { id: "fifteen-stroke-roll", name: "Fifteen Stroke Roll", pas: 14, family: "Roll",
    level: "Advanced", cycleBeats: 8, slotsPerBeat: 4, subdivision: "Sixteenth notes",
    tempo: { defaultBpm: 63, suggestedLo: 48, suggestedHi: 112 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "Seven doubles into an accented release on the upbeat. Stamina and evenness are the challenge here.",
    breakdown: [
      "Play seven doubles, moving between hands after each pair.",
      "Finish with an accented release on the left, falling on the upbeat of beat four.",
      "Build stamina in blocks: practice three doubles, then five, then all seven.",
      "Play the second half from the left lead, keeping the same evenness to the release.",
    ],
    aliases: ["15 stroke roll"],
    strokes: measuredRoll(7) },

  /* 15 — Seventeen Stroke Roll */
  { id: "seventeen-stroke-roll", name: "Seventeen Stroke Roll", pas: 15, family: "Roll",
    level: "Advanced", cycleBeats: 10, slotsPerBeat: 4, subdivision: "Sixteenth notes",
    tempo: { defaultBpm: 60, suggestedLo: 48, suggestedHi: 108 }, leadingHand: "mirror",
    heritage: "PAS addition (1984)",
    teachingNote: "Eight doubles into an accented release on the downbeat. The longest measured roll in the set.",
    breakdown: [
      "Play eight doubles, moving between hands after each pair.",
      "Finish with an accented release on the right, on the downbeat of beat five.",
      "Practice in blocks of four doubles to build evenness across the whole run.",
      "Play the second half from the left lead, so both hands carry the release equally.",
    ],
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
    breakdown: [
      "Play R L, then the closing double on the right: R L R R.",
      "Accent the first stroke, and keep the singles and the double at the same volume.",
      "Repeat with the lead switched: L R L L.",
      "Loop the four-note figure and let the lead trade every four notes by itself.",
    ],
    aliases: ["paradiddle", "RLRR LRLL"],
    strokes: paradiddle(2, 4) },

  /* 17 — Double Paradiddle */
  { id: "double-paradiddle", name: "Double Paradiddle", pas: 17, family: "Diddle",
    level: "Intermediate", cycleBeats: 2, slotsPerBeat: 6, subdivision: "Sextuplet",
    tempo: { defaultBpm: 80, suggestedLo: 60, suggestedHi: 132 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "Two pairs of alternating singles before the diddle: RLRLRR. Sits naturally in a triplet or 6/8 feel.",
    breakdown: [
      "Play four alternating singles, R L R L, with the first one accented.",
      "Close with a double on the right: R R.",
      "Repeat with the lead switched: L R L R L L.",
      "Keep the singles even into the closing double, and try the figure in triplets for a 6/8 feel.",
    ],
    aliases: ["double paradiddle", "RLRLRR"],
    strokes: paradiddle(4, 6) },

  /* 18 — Triple Paradiddle */
  { id: "triple-paradiddle", name: "Triple Paradiddle", pas: 18, family: "Diddle",
    level: "Intermediate", cycleBeats: 4, slotsPerBeat: 4, subdivision: "Sixteenth notes",
    tempo: { defaultBpm: 80, suggestedLo: 60, suggestedHi: 126 }, leadingHand: "mirror",
    heritage: "PAS addition (1984)",
    teachingNote: "Three pairs of alternating singles before the diddle: RLRLRLRR. Keep the long run of singles even into the closing double.",
    breakdown: [
      "Play six alternating singles, R L R L R L, with the first one accented.",
      "Close with a double on the right: R R.",
      "Practice the singles alone until they are even, then add the closing double.",
      "Repeat with the lead switched: L R L R L R L L.",
    ],
    aliases: ["triple paradiddle", "RLRLRLRR"],
    strokes: paradiddle(6, 4) },

  /* 19 — Single Paradiddle-diddle */
  { id: "single-paradiddle-diddle", name: "Single Paradiddle-diddle", pas: 19, family: "Diddle",
    level: "Intermediate", cycleBeats: 1, slotsPerBeat: 6, subdivision: "Sextuplet",
    tempo: { defaultBpm: 76, suggestedLo: 54, suggestedHi: 126 }, leadingHand: "mirror",
    heritage: "PAS addition (1984)",
    teachingNote: "One single lead into two diddles: R–L–rr–ll. A favorite drum-set sticking; it keeps the same lead hand each time.",
    breakdown: [
      "Play R and then L as the first two notes of a sextuplet, with the R accented.",
      "Follow with two doubles, on the right and then the left: R R L L.",
      "Keep the doubles relaxed, so the figure feels like one steady groove.",
      "Practice the left lead as the mirror: L R L L R R.",
    ],
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
    breakdown: [
      "Play a soft left grace note just before an accented right.",
      "Keep the grace low and the primary full, so they sound almost as one note.",
      "Alternate hands on each beat: flam R, then flam L.",
      "Practice the left lead alone until both flams match.",
    ],
    aliases: ["flams"],
    strokes: [
      { slot: 0, hand: R, grace: [{ hand: L }] },
      { slot: 1, hand: L, grace: [{ hand: R }] },
    ] },

  /* 21 — Flam Accent */
  { id: "flam-accent", name: "Flam Accent", pas: 21, family: "Flam",
    level: "Beginner", cycleBeats: 2, slotsPerBeat: 3, subdivision: "Triplet eighth notes",
    tempo: { defaultBpm: 72, suggestedLo: 50, suggestedHi: 120 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "One flam starts each triplet. Keep the grace note low and soft, tucked just ahead of the accented primary, and let the two singles after it stay light.",
    breakdown: [
      "Play a flam on the right, with the accent on the right: fR> L R.",
      "Keep the two singles after the flam light, so the flam stays the focus.",
      "Start the next triplet with a flam on the left: fL> R L.",
      "Repeat with the lead switched, so the flam falls on both hands.",
    ],
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
    breakdown: [
      "Play a flam on the right, then a tap on the same hand: fR R.",
      "Let the tap use the rebound of the flam's primary stroke, so it stays light.",
      "Switch to the left: fL L, and repeat on an eighth-note pulse.",
      "Keep the flam soft and the tap relaxed, so each pair sounds as one figure.",
    ],
    aliases: ["flam taps"],
    strokes: [
      { slot: 0, hand: R, accent: true, grace: [{ hand: L }] }, { slot: 1, hand: R },
      { slot: 2, hand: L, accent: true, grace: [{ hand: R }] }, { slot: 3, hand: L },
    ] },

  /* 23 — Flamacue */ // corrected 2026-09-03 vs PAS-rud-23: the chart draws FIVE notes — the closing flam is printed, not left to the next cycle
  { id: "flamacue", name: "Flamacue", pas: 23, family: "Flam",
    level: "Intermediate", cycleBeats: 2, slotsPerBeat: 4, subdivision: "Sixteenth notes into a flammed release",
    tempo: { defaultBpm: 72, suggestedLo: 50, suggestedHi: 120 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "A flam, an accent on the second note, then a flam to close: fR L> R L fR. The inner accent is the character of the rudiment; the closing flam is what makes it a cue.",
    breakdown: [
      "Play a flam on the right, then an accented left on the second note: fR L> R L.",
      "On beat two, play one flammed right stroke that fills the whole beat.",
      "Keep the closing flam soft, so the held stroke carries the cue.",
      "Repeat with the lead switched: fL R> L R, then a flammed left held through beat two.",
    ],
    aliases: ["flam cue"],
    strokes: [
      { slot: 0, hand: R, grace: [{ hand: L }] },
      { slot: 1, hand: L, accent: true },
      { slot: 2, hand: R },
      { slot: 3, hand: L },
      { slot: 4, duration: 4, hand: R, grace: [{ hand: L }] },
    ] },

  /* 24 — Flam Paradiddle */
  { id: "flam-paradiddle", name: "Flam Paradiddle", pas: 24, family: "Flam",
    level: "Intermediate", cycleBeats: 2, slotsPerBeat: 4, subdivision: "Sixteenth notes",
    tempo: { defaultBpm: 76, suggestedLo: 54, suggestedHi: 126 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "A paradiddle whose accented first note is flammed: fR L R R, fL R L L. Flam the lead, keep the diddle relaxed.",
    breakdown: [
      "Start with the flammed accent on the right, then a left and a closing double on the right: fR L R R.",
      "Keep the flam soft and the diddle relaxed, so the flam does not disturb the sticking.",
      "Repeat from the left lead: fL R L L.",
      "Loop the two halves with no gap, so the lead changes each time.",
    ],
    aliases: ["flam paradiddle", "flamadiddle"],
    strokes: [
      { slot: 0, hand: R, accent: true, grace: [{ hand: L }] }, { slot: 1, hand: L },
      { slot: 2, hand: R, diddle: 1 }, { slot: 3, hand: R, diddle: 1 },
      { slot: 4, hand: L, accent: true, grace: [{ hand: R }] }, { slot: 5, hand: R },
      { slot: 6, hand: L, diddle: 2 }, { slot: 7, hand: L, diddle: 2 },
    ] },

  /* 25 — Single Flammed Mill */ // verified vs the official PAS chart 2026-08-25: fRR L R as encoded
  { id: "single-flammed-mill", name: "Single Flammed Mill", pas: 25, family: "Flam",
    level: "Advanced", cycleBeats: 2, slotsPerBeat: 4, subdivision: "Sixteenth notes",
    tempo: { defaultBpm: 72, suggestedLo: 50, suggestedHi: 120 }, leadingHand: "mirror",
    heritage: "PAS addition (1984)",
    teachingNote: "A flammed lead into a diddle, then two singles: fR–rr–L–R. Essentially an inverted flam paradiddle with the diddle up front.",
    breakdown: [
      "Play a flammed accent on the right, followed by a second right stroke: fR> R.",
      "Follow with a left and a right: L R.",
      "Repeat with the left lead, so the flam moves to the other hand: fL> L, then R L.",
      "Keep the second right stroke relaxed, so the flam and the double sound as one gesture.",
    ],
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
    breakdown: [
      "Start with the flammed accent on the right, then a left and a double on the right: fR> L R R.",
      "Add a double on the left: L L.",
      "Keep the flams soft and the diddles relaxed, so the figure feels like one steady groove.",
      "Repeat from the left lead: fL> R L L, then R R.",
    ],
    aliases: ["flam paradiddle diddle", "flamadiddle-diddle"],
    strokes: [
      { slot: 0, hand: R, accent: true, grace: [{ hand: L }] }, { slot: 1, hand: L },
      { slot: 2, hand: R, diddle: 1 }, { slot: 3, hand: R, diddle: 1 },
      { slot: 4, hand: L, diddle: 2 }, { slot: 5, hand: L, diddle: 2 },
      { slot: 6, hand: L, accent: true, grace: [{ hand: R }] }, { slot: 7, hand: R },
      { slot: 8, hand: L, diddle: 3 }, { slot: 9, hand: L, diddle: 3 },
      { slot: 10, hand: R, diddle: 4 }, { slot: 11, hand: R, diddle: 4 },
    ] },

  /* 27 — Pataflafla */ // verified vs the official PAS chart 2026-08-25: flams and accents on notes 1 and 4 as encoded
  { id: "pataflafla", name: "Pataflafla", pas: 27, family: "Flam",
    level: "Advanced", cycleBeats: 2, slotsPerBeat: 4, subdivision: "Sixteenth notes",
    tempo: { defaultBpm: 66, suggestedLo: 48, suggestedHi: 112 }, leadingHand: "mirror",
    heritage: "PAS addition (1984)",
    teachingNote: "Flams on the outer notes bracket two inner taps, with a back-to-back 'fla-fla' at the turn: fR L R fL fR L R fL.",
    breakdown: [
      "Play a flammed accent on the right, then a left and a right tap: fR> L R.",
      "Finish the group with a flammed accent on the left: fL>.",
      "Let the left flam run straight into the next right flam, the back-to-back fla-fla at the turn.",
      "Repeat the group, then practice it from the left lead.",
    ],
    aliases: ["pataflafla"],
    strokes: [
      { slot: 0, hand: R, accent: true, grace: [{ hand: L }] }, { slot: 1, hand: L }, { slot: 2, hand: R }, { slot: 3, hand: L, accent: true, grace: [{ hand: R }] },
      { slot: 4, hand: R, accent: true, grace: [{ hand: L }] }, { slot: 5, hand: L }, { slot: 6, hand: R }, { slot: 7, hand: L, accent: true, grace: [{ hand: R }] },
    ] },

  /* 28 — Swiss Army Triplet */ // verified vs the official PAS chart 2026-08-25: the same lead repeats every triplet; the mirror is the left-lead practice
  { id: "swiss-army-triplet", name: "Swiss Army Triplet", pas: 28, family: "Flam",
    level: "Advanced", cycleBeats: 1, slotsPerBeat: 3, subdivision: "Triplet eighth notes",
    tempo: { defaultBpm: 72, suggestedLo: 50, suggestedHi: 120 }, leadingHand: "mirror",
    heritage: "PAS addition (1984)",
    teachingNote: "A flam, then the flam hand plays again, then the other hand: fR R L, repeating on the same lead. That repeated lead is what separates it from a flam accent — practice the left lead as the mirror.",
    breakdown: [
      "Play a flam on the right, then the right again: fR> R.",
      "Follow with a left to finish the triplet: L.",
      "Keep the same lead in every triplet, so the flam sets up the whole group.",
      "Practice the left lead as the mirror: fL> L R.",
    ],
    aliases: ["swiss triplet", "swiss army"],
    strokes: [
      { slot: 0, hand: R, accent: true, grace: [{ hand: L }], diddle: 1 }, { slot: 1, hand: R, diddle: 1 }, { slot: 2, hand: L },
    ] },

  /* 29 — Inverted Flam Tap */ // verified vs the official PAS chart 2026-08-25: flam, then the tap on the OPPOSITE hand; the tap then feeds the next flam on its own hand
  { id: "inverted-flam-tap", name: "Inverted Flam Tap", pas: 29, family: "Flam",
    level: "Advanced", cycleBeats: 2, slotsPerBeat: 2, subdivision: "Eighth notes",
    tempo: { defaultBpm: 72, suggestedLo: 50, suggestedHi: 120 }, leadingHand: "mirror",
    heritage: "PAS addition (1984)",
    teachingNote: "A flammed accent, then a tap on the other hand: fR> L fL> R. Each tap turns into the next flam on the same hand — the inverted move a plain flam tap doesn't have.",
    breakdown: [
      "Play an accented right flam: a soft left grace note tucked just before the R.",
      "Tap the left on the second eighth note, and play the next flam on the left right after it.",
      "Finish the cycle with a right tap, which leads straight into the next right flam.",
      "Keep the taps soft so the weight stays on the flams.",
    ],
    aliases: ["inverted flam tap"],
    strokes: [
      { slot: 0, hand: R, accent: true, grace: [{ hand: L }] }, { slot: 1, hand: L },
      { slot: 2, hand: L, accent: true, grace: [{ hand: R }] }, { slot: 3, hand: R },
    ] },

  /* 30 — Flam Drag */ // verified vs the official PAS chart 2026-08-25: the "drag" is two measured sixteenths on the opposite hand, written out
  { id: "flam-drag", name: "Flam Drag", pas: 30, family: "Flam",
    level: "Advanced", cycleBeats: 2, slotsPerBeat: 6, subdivision: "Triplet feel; the drag written out as sixteenths",
    tempo: { defaultBpm: 66, suggestedLo: 48, suggestedHi: 112 }, leadingHand: "mirror",
    heritage: "PAS addition (1984)",
    teachingNote: "A flammed accent, a measured double on the other hand, and a tap back on the lead: fR> L-L R. The middle is a written-out drag — two real sixteenths, not grace notes.",
    breakdown: [
      "Play an accented flam on the right, then two measured sixteenths on the left: fR> L L.",
      "Finish the beat with a right tap that lasts two triplet sixteenths.",
      "Repeat on the left lead: fL> R R, then a left tap.",
      "Keep the two sixteenths even so they read as a drag, not as grace notes.",
    ],
    aliases: ["flam drag"],
    strokes: [
      { slot: 0, duration: 2, hand: R, accent: true, grace: [{ hand: L }] },
      { slot: 2, hand: L, diddle: 1 }, { slot: 3, hand: L, diddle: 1 },
      { slot: 4, duration: 2, hand: R },
      { slot: 6, duration: 2, hand: L, accent: true, grace: [{ hand: R }] },
      { slot: 8, hand: R, diddle: 2 }, { slot: 9, hand: R, diddle: 2 },
      { slot: 10, duration: 2, hand: L },
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
    breakdown: [
      "Play two quick soft grace notes on the left, then the right stroke: ll-R.",
      "Keep the two graces low, even, and close to the primary.",
      "Switch hands: rr-L, with the same shape.",
      "Feel the drag as one figure that lands on the beat, not as separate notes.",
    ],
    aliases: ["ruff", "half drag", "drag ruff"],
    strokes: [
      { slot: 0, hand: R, grace: [{ hand: L }, { hand: L }] },
      { slot: 1, hand: L, grace: [{ hand: R }, { hand: R }] },
    ] },

  /* 32 — Single Drag Tap */ // verified vs the official PAS chart 2026-08-25: the accent is on the TAP, not the dragged note
  { id: "single-drag-tap", name: "Single Drag Tap", pas: 32, family: "Drag",
    level: "Beginner", cycleBeats: 2, slotsPerBeat: 2, subdivision: "Eighth notes",
    tempo: { defaultBpm: 72, suggestedLo: 50, suggestedHi: 120 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "A drag into an accented tap on the other hand: drag-R L>, drag-L R>. The graces stay soft; the weight lands on the tap.",
    breakdown: [
      "Play a drag on the right: two soft left graces into the R.",
      "Follow with an accented left tap on the next eighth note.",
      "Switch hands: a drag on the left, then an accented right tap.",
      "Keep the graces soft, so the weight lands on the tap.",
    ],
    aliases: ["single drag"],
    strokes: [
      { slot: 0, hand: R, grace: [{ hand: L }, { hand: L }] }, { slot: 1, hand: L, accent: true },
      { slot: 2, hand: L, grace: [{ hand: R }, { hand: R }] }, { slot: 3, hand: R, accent: true },
    ] },

  /* 33 — Double Drag Tap */ // verified vs the official PAS chart 2026-08-25: both drags on the SAME hand, then the accented tap opposite
  { id: "double-drag-tap", name: "Double Drag Tap", pas: 33, family: "Drag",
    level: "Intermediate", cycleBeats: 2, slotsPerBeat: 3, subdivision: "Triplet eighth notes",
    tempo: { defaultBpm: 66, suggestedLo: 48, suggestedHi: 112 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "Two drags on the same hand, then an accented tap on the other: drag-R drag-R L>. Keep the two drags even before the accent lands.",
    breakdown: [
      "Play a drag on the right, then a second drag on the right: drag-R drag-R.",
      "Land an accented left tap on the third triplet note.",
      "Switch hands: drag-L drag-L, then an accented right tap.",
      "Keep the two drags even before the accent lands.",
    ],
    aliases: ["double drag"],
    strokes: [
      { slot: 0, hand: R, grace: [{ hand: L }, { hand: L }] }, { slot: 1, hand: R, grace: [{ hand: L }, { hand: L }] }, { slot: 2, hand: L, accent: true },
      { slot: 3, hand: L, grace: [{ hand: R }, { hand: R }] }, { slot: 4, hand: L, grace: [{ hand: R }, { hand: R }] }, { slot: 5, hand: R, accent: true },
    ] },

  /* 34 — Lesson 25 */ // verified vs the official PAS chart 2026-08-25: sixteenths with the accent on the FINAL stroke; the lead repeats
  { id: "lesson-25", name: "Lesson 25", pas: 34, family: "Drag",
    level: "Intermediate", cycleBeats: 1, slotsPerBeat: 4, subdivision: "Sixteenth notes",
    tempo: { defaultBpm: 72, suggestedLo: 50, suggestedHi: 120 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "A drag, a tap, then an accented stroke back on the lead: drag-R L R>. The same lead repeats each cycle — practice the left lead as the mirror.",
    breakdown: [
      "Play the drag on the right: two soft left graces into the R.",
      "Follow with a tap on the left.",
      "Finish with an accented right that fills the second half of the beat.",
      "Practice the left lead as the mirror, with the same shape.",
    ],
    aliases: ["lesson twenty-five", "single drag tap no. 2"],
    strokes: [
      { slot: 0, hand: R, grace: [{ hand: L }, { hand: L }] }, { slot: 1, hand: L }, { slot: 2, duration: 2, hand: R, accent: true },
    ] },

  /* 35 — Single Dragadiddle */ // verified vs the official PAS chart 2026-08-25: a paradiddle whose first stroke is a measured same-hand diddle (no grace notes)
  { id: "single-dragadiddle", name: "Single Dragadiddle", pas: 35, family: "Drag",
    level: "Intermediate", cycleBeats: 2, slotsPerBeat: 8, subdivision: "Sixteenth notes; the diddled lead written as thirty-seconds",
    tempo: { defaultBpm: 68, suggestedLo: 48, suggestedHi: 112 }, leadingHand: "mirror",
    heritage: "PAS addition (1984)",
    teachingNote: "A paradiddle where the first stroke is played as a same-hand double: RR> L R R, LL> R L L. The \"drag\" is a measured diddle on the lead, not grace notes.",
    breakdown: [
      "Play the first double on the right in thirty-second notes, accenting the first: R> R.",
      "Continue with a sixteenth left, then two sixteenth rights: L R R.",
      "Play the second half from the left lead: LL> R L L, with the opening double in thirty-seconds.",
      "Keep the opening double quick and light, so the figure reads as one drag.",
    ],
    aliases: ["dragadiddle"],
    strokes: [
      { slot: 0, hand: R, accent: true, diddle: 1 }, { slot: 1, hand: R, diddle: 1 },
      { slot: 2, duration: 2, hand: L },
      { slot: 4, duration: 2, hand: R, diddle: 2 }, { slot: 6, duration: 2, hand: R, diddle: 2 },
      { slot: 8, hand: L, accent: true, diddle: 3 }, { slot: 9, hand: L, diddle: 3 },
      { slot: 10, duration: 2, hand: R },
      { slot: 12, duration: 2, hand: L, diddle: 4 }, { slot: 14, duration: 2, hand: L, diddle: 4 },
    ] },

  /* 36 — Drag Paradiddle #1 */ // verified vs the official PAS chart 2026-08-25: an accented single FIRST, then a dragged paradiddle on the same hand
  { id: "drag-paradiddle-1", name: "Drag Paradiddle #1", pas: 36, family: "Drag",
    level: "Advanced", cycleBeats: 2, slotsPerBeat: 6, subdivision: "An eighth, then sixteenths (compound feel)",
    tempo: { defaultBpm: 66, suggestedLo: 48, suggestedHi: 112 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "An accented single, then a paradiddle whose first note carries the drag: R> drag-R L R R. The accent belongs to the single, not the dragged note.",
    breakdown: [
      "Play an accented right that lasts a third of the beat: R>.",
      "Add a drag on the right, then a left and a right double: drag-R L R R.",
      "Continue with an accented left, then a drag on the left and a right: L> drag-L R.",
      "Close with a left double: L L. Repeat with the lead switched, so both hands carry the accents.",
    ],
    aliases: ["drag paradiddle 1", "drag paradiddle one"],
    strokes: [
      { slot: 0, duration: 2, hand: R, accent: true },
      { slot: 2, hand: R, grace: [{ hand: L }, { hand: L }] }, { slot: 3, hand: L },
      { slot: 4, hand: R, diddle: 1 }, { slot: 5, hand: R, diddle: 1 },
      { slot: 6, duration: 2, hand: L, accent: true },
      { slot: 8, hand: L, grace: [{ hand: R }, { hand: R }] }, { slot: 9, hand: R },
      { slot: 10, hand: L, diddle: 2 }, { slot: 11, hand: L, diddle: 2 },
    ] },

  /* 37 — Drag Paradiddle #2 */ // verified vs the official PAS chart 2026-08-25: accented single, TWO same-hand dragged strokes, then the paradiddle tail
  { id: "drag-paradiddle-2", name: "Drag Paradiddle #2", pas: 37, family: "Drag",
    level: "Advanced", cycleBeats: 4, slotsPerBeat: 4, subdivision: "Eighths into sixteenths",
    tempo: { defaultBpm: 63, suggestedLo: 46, suggestedHi: 108 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "An accented single, two dragged strokes on the same hand, then the paradiddle finishes: R> drag-R drag-R L R R. Both drags sit on the lead hand.",
    breakdown: [
      "Play an accented right, then two dragged strokes on the right: R> drag-R drag-R.",
      "Follow with a left, then a right double: L RR.",
      "Play an accented left, then two dragged strokes on the left: L> drag-L drag-L.",
      "Close with a single right, then a left double: R LL.",
    ],
    aliases: ["drag paradiddle 2", "drag paradiddle two"],
    strokes: [
      { slot: 0, duration: 2, hand: R, accent: true },
      { slot: 2, duration: 2, hand: R, grace: [{ hand: L }, { hand: L }] },
      { slot: 4, hand: R, grace: [{ hand: L }, { hand: L }] }, { slot: 5, hand: L },
      { slot: 6, hand: R, diddle: 1 }, { slot: 7, hand: R, diddle: 1 },
      { slot: 8, duration: 2, hand: L, accent: true },
      { slot: 10, duration: 2, hand: L, grace: [{ hand: R }, { hand: R }] },
      { slot: 12, hand: L, grace: [{ hand: R }, { hand: R }] }, { slot: 13, hand: R },
      { slot: 14, hand: L, diddle: 2 }, { slot: 15, hand: L, diddle: 2 },
    ] },

  /* 38 — Single Ratamacue */ // verified vs the official PAS chart 2026-08-25: dragged triplet plus a 4th note — the accented release
  { id: "single-ratamacue", name: "Single Ratamacue", pas: 38, family: "Drag",
    level: "Intermediate", cycleBeats: 2, slotsPerBeat: 6, subdivision: "Sixteenth-note triplet into an eighth release",
    tempo: { defaultBpm: 66, suggestedLo: 48, suggestedHi: 112 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "A dragged sixteenth triplet resolving to an accented release on the other hand: drag-R L R L>. Four strokes — the accent is the \"cue\".",
    breakdown: [
      "Play a drag on the right, then a left and a right: drag-R L R.",
      "Finish with an accented left that lasts an eighth note: L>.",
      "Switch hands: drag-L R L, then an accented right held for an eighth note.",
      "Keep the drag soft, so the accent carries the figure.",
    ],
    aliases: ["ratamacue", "single rat"],
    strokes: [
      { slot: 0, hand: R, grace: [{ hand: L }, { hand: L }] }, { slot: 1, hand: L }, { slot: 2, hand: R },
      { slot: 3, duration: 3, hand: L, accent: true },
      { slot: 6, hand: L, grace: [{ hand: R }, { hand: R }] }, { slot: 7, hand: R }, { slot: 8, hand: L },
      { slot: 9, duration: 3, hand: R, accent: true },
    ] },

  /* 39 — Double Ratamacue */ // verified vs the official PAS chart 2026-08-25: a dragged eighth, then the full single-ratamacue figure — five strokes
  { id: "double-ratamacue", name: "Double Ratamacue", pas: 39, family: "Drag",
    level: "Advanced", cycleBeats: 3, slotsPerBeat: 6, subdivision: "A dragged eighth, then triplet sixteenths into the release",
    tempo: { defaultBpm: 60, suggestedLo: 46, suggestedHi: 104 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "A dragged eighth, then the ratamacue: drag-R drag-R L R L>. Both drags on the lead hand; the accent still lands on the release.",
    breakdown: [
      "Play a dragged right on an eighth note, then a second drag on the right: drag-R drag-R.",
      "Continue with a left and a right in triplet sixteenths, then an accented left on an eighth note: L R L>.",
      "Play the second half from the left lead: drag-L drag-L R L R>.",
      "Keep the drags on each lead hand even before the accent lands.",
    ],
    aliases: ["double rat"],
    strokes: [
      { slot: 0, duration: 3, hand: R, grace: [{ hand: L }, { hand: L }] },
      { slot: 3, hand: R, grace: [{ hand: L }, { hand: L }] }, { slot: 4, hand: L }, { slot: 5, hand: R },
      { slot: 6, duration: 3, hand: L, accent: true },
      { slot: 9, duration: 3, hand: L, grace: [{ hand: R }, { hand: R }] },
      { slot: 12, hand: L, grace: [{ hand: R }, { hand: R }] }, { slot: 13, hand: R }, { slot: 14, hand: L },
      { slot: 15, duration: 3, hand: R, accent: true },
    ] },

  /* 40 — Triple Ratamacue */ // verified vs the official PAS chart 2026-08-25: two dragged eighths, then the single-ratamacue figure — six strokes, accent on the release
  { id: "triple-ratamacue", name: "Triple Ratamacue", pas: 40, family: "Drag",
    level: "Advanced", cycleBeats: 4, slotsPerBeat: 6, subdivision: "Two dragged eighths, then triplet sixteenths into the release",
    tempo: { defaultBpm: 60, suggestedLo: 46, suggestedHi: 100 }, leadingHand: "mirror",
    heritage: "NARD Standard 26",
    teachingNote: "Two dragged eighths, then the ratamacue: drag-R drag-R drag-R L R L>. All three drags on the lead hand, one accent at the very end.",
    breakdown: [
      "Play three dragged strokes on the right: two eighth notes, then a triplet sixteenth.",
      "Continue with a left and a right, then an accented left on an eighth note: L R L>.",
      "Play the second half from the left lead, with three dragged strokes on the left and an accented right at the end.",
      "Keep the three drags even before the accent lands, and let the release be the cue.",
    ],
    aliases: ["triple rat"],
    strokes: [
      { slot: 0, duration: 3, hand: R, grace: [{ hand: L }, { hand: L }] },
      { slot: 3, duration: 3, hand: R, grace: [{ hand: L }, { hand: L }] },
      { slot: 6, hand: R, grace: [{ hand: L }, { hand: L }] }, { slot: 7, hand: L }, { slot: 8, hand: R },
      { slot: 9, duration: 3, hand: L, accent: true },
      { slot: 12, duration: 3, hand: L, grace: [{ hand: R }, { hand: R }] },
      { slot: 15, duration: 3, hand: L, grace: [{ hand: R }, { hand: R }] },
      { slot: 18, hand: L, grace: [{ hand: R }, { hand: R }] }, { slot: 19, hand: R }, { slot: 20, hand: L },
      { slot: 21, duration: 3, hand: R, accent: true },
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
