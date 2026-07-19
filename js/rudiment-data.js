/* Rudiment Builder — rudiment definitions.
   Structured data ONLY: no DOM, no audio, no logic beyond deep-freezing.
   The pattern facts (sticking, accents, grace notes, groupings) follow the
   Percussive Arts Society's 40 International Drum Rudiments; the prose,
   data model, and rendering are original to this app.

   Record shape (validated by RudimentCore.validateRudiment):
     id            stable kebab-case id
     name          display name
     pas           PAS International Drum Rudiment number (reference only)
     family        "Roll" | "Diddle" | "Flam" | "Drag"
     level         instructional level shown to the student
     cycleBeats    beats in one full cycle (covers both halves of the sticking)
     slotsPerBeat  timing grid per beat (4 = sixteenths, 3 = triplet eighths)
     subdivision   human label for that grid
     tempo         { defaultBpm, suggestedLo, suggestedHi }  quarter-note BPM
     leadingHand   "mirror" (left lead = hand-swapped copy) | "fixed"
     teachingNote  one or two sentences of guidance
     heritage      short lineage chip, e.g. "NARD essential 13" — the rudiment's
                   place in N.A.R.D.'s Standard 26 (1933/1936), which the PAS 40
                   International Drum Rudiments (1984) later built on
     counting      one label per grid slot across the whole cycle
     aliases       extra search terms for the future catalog
     strokes       ordered stroke events:
       slot      0-based grid slot within the cycle
       hand      "R" | "L"           (as written, right-hand lead)
       duration  slots occupied (default 1; must stay inside its beat)
       accent    true = accented stroke
       grace     [{hand}] grace notes just before the stroke (1 = flam, 2 = drag)
       diddle    group id — the two strokes of one double share an id
       velocity  optional 0..1 override of the standard tier
       label     optional short caption under the cell

   Classic script (works over file://); exports for Node at the bottom. */
(function (root) {
"use strict";

const RUDIMENTS = [

  /* ---------------- Single Paradiddle — PAS #16 ----------------
     R L R R  L R L L in sixteenths, accent on the first note of each half.
     The diddle hands off the lead automatically every four notes. */
  {
    id: "single-paradiddle",
    name: "Single Paradiddle",
    pas: 16,
    family: "Diddle",
    level: "Beginner",
    cycleBeats: 2,
    slotsPerBeat: 4,
    subdivision: "Sixteenth notes",
    tempo: { defaultBpm: 80, suggestedLo: 60, suggestedHi: 140 },
    leadingHand: "mirror",
    heritage: "NARD standard 26",
    teachingNote:
      "One accent, then let the hand relax — the single strokes and the double should all match in sound. The sticking trades the lead hand every four notes by itself.",
    counting: ["1", "e", "&", "a", "2", "e", "&", "a"],
    aliases: ["paradiddle", "RLRR LRLL"],
    strokes: [
      { slot: 0, hand: "R", accent: true },
      { slot: 1, hand: "L" },
      { slot: 2, hand: "R", diddle: 1 },
      { slot: 3, hand: "R", diddle: 1 },
      { slot: 4, hand: "L", accent: true },
      { slot: 5, hand: "R" },
      { slot: 6, hand: "L", diddle: 2 },
      { slot: 7, hand: "L", diddle: 2 },
    ],
  },

  /* ---------------- Flam Accent — PAS #21 ----------------
     Triplet eighths, one flam on each beat: [l]R L R  [r]L R L.
     The flammed note is the accent; the lead alternates each beat. */
  {
    id: "flam-accent",
    name: "Flam Accent",
    pas: 21,
    family: "Flam",
    level: "Intermediate",
    cycleBeats: 2,
    slotsPerBeat: 3,
    subdivision: "Triplet eighth notes",
    tempo: { defaultBpm: 72, suggestedLo: 50, suggestedHi: 120 },
    leadingHand: "mirror",
    heritage: "NARD essential 13",
    teachingNote:
      "One flam starts each triplet. Keep the grace note low and soft, tucked just ahead of the accented primary stroke, and let the two singles after it stay light.",
    counting: ["1", "trip", "let", "2", "trip", "let"],
    aliases: ["flam accent no. 1"],
    strokes: [
      { slot: 0, hand: "R", accent: true, grace: [{ hand: "L" }] },
      { slot: 1, hand: "L" },
      { slot: 2, hand: "R" },
      { slot: 3, hand: "L", accent: true, grace: [{ hand: "R" }] },
      { slot: 4, hand: "R" },
      { slot: 5, hand: "L" },
    ],
  },

  /* ---------------- Five Stroke Roll — PAS #7 ----------------
     rr ll R  ·  ll rr L — two double strokes into an accented release.
     Encoded the way the PAS card is written: sixteenth-note doubles on the
     beat, the release accent landing on the next beat and ringing through it. */
  {
    id: "five-stroke-roll",
    name: "Five Stroke Roll",
    pas: 7,
    family: "Roll",
    level: "Beginner",
    cycleBeats: 4,
    slotsPerBeat: 4,
    subdivision: "Sixteenth notes",
    tempo: { defaultBpm: 76, suggestedLo: 60, suggestedHi: 132 },
    leadingHand: "mirror",
    heritage: "NARD essential 13",
    teachingNote:
      "Two doubles flow into one accented release on the beat: rr–ll–R. Play the doubles open and even at slow tempos, and let them close up naturally as the tempo rises.",
    counting: ["1", "e", "&", "a", "2", "e", "&", "a", "3", "e", "&", "a", "4", "e", "&", "a"],
    aliases: ["5 stroke roll", "five-stroke"],
    strokes: [
      { slot: 0,  hand: "R", diddle: 1 },
      { slot: 1,  hand: "R", diddle: 1 },
      { slot: 2,  hand: "L", diddle: 2 },
      { slot: 3,  hand: "L", diddle: 2 },
      { slot: 4,  hand: "R", accent: true, duration: 4 },
      { slot: 8,  hand: "L", diddle: 3 },
      { slot: 9,  hand: "L", diddle: 3 },
      { slot: 10, hand: "R", diddle: 4 },
      { slot: 11, hand: "R", diddle: 4 },
      { slot: 12, hand: "L", accent: true, duration: 4 },
    ],
  },

];

const RUDIMENT_MAP = {};
for (const r of RUDIMENTS) RUDIMENT_MAP[r.id] = r;

// The registry is the single source of truth — freeze it so no transform or
// UI code can mutate a definition (leading-hand changes must copy, never edit).
function deepFreeze(obj) {
  if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const k of Object.keys(obj)) deepFreeze(obj[k]);
  }
  return obj;
}
deepFreeze(RUDIMENTS);
deepFreeze(RUDIMENT_MAP);

const RudimentData = { RUDIMENTS, RUDIMENT_MAP };

if (typeof module !== "undefined" && module.exports) module.exports = RudimentData;
else root.RudimentData = RudimentData;

})(typeof self !== "undefined" ? self : this);
