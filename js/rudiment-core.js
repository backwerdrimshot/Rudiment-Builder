/* Rudiment Builder — pure core.
   Validation, leading-hand transformation, stroke expansion, practice-mode
   plans, and the block-level playback-position machine. No DOM, no Web Audio —
   the browser page and the Node tests both load this file.

   Choose the rudiment. See the sticking. Build the hands. Control the tempo.

   Classic script (works over file://); exports for Node at the bottom.
   Layering (mirrors Click Drop / Tempo Ladder):
     0. rudiment-data.js        — frozen rudiment records
     1. validate / withLead     — data checked at boot, lead applied by copy
     2. expandPattern           — strokes -> beat-positioned playable events
     3. buildPlan               — mode + settings -> stage list
     4. createPracticePlayback  — pure position machine (this file)
     5. Web Audio scheduler     — js/rudiment-app.js
     6. timestamped visual queue + DOM — js/rudiment-app.js                  */
(function (root) {
"use strict";

const Data = (typeof module !== "undefined" && module.exports)
  ? require("./rudiment-data.js")
  : root.RudimentData;
if (!Data) throw new Error("rudiment-core.js needs rudiment-data.js loaded first");

/* ---------------- constants ---------------- */
const HANDS = { R: true, L: true };
const FAMILIES = { Roll: true, Diddle: true, Flam: true, Drag: true };
const LEAD_BEHAVIORS = { mirror: true, fixed: true };
const MODES = { fixed: true, ladder: true, oco: true };

// Playback loudness tiers; a stroke's optional `velocity` field overrides.
const VELOCITY = { accent: 1.0, normal: 0.62, grace: 0.2 };

const BPM_MIN = 30, BPM_MAX = 300;
const STEP_MIN = 1, STEP_MAX = 60;
const REPS_MIN = 1, REPS_MAX = 64;

// Count-in and ladder transitions are click-only "listen" blocks of quarter
// notes — one 4/4 measure, matching the rest of the app family.
const COUNT_IN_BEATS = 4;
const TRANSITION_BEATS = 4;

/* ---------------- small helpers ---------------- */
function intIn(v, lo, hi, name) {
  if (!Number.isInteger(v) || v < lo || v > hi)
    throw new Error(name + " must be an integer from " + lo + " to " + hi);
  return v;
}
function mirrorHand(h) { return h === "R" ? "L" : "R"; }

/* ---------------- validation (used at boot and by the tests) ----------------
   Returns an array of human-readable problems; empty = valid. */
function validateRudiment(r) {
  const errs = [];
  if (!r || typeof r !== "object") return ["rudiment is not an object"];
  if (!r.id || typeof r.id !== "string") errs.push("missing id");
  if (!r.name) errs.push("missing name");
  if (!FAMILIES[r.family]) errs.push('unknown family "' + r.family + '"');
  if (!r.level) errs.push("missing level");
  if (!r.subdivision) errs.push("missing subdivision label");
  if (!LEAD_BEHAVIORS[r.leadingHand]) errs.push('leadingHand must be "mirror" or "fixed"');
  if (!r.teachingNote) errs.push("missing teachingNote");

  const gridOk = Number.isInteger(r.cycleBeats) && r.cycleBeats >= 1 &&
                 Number.isInteger(r.slotsPerBeat) && r.slotsPerBeat >= 1;
  if (!gridOk) errs.push("cycleBeats and slotsPerBeat must be positive integers");

  const t = r.tempo;
  if (!t || typeof t !== "object") errs.push("missing tempo range");
  else {
    const nums = ["defaultBpm", "suggestedLo", "suggestedHi"].every(function (k) {
      const ok = Number.isInteger(t[k]) && t[k] >= BPM_MIN && t[k] <= BPM_MAX;
      if (!ok) errs.push("tempo." + k + " must be an integer from " + BPM_MIN + " to " + BPM_MAX);
      return ok;
    });
    if (nums && !(t.suggestedLo <= t.defaultBpm && t.defaultBpm <= t.suggestedHi))
      errs.push("tempo.defaultBpm must sit inside the suggested range");
  }

  if (r.aliases !== undefined &&
      (!Array.isArray(r.aliases) || !r.aliases.every(function (a) { return typeof a === "string"; })))
    errs.push("aliases must be an array of strings");
  if (r.heritage !== undefined && typeof r.heritage !== "string")
    errs.push("heritage must be a string");

  if (!gridOk) return errs; // the checks below all need a sane grid
  const slots = r.cycleBeats * r.slotsPerBeat;

  if (!Array.isArray(r.counting) || r.counting.length !== slots ||
      !r.counting.every(function (c) { return typeof c === "string"; }))
    errs.push("counting must be an array of " + slots + " labels (one per grid slot)");

  if (!Array.isArray(r.strokes) || r.strokes.length === 0) {
    errs.push("strokes must be a non-empty array");
    return errs;
  }

  const diddles = {}; // id -> [{index, slot, duration, hand}]
  let prevEnd = 0;
  r.strokes.forEach(function (s, i) {
    const at = "stroke " + i + ": ";
    if (!s || typeof s !== "object") { errs.push(at + "not an object"); return; }
    if (!HANDS[s.hand]) errs.push(at + 'hand must be "R" or "L"');
    const dur = s.duration === undefined ? 1 : s.duration;
    if (!Number.isInteger(s.slot) || s.slot < 0 || s.slot >= slots)
      errs.push(at + "slot must be an integer from 0 to " + (slots - 1));
    else {
      if (!Number.isInteger(dur) || dur < 1) errs.push(at + "duration must be a positive integer");
      else {
        // Strokes may not overlap and must arrive in time order.
        if (s.slot < prevEnd) errs.push(at + "overlaps or is out of order with the previous stroke");
        // MVP display constraint: a stroke's cell may not cross a beat line.
        if (s.slot % r.slotsPerBeat + dur > r.slotsPerBeat)
          errs.push(at + "duration crosses a beat boundary");
        if (s.slot + dur > slots) errs.push(at + "runs past the end of the cycle");
        prevEnd = s.slot + dur;
      }
    }
    if (s.velocity !== undefined &&
        !(typeof s.velocity === "number" && s.velocity > 0 && s.velocity <= 1))
      errs.push(at + "velocity must be a number in (0, 1]");
    if (s.grace !== undefined) {
      if (!Array.isArray(s.grace) || s.grace.length < 1 || s.grace.length > 2)
        errs.push(at + "grace must be an array of 1 (flam) or 2 (drag) notes");
      else s.grace.forEach(function (g, gi) {
        if (!g || !HANDS[g.hand]) errs.push(at + "grace " + gi + ': hand must be "R" or "L"');
        else if (g.hand === s.hand) errs.push(at + "grace " + gi + " uses the primary hand — a flam/drag grace is the opposite hand");
      });
    }
    if (s.diddle !== undefined) {
      (diddles[s.diddle] = diddles[s.diddle] || []).push({ index: i, slot: s.slot, duration: dur, hand: s.hand });
    }
  });

  Object.keys(diddles).forEach(function (id) {
    const g = diddles[id];
    const at = "diddle group " + id + ": ";
    if (g.length !== 2) { errs.push(at + "must contain exactly 2 strokes, has " + g.length); return; }
    if (g[0].hand !== g[1].hand) errs.push(at + "both strokes must use the same hand");
    if (g[1].slot !== g[0].slot + g[0].duration) errs.push(at + "strokes must be consecutive");
  });

  return errs;
}

// Boot/test gate: throws one Error listing every problem across the registry.
function assertValidRegistry(list) {
  if (!Array.isArray(list) || list.length === 0) throw new Error("rudiment registry is empty");
  const seen = {};
  const all = [];
  list.forEach(function (r) {
    const id = (r && r.id) || "(no id)";
    if (seen[id]) all.push(id + ": duplicate id");
    seen[id] = true;
    validateRudiment(r).forEach(function (e) { all.push(id + ": " + e); });
  });
  if (all.length) throw new Error("Invalid rudiment data:\n" + all.join("\n"));
  return true;
}

/* ---------------- leading hand ----------------
   withLead builds the PLAYABLE PATTERN: a normalized deep copy of the
   definition with the requested lead applied. The source record is frozen and
   is never touched — a left lead of a "mirror" rudiment is a hand-swapped
   copy (primary AND grace hands); a "fixed" rudiment ignores the control. */
function withLead(rudiment, lead) {
  if (lead !== "R" && lead !== "L") throw new Error('lead must be "R" or "L"');
  const mirrored = lead === "L" && rudiment.leadingHand === "mirror";
  const strokes = rudiment.strokes.map(function (s) {
    return {
      slot: s.slot,
      hand: mirrored ? mirrorHand(s.hand) : s.hand,
      duration: s.duration === undefined ? 1 : s.duration,
      accent: !!s.accent,
      velocity: s.velocity,
      label: s.label,
      diddle: s.diddle,
      grace: (s.grace || []).map(function (g) {
        return { hand: mirrored ? mirrorHand(g.hand) : g.hand };
      }),
    };
  });
  return {
    rudimentId: rudiment.id,
    name: rudiment.name,
    lead: lead,
    mirrored: mirrored,
    cycleBeats: rudiment.cycleBeats,
    slotsPerBeat: rudiment.slotsPerBeat,
    counting: rudiment.counting.slice(),
    strokes: strokes,
  };
}

/* ---------------- expansion ----------------
   Pattern -> ordered playable events, positioned in BEATS from the cycle
   start (tempo-free: changing BPM rescales seconds, never this list).
   strokeIndex ties each event back to its visual cell. */
function expandPattern(pattern) {
  return pattern.strokes.map(function (s, i) {
    return {
      kind: "stroke",
      strokeIndex: i,
      beatPos: s.slot / pattern.slotsPerBeat,
      hand: s.hand,
      accent: s.accent,
      velocity: s.velocity !== undefined ? s.velocity
              : s.accent ? VELOCITY.accent : VELOCITY.normal,
      graces: (s.grace || []).map(function (g) {
        return { hand: g.hand, velocity: VELOCITY.grace };
      }),
    };
  });
}

// Screen-reader text for a pattern — one sentence per stroke.
function describePattern(pattern) {
  const words = { R: "Right", L: "Left" };
  return pattern.strokes.map(function (s, i) {
    let d = words[s.hand];
    if (s.grace.length === 1) d += " flam (grace on the " + words[s.grace[0].hand].toLowerCase() + ")";
    if (s.grace.length === 2) d += " drag (two " + words[s.grace[0].hand].toLowerCase() + " grace notes)";
    if (s.accent) d += ", accented";
    if (s.diddle !== undefined) d += ", diddle";
    return "Stroke " + (i + 1) + ": " + d;
  }).join(". ") + ".";
}

/* ---------------- timing helpers (pure) ---------------- */
function beatSeconds(bpm) { return 60 / bpm; }
function cycleSeconds(pattern, bpm) { return pattern.cycleBeats * beatSeconds(bpm); }

// A flam/drag grace leads its primary by a hair: 35 ms, compressing at very
// fast subdivisions so it never swallows the previous grid slot.
function graceLeadSeconds(bpm, slotsPerBeat) {
  const slotSec = beatSeconds(bpm) / slotsPerBeat;
  return Math.min(0.035, slotSec * 0.4);
}
// Absolute times for n grace notes ahead of a primary at time t.
// n=1 (flam): [t - lead] · n=2 (drag): [t - 2*lead, t - lead]
function graceTimes(t, n, lead) {
  const out = [];
  for (let i = n; i >= 1; i--) out.push(t - i * lead);
  return out;
}

/* ---------------- tempo paths ---------------- */
// One-directional ladder: start -> end by step, endpoint hit exactly even off
// the step grid. Direction follows the endpoints; start === end is one rung.
function buildLadderRungs(opts) {
  const start = intIn(opts.startBpm, BPM_MIN, BPM_MAX, "startBpm");
  const end = intIn(opts.endBpm, BPM_MIN, BPM_MAX, "endBpm");
  const step = intIn(opts.stepBpm, STEP_MIN, STEP_MAX, "stepBpm");
  if (start === end) return [start];
  const dir = end > start ? 1 : -1;
  const rungs = [start];
  let v = start;
  while (dir > 0 ? v + step < end : v - step > end) {
    v += dir * step;
    rungs.push(v);
  }
  rungs.push(end); // exact endpoint, exactly once
  return rungs;
}

// Symmetric open-close-open path (same semantics as Tempo Ladder's buildLadder):
// climb from start toward the peak, hit the exact peak once, retrace back down.
function buildOcoRungs(opts) {
  const start = intIn(opts.startBpm, BPM_MIN, BPM_MAX, "startBpm");
  const peak = intIn(opts.peakBpm, BPM_MIN, BPM_MAX, "peakBpm");
  const step = intIn(opts.stepBpm, STEP_MIN, STEP_MAX, "stepBpm");
  if (peak <= start) return [start]; // degenerate but valid single rung
  const ascent = [start];
  let v = start;
  while (v + step < peak) {
    v += step;
    ascent.push(v);
  }
  ascent.push(peak);
  const rungs = ascent.slice();
  for (let i = ascent.length - 2; i >= 0; i--) rungs.push(ascent[i]);
  return rungs;
}

function indexOfPeak(rungs) {
  let idx = 0;
  for (let i = 1; i < rungs.length; i++) if (rungs[i] > rungs[idx]) idx = i;
  return idx;
}

// Open-close-open phases, in roll language: climbing = "closing" (tightening
// toward the peak), apex = "peak", descending = "opening" (back out).
function ocoPhaseAt(i, peakIndex) {
  if (i < peakIndex) return "closing";
  if (i > peakIndex) return "opening";
  return "peak";
}

/* ---------------- buildPlan ----------------
   Resolve a mode + its settings + the pattern's cycle length into the concrete
   stage list the position machine walks. Each stage:

     { kind, bpm, blocks, beatsPerBlock, stepIndex, stepCount, phase }

   kind:
     "count-in"   one 4-beat click-only block at the starting tempo.
     "play"       the student plays `blocks` cycles at bpm (null = endless).
     "transition" ladder only: one 4-beat click-only block BEFORE a new tempo,
                  clicking at the UPCOMING tempo (physical reset + count-in).
   Open-close-open has no transitions — the tempo changes seamlessly at the
   cycle boundary; the final cycle of a stage carries a visual warning
   (derived by the app from isFinalBlockOfStage + nextStage). */
function buildPlan(mode, settings, pattern) {
  if (!MODES[mode]) throw new Error('unknown practice mode "' + mode + '"');
  if (!pattern || !Number.isInteger(pattern.cycleBeats) || pattern.cycleBeats < 1)
    throw new Error("buildPlan needs a pattern from withLead()");
  const cb = pattern.cycleBeats;

  function listen(kind, bpm, stepIndex, stepCount, phase) {
    return { kind: kind, bpm: bpm, blocks: 1,
             beatsPerBlock: kind === "count-in" ? COUNT_IN_BEATS : TRANSITION_BEATS,
             stepIndex: stepIndex, stepCount: stepCount, phase: phase };
  }
  function play(bpm, blocks, stepIndex, stepCount, phase) {
    return { kind: "play", bpm: bpm, blocks: blocks, beatsPerBlock: cb,
             stepIndex: stepIndex, stepCount: stepCount, phase: phase };
  }

  if (mode === "fixed") {
    const bpm = intIn(settings.bpm, BPM_MIN, BPM_MAX, "bpm");
    return { mode: mode, rungs: [bpm], stages: [
      listen("count-in", bpm, 0, 1, "steady"),
      play(bpm, null, 0, 1, "steady"),
    ]};
  }

  const reps = intIn(settings.repsPerStep, REPS_MIN, REPS_MAX, "repsPerStep");

  if (mode === "ladder") {
    const rungs = buildLadderRungs(settings);
    const phase = rungs.length === 1 ? "steady"
                : settings.endBpm > settings.startBpm ? "climbing" : "descending";
    const stages = [listen("count-in", rungs[0], 0, rungs.length, phase)];
    rungs.forEach(function (bpm, i) {
      if (i > 0) stages.push(listen("transition", bpm, i, rungs.length, phase));
      stages.push(play(bpm, reps, i, rungs.length, phase));
    });
    return { mode: mode, rungs: rungs, stages: stages };
  }

  // open-close-open
  const rungs = buildOcoRungs(settings);
  const peakIdx = indexOfPeak(rungs);
  const stages = [listen("count-in", rungs[0], 0, rungs.length, ocoPhaseAt(0, peakIdx))];
  rungs.forEach(function (bpm, i) {
    stages.push(play(bpm, reps, i, rungs.length, ocoPhaseAt(i, peakIdx)));
  });
  return { mode: mode, rungs: rungs, stages: stages };
}

// Total wall-clock seconds of a finite plan (null for endless fixed mode).
function totalSeconds(plan) {
  let sum = 0;
  for (const st of plan.stages) {
    if (st.blocks === null) return null;
    sum += st.blocks * st.beatsPerBlock * beatSeconds(st.bpm);
  }
  return sum;
}

/* ---------------- createPracticePlayback — the position machine ----------------
   Tracks the current stage and the block (cycle) within it. Advances ONLY at
   block boundaries via advanceBlock(). Pure state: the audio scheduler drives
   it ahead of real time; the UI reads snapshots carried on timestamped visual
   events. snapshot()/restore() give pause & resume an exact position to hold.

   Fixed mode extra: requestBpm(n) parks a pending tempo that is applied at the
   NEXT block boundary — a tempo change never lands mid-cycle. */
function createPracticePlayback(plan) {
  if (!plan || !Array.isArray(plan.stages) || plan.stages.length === 0)
    throw new Error("createPracticePlayback needs a plan from buildPlan()");
  const stages = plan.stages.map(function (s) { return Object.assign({}, s); });

  const pb = {
    mode: plan.mode,
    stages: stages,
    stageIndex: 0,
    blockInStage: 0, // 0-based cycle (or listen-block) within the stage
    done: false,
    pendingBpm: null,

    currentStage() { return stages[pb.stageIndex]; },
    nextStage() { return pb.stageIndex + 1 < stages.length ? stages[pb.stageIndex + 1] : null; },
    currentBpm() { return pb.currentStage().bpm; },
    phase() { return pb.currentStage().phase; },
    stepNumber() { return pb.currentStage().stepIndex + 1; },
    stepCount() { return pb.currentStage().stepCount; },
    repNumber() { return pb.blockInStage + 1; },
    repsInStage() { return pb.currentStage().blocks; }, // null = endless

    // True while sitting in a click-only block (count-in or ladder transition).
    isListening() { return pb.currentStage().kind !== "play"; },

    isFinalBlockOfStage() {
      const b = pb.currentStage().blocks;
      return b !== null && pb.blockInStage === b - 1;
    },

    // BPM of the next stage the student PLAYS (skips click-only stages).
    nextPlayedBpm() {
      for (let i = pb.stageIndex + 1; i < stages.length; i++)
        if (stages[i].kind === "play") return stages[i].bpm;
      return null;
    },

    // Fixed mode only: park a tempo to apply at the next block boundary.
    // Returns the pending value (null when it matches the current tempo).
    requestBpm(bpm) {
      if (plan.mode !== "fixed") throw new Error("requestBpm is only available in fixed mode");
      const v = intIn(bpm, BPM_MIN, BPM_MAX, "bpm");
      pb.pendingBpm = v === pb.currentBpm() ? null : v;
      return pb.pendingBpm;
    },

    /* Move exactly one block forward. Returns:
         "advanced" — same stage (next cycle)
         "stage"    — entered a new stage
         "done"     — the plan finished                                     */
    advanceBlock() {
      if (pb.done) return "done";
      pb.blockInStage++;
      let result = "advanced";
      const st = pb.currentStage();
      if (st.blocks !== null && pb.blockInStage >= st.blocks) {
        pb.blockInStage = 0;
        pb.stageIndex++;
        if (pb.stageIndex >= stages.length) {
          pb.done = true;
          pb.stageIndex = stages.length - 1;
          pb.blockInStage = stages[pb.stageIndex].blocks; // park at the end
          return "done";
        }
        result = "stage";
      }
      if (pb.pendingBpm !== null) { // fixed mode: tempo lands ON the boundary
        pb.currentStage().bpm = pb.pendingBpm;
        pb.pendingBpm = null;
      }
      return result;
    },

    // Exact position for pause/resume; done and pendingBpm restore too.
    snapshot() {
      return { stageIndex: pb.stageIndex, blockInStage: pb.blockInStage,
               done: pb.done, pendingBpm: pb.pendingBpm };
    },
    restore(s) {
      pb.stageIndex = s.stageIndex;
      pb.blockInStage = s.blockInStage;
      pb.done = s.done;
      pb.pendingBpm = s.pendingBpm === undefined ? null : s.pendingBpm;
    },

    reset() {
      pb.stageIndex = 0;
      pb.blockInStage = 0;
      pb.done = false;
      pb.pendingBpm = null;
    },
  };
  return pb;
}

/* ---------------- export ---------------- */
const RudimentCore = {
  RUDIMENTS: Data.RUDIMENTS,
  RUDIMENT_MAP: Data.RUDIMENT_MAP,
  FAMILIES: Object.keys(FAMILIES),
  VELOCITY: VELOCITY,
  BPM_MIN: BPM_MIN, BPM_MAX: BPM_MAX,
  STEP_MIN: STEP_MIN, STEP_MAX: STEP_MAX,
  REPS_MIN: REPS_MIN, REPS_MAX: REPS_MAX,
  COUNT_IN_BEATS: COUNT_IN_BEATS, TRANSITION_BEATS: TRANSITION_BEATS,
  validateRudiment: validateRudiment,
  assertValidRegistry: assertValidRegistry,
  withLead: withLead,
  expandPattern: expandPattern,
  describePattern: describePattern,
  beatSeconds: beatSeconds,
  cycleSeconds: cycleSeconds,
  graceLeadSeconds: graceLeadSeconds,
  graceTimes: graceTimes,
  buildLadderRungs: buildLadderRungs,
  buildOcoRungs: buildOcoRungs,
  buildPlan: buildPlan,
  totalSeconds: totalSeconds,
  createPracticePlayback: createPracticePlayback,
};

if (typeof module !== "undefined" && module.exports) module.exports = RudimentCore;
else root.RudimentCore = RudimentCore;

})(typeof self !== "undefined" ? self : this);
