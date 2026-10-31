"use strict";
/* Rudiment Room — audio scheduler + UI on top of RudimentCore.
   The lookahead scheduler, listen voice, pause-by-suspend, and visual queue
   are adapted from Click Drop / Pulse Pocket. Layer boundaries:
     Core       — data, withLead, expandPattern, buildPlan, playback machine
     scheduler  — schedules strokes on the AudioContext timeline (truth)
     visual Q   — timestamped events flushed at hear-time
     DOM render — renderNow()/highlight only                                  */
var Core = window.RudimentCore;

var $ = function (id) { return document.getElementById(id); };
function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }

/* ---------------- settings ---------------- */
var DEFAULTS = {
  rudimentId: "single-paradiddle",
  lead: "R",
  mode: "fixed",
  cue: true,
  pulse: false,
  muted: false,
  sound: "marching",
  turn: 0,
  dynamics: "full",
  bpm: 80,
  ladder: { startBpm: 60, endBpm: 100, stepBpm: 5, repsPerStep: 4 },
  oco: { startBpm: 60, peakBpm: 100, stepBpm: 5, repsPerStep: 2 },
  build: { bpm: 70, repsPerStep: 4 },
};
var settings = JSON.parse(JSON.stringify(DEFAULTS));

/* ---------------- audio ---------------- */
var audio = null, master = null, canPan = false;
function initAudio() {
  if (audio) return;
  // iOS: let Web Audio play with the ring/silent switch on (Safari 16.4+; ignored elsewhere).
  try { navigator.audioSession.type = "playback"; } catch (e) { /* not supported */ }
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) throw new Error("no-audio");
  audio = new AC();
  canPan = typeof audio.createStereoPanner === "function";
  master = audio.createGain();
  master.gain.value = masterLevel();
  master.connect(audio.destination);
  // iOS/Android may suspend the context when the tab hides mid-play. Reflect
  // that as a real pause so the UI stays honest and Resume works. A suspend
  // that lands while the page is VISIBLE is either our own pause's statechange
  // arriving late (after a rapid pause→reset→start) or an OS audio blip — try
  // to pull the context back first, and only pause if it will not run.
  audio.addEventListener("statechange", function () {
    if (live.status !== "playing" || (audio.state !== "suspended" && audio.state !== "interrupted")) return;
    if (!document.hidden) {
      audio.resume().catch(function () {});
      setTimeout(function () {
        if (live.status === "playing" && audio.state !== "running") externalPause();
      }, 250);
      return;
    }
    externalPause();
  });
}
// The context was suspended out from under us (backgrounded tab, OS audio
// interruption) — book-keep it as a real pause so Resume works.
function externalPause() {
  teardownTimers();
  releaseWakeLock();
  live.status = "paused";
  updateStartBtn();
  setStatus("Paused — press Resume to pick up where you left off.");
}

// Orphan anything already scheduled (used by stop/reset — a suspended context
// would otherwise replay pending strokes on the next start).
function killPending() {
  if (!master) return;
  master.disconnect();
  master = audio.createGain();
  master.gain.value = masterLevel();
  master.connect(audio.destination);
}

/* Mute = visual-only practice: the scheduler, highlight, pips, and status all
   keep running; only the master gain drops. Never carried by share links — a
   shared drill must not arrive silent. */
function masterLevel() { return settings.muted ? 0 : 0.9; }
function toggleMute() {
  settings.muted = !settings.muted;
  persistSettings();
  if (master && audio) {
    if (audio.state === "running") master.gain.setTargetAtTime(masterLevel(), audio.currentTime, 0.015);
    else master.gain.value = masterLevel();
  }
  updateMuteBtn();
}
function updateMuteBtn() {
  var b = $("btnMute");
  b.setAttribute("aria-pressed", settings.muted ? "true" : "false");
  b.textContent = settings.muted ? "Muted" : "Sound on";
  b.classList.toggle("muted", settings.muted);
}

/* Stroke voices. Every stroke goes through playStroke, which picks the voice
   the student chose. Marching plays a recorded buzz stroke for a buzz; the two
   synthesized voices turn it into its bounces (Core.buzzBounces) — before
   that, a buzz sounded as one plain stroke. Loudness always comes from the
   core's velocity tiers (accent > normal > grace); count-in/transition blocks
   keep the family's soft sine "listen" voice whatever the setting, so the
   student HEARS "don't play yet". A voice change is picked up by the next
   stroke scheduled, so it never needs to stop playback. */
function playStroke(time, hand, velocity, accent, buzzSeconds) {
  if (settings.sound === "marching" && marchingBuffers()) {
    marchingHit(time, hand, velocity, buzzSeconds);
    return;
  }
  var hit = settings.sound === "tones" ? toneHit : snareHit;
  if (!buzzSeconds) { hit(time, hand, velocity, accent); return; }
  Core.buzzBounces(time, buzzSeconds, velocity).forEach(function (b, i) {
    hit(b.t, hand, b.velocity, accent && i === 0);
  });
}
// One output per stroke, panned toward the playing hand; each sounding part
// of the stroke feeds it through its own enveloped gain.
function handOutput(pan) {
  if (!canPan) return master;
  var p = audio.createStereoPanner();
  p.pan.value = pan;
  p.connect(master);
  return p;
}
function envGain(dest, time, peak, dur) {
  var g = audio.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), time + 0.0015);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  g.connect(dest);
  return g;
}

/* Tones: right and left take different pitches and a gentle opposite pan, so
   the sticking can be heard as well as seen; accents are brighter (square). */
var TONE_VOICE = {
  R: { f: 784, pan: 0.28 },   // G5, nudged right
  L: { f: 587, pan: -0.28 },  // D5, nudged left
};
function toneHit(time, hand, velocity, accent) {
  var v = TONE_VOICE[hand];
  var osc = audio.createOscillator();
  osc.frequency.value = v.f;
  osc.type = accent ? "square" : "triangle";
  var d = accent ? 0.07 : 0.05;
  osc.connect(envGain(handOutput(v.pan), time, 0.9 * velocity, d));
  osc.start(time);
  osc.stop(time + d + 0.02);
}

/* Snare: synthesized, no sample files. A short pitched thump for the head,
   high-passed noise for the wires, and a stick crack on top. Louder strokes
   also open the wires brighter and let them ring longer, which is most of
   what makes an accent sound like one. Both hands sound like the same drum;
   they differ only by a gentle pan and a whisker of tuning. */
var SNARE_VOICE = {
  R: { head: 196, pan: 0.2 },
  L: { head: 188, pan: -0.2 },
};
var noiseBuf = null;
function noiseBuffer() {
  if (!noiseBuf) {
    noiseBuf = audio.createBuffer(1, Math.floor(audio.sampleRate * 0.6), audio.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}
function noiseBurst(time, dur, filters, out) {
  var src = audio.createBufferSource();
  src.buffer = noiseBuffer();
  var node = src;
  filters.forEach(function (f) {
    var bq = audio.createBiquadFilter();
    bq.type = f[0]; bq.frequency.value = f[1];
    if (f[2]) bq.Q.value = f[2];
    node.connect(bq);
    node = bq;
  });
  node.connect(out);
  src.start(time, Math.random() * 0.3); // a different stretch of noise each hit
  src.stop(time + dur + 0.02);
}
function snareHit(time, hand, velocity) {
  var v = SNARE_VOICE[hand];
  var out = handOutput(v.pan);
  var ring = 0.07 + 0.16 * velocity;          // grace ~0.1 s, accent ~0.23 s
  noiseBurst(time, ring, [["highpass", 1800], ["lowpass", 2500 + 8000 * velocity]],
    envGain(out, time, 0.5 * velocity, ring));
  noiseBurst(time, 0.012, [["bandpass", 5000, 0.8]],
    envGain(out, time, 0.35 * velocity * velocity, 0.012));

  var head = audio.createOscillator();
  head.type = "triangle";
  head.frequency.setValueAtTime(v.head * 1.5, time);
  head.frequency.exponentialRampToValueAtTime(v.head, time + 0.025);
  head.connect(envGain(out, time, 0.42 * velocity, 0.05 + 0.05 * velocity));
  head.start(time);
  head.stop(time + 0.12);
}
/* Marching: MuseScore Drumline's recorded solo snare (CC0; the credit ships in
   assets/audio). The takes arrive as PCM inside a classic script, so they load
   from disk as well as from the site, and only once Marching is chosen. Until
   they have loaded — or if they never do — a Marching stroke is played by the
   synth snare rather than dropped.

   Each hand has two takes of a stroke and alternates between them, so a run of
   single strokes never repeats one recording back to back. Softer strokes are
   darker as well as quieter, the way a stick from a lower height sounds; an
   accent is the recording as made. A buzz is MDL's own buzz stroke (a "crush"):
   the tight one while the note is short, the longer, open one once it is long
   enough that the tight one would die away before the next stroke. Either is
   cut off where the written note ends, so buzzes join into a roll rather than
   piling up. */
var MARCHING_SRC = "assets/audio/marching-snare.js";
var MARCHING = {
  pan: { R: 0.2, L: -0.2 },
  level: 0.9,       // near the synth snare by RMS, with headroom: recorded accents peak harder
  curve: 1.3,       // gain = velocity^curve: normal ~-5 dB, grace ~-18 dB under an accent
  longBuzz: 0.15,   // seconds; a buzz this long or longer takes the open crush
  buzzLift: 1.5,    // MDL records a crush softer than a hit; +3.5 dB sits a roll with the strokes around it
  release: 0.03,
};
var marchingState = "none", marchingBufs = null, marchingTurn = { R: 0, L: 0 }, marchingPreview = false;
// A load that failed is tried again the next time Marching is chosen.
function loadMarching() {
  if (marchingState === "loading" || marchingState === "ready") return;
  marchingState = "loading";
  var s = document.createElement("script");
  s.src = MARCHING_SRC;
  s.onload = function () { marchingSettled(window.RudimentMarchingSnare ? "ready" : "failed"); };
  s.onerror = function () { marchingSettled("failed"); };
  document.head.appendChild(s);
}
function marchingSettled(state) {
  var preview = marchingPreview;
  marchingState = state;
  marchingPreview = false;
  if (settings.sound !== "marching") return;
  $("soundHint").textContent = soundHint("marching");
  if (preview) previewVoice();
}
// Built on first use, once an AudioContext exists; null until the takes load.
function marchingBuffers() {
  if (marchingBufs) return marchingBufs;
  if (marchingState !== "ready" || !audio) return null;
  var data = window.RudimentMarchingSnare;
  var take = function (b64) {
    var bin = atob(b64), n = bin.length >> 1;
    var buf = audio.createBuffer(1, n, data.rate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) {
      var v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); // little-endian
      d[i] = (v >= 0x8000 ? v - 0x10000 : v) / 32768;
    }
    return buf;
  };
  marchingBufs = { hit: data.hit.map(take), crush: data.crush.map(take), crushLong: data.crushLong.map(take), gain: data.gain };
  return marchingBufs;
}
function marchingHit(time, hand, velocity, buzzSeconds) {
  var bufs = marchingBufs;
  var set = !buzzSeconds ? bufs.hit : buzzSeconds < MARCHING.longBuzz ? bufs.crush : bufs.crushLong;
  var src = audio.createBufferSource();
  src.buffer = set[(hand === "R" ? 0 : 1) + 2 * (marchingTurn[hand]++ % 2)];

  var node = src;
  var cutoff = 3500 * Math.pow(2, (velocity - 0.2) * 3.95); // grace ~3.5 kHz, normal ~11 kHz
  if (cutoff < Math.min(18000, audio.sampleRate / 2)) {
    var lp = audio.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = cutoff; lp.Q.value = 0;
    node.connect(lp);
    node = lp;
  }
  var g = audio.createGain();
  var level = bufs.gain * MARCHING.level * Math.pow(velocity, MARCHING.curve) * (buzzSeconds ? MARCHING.buzzLift : 1);
  g.gain.setValueAtTime(level, time);
  node.connect(g);
  g.connect(handOutput(MARCHING.pan[hand]));
  src.start(time);
  if (buzzSeconds) {
    g.gain.setValueAtTime(level, time + buzzSeconds);
    g.gain.linearRampToValueAtTime(0, time + buzzSeconds + MARCHING.release);
    src.stop(time + buzzSeconds + MARCHING.release + 0.01);
  }
}

// A two-stroke sample of the chosen voice when it is picked while nothing is
// playing. Never while paused: resuming the context to sound it would also
// unfreeze the paused plan.
function previewVoice() {
  if (live.status !== "idle" && live.status !== "complete") return;
  if (settings.sound === "marching" && marchingState === "loading") { marchingPreview = true; return; }
  try { initAudio(); } catch (e) { return; }
  if (audio.state !== "running") audio.resume();
  var t = audio.currentTime + 0.05;
  playStroke(t, "R", Core.VELOCITY.accent, true, 0);
  playStroke(t + 0.22, "L", Core.VELOCITY.normal, false, 0);
}
function listenClick(time, isDown) {
  var s = isDown ? { f: 1319, g: 0.6, d: 0.075 } : { f: 880, g: 0.42, d: 0.05 };
  var osc = audio.createOscillator();
  var g = audio.createGain();
  osc.frequency.value = s.f;
  osc.type = "sine";
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(s.g, time + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, time + s.d);
  osc.connect(g); g.connect(master);
  osc.start(time); osc.stop(time + s.d + 0.02);
}
// Optional soft pulse under played cycles — the family listen voice tucked
// low, so the sticking stays on top and the student never loses the beat
// through rests and ringing releases. Beat one slightly stronger.
function pulseClick(time, isDown) {
  var s = isDown ? { f: 1319, g: 0.3, d: 0.05 } : { f: 880, g: 0.2, d: 0.04 };
  var osc = audio.createOscillator();
  var g = audio.createGain();
  osc.frequency.value = s.f;
  osc.type = "sine";
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(s.g, time + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, time + s.d);
  osc.connect(g); g.connect(master);
  osc.start(time); osc.stop(time + s.d + 0.02);
}
// Optional soft tick on beat one of every played cycle (the cycle-boundary cue).
function cueClick(time) {
  var osc = audio.createOscillator();
  var g = audio.createGain();
  osc.frequency.value = 1568;
  osc.type = "sine";
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(0.22, time + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.035);
  osc.connect(g); g.connect(master);
  osc.start(time); osc.stop(time + 0.06);
}

/* ---------------- screen wake lock ----------------
   A phone on a music stand dims and sleeps mid-rep. Best-effort hold while
   playing; re-acquired on return to the tab. */
var wakeLock = null;
function requestWakeLock() {
  if (!("wakeLock" in navigator) || wakeLock) return;
  navigator.wakeLock.request("screen").then(function (wl) {
    wakeLock = wl;
    wakeLock.addEventListener("release", function () { wakeLock = null; });
  }).catch(function () { /* denied — no problem */ });
}
function releaseWakeLock() {
  if (wakeLock) { wakeLock.release().catch(function () {}); wakeLock = null; }
}

/* ---------------- live playback state ---------------- */
var LOOKAHEAD = 25, AHEAD = 0.12;
var live = {
  status: "idle",   // idle | playing | paused | complete
  playback: null,   // core position machine
  pattern: null,    // current withLead() pattern
  events: null,     // expandPattern(pattern)
  previewPlan: null,
  entries: null,    // current block's schedule [{tBeats, type, ...}]
  entryIndex: 0,
  blockStart: 0,    // AudioContext time of the current block's beat one
  timer: null,
  raf: null,
  visualQ: [],
  doneQueued: false,
  heard: null,      // { bpm, peak } of this run — see noteHeard()
  layerEventsCache: {}, // build-up layer -> events, cleared whenever the pattern is redrawn
  runPlan: null,    // the plan the current run was started from
  lastRoutine: null, // a finished routine: { total, runs } — "Copy practice log" reports it instead
  lastRun: null,    // the finished run "Copy practice log" reports — see finishSession()
};

/* One block's schedule. Listen blocks (count-in / transition) walk quarter
   clicks; play blocks walk the pattern's stroke events plus the optional
   downbeat cue. Rebuilt at every block boundary, so a tempo change or a cue
   toggle lands exactly on the boundary — never mid-cycle.

   Your turn: on the student's cycles the strokes are still walked, but silent
   — they carry the highlight so the student can check themselves — and the
   pulse clicks every beat whatever its toggle says, because nothing else is
   holding the time. */
// The events one stage plays: the written rudiment, or a build-up layer of it.
function layerEvents(layer) {
  if (!layer) return live.events;
  if (!live.layerEventsCache[layer]) live.layerEventsCache[layer] = Core.expandPattern(Core.withLayer(live.pattern, layer));
  return live.layerEventsCache[layer];
}
function buildEntries() {
  var pb = live.playback, st = pb.currentStage();
  var list = [];
  var response = pb.isResponse();
  if (st.kind !== "play") {
    for (var b = 0; b < st.beatsPerBlock; b++) list.push({ tBeats: b, type: "beat", beat: b });
  } else {
    if (settings.pulse || response) {
      // The pulse covers every beat (including the downbeat), so it supersedes
      // the lighter downbeat-only cue.
      for (var p = 0; p < st.beatsPerBlock; p++) list.push({ tBeats: p, type: "pulse", beat: p });
    } else if (settings.cue) {
      list.push({ tBeats: 0, type: "cue" });
    }
    layerEvents(st.layer).forEach(function (e) { list.push({ tBeats: e.beatPos, type: "stroke", ev: e, silent: response }); });
    list.sort(function (a, b) { return a.tBeats - b.tBeats || (a.type !== "stroke" ? -1 : 1); });
  }
  live.entries = list;
  live.entryIndex = 0;
}

/* ---------------- scheduler (lookahead; AudioContext.currentTime is truth) ----------------
   Exact time accumulation: the block start advances by beatsPerBlock exact
   beat lengths, entries sit at beat fractions inside the block — no drift.
   The pure machine advances ONLY at block boundaries, which is the only place
   tempo can change. */
function scheduler() {
  flushVisual();
  if (live.status !== "playing" || !live.playback) return;
  var pb = live.playback;
  for (;;) {
    if (pb.done) {
      if (!live.doneQueued) {
        live.doneQueued = true;
        live.visualQ.push({ t: live.blockStart, done: true });
      }
      return;
    }
    var st = pb.currentStage();
    var beatSec = Core.beatSeconds(st.bpm);
    if (live.entryIndex >= live.entries.length) {
      live.blockStart += st.beatsPerBlock * beatSec; // exact accumulation
      pb.advanceBlock();                              // boundary: stage/tempo may change
      if (!pb.done) buildEntries();
      continue;
    }
    var en = live.entries[live.entryIndex];
    var t = live.blockStart + en.tBeats * beatSec;
    // A stalled page (a hidden tab, a long task) leaves the timeline far behind the audio clock,
    // and scheduling from there would play every missed stroke at once. Begin this block again
    // at the clock instead. Pause suspends the clock, so a paused run never lands here.
    if (t < audio.currentTime - AHEAD) {
      live.blockStart = audio.currentTime + 0.06;
      live.entryIndex = 0;
      live.visualQ = [];
      buildEntries();
      continue;
    }
    if (t >= audio.currentTime + AHEAD) return;
    scheduleEntry(en, t, st, pb);
    live.entryIndex++;
  }
}

function snapshotState(pb, st) {
  var next = pb.nextStage();
  return {
    kind: st.kind, bpm: st.bpm, phase: st.phase,
    step: pb.stepNumber(), stepCount: pb.stepCount(),
    rep: pb.repNumber(), reps: pb.repsInStage(),
    turn: st.turn || 0, turnIndex: pb.turnIndex(), response: pb.isResponse(),
    finalBlock: pb.isFinalBlockOfStage(),
    nextStageBpm: next ? next.bpm : null,
    nextStageKind: next ? next.kind : null,
    nextPlayed: pb.nextPlayedBpm(),
    pendingBpm: pb.pendingBpm,
    beatsInBlock: st.beatsPerBlock,
    layer: st.layer || null, layerLabel: st.layerLabel || null,
    nextLayer: pb.nextLayer(), nextLayerLabel: next && next.layerLabel ? next.layerLabel : null,
  };
}

function scheduleEntry(en, t, st, pb) {
  var snap = snapshotState(pb, st);
  if (en.type === "beat") {
    listenClick(t, en.beat === 0);
    live.visualQ.push(Object.assign({ t: t, type: "beat", beat: en.beat }, snap));
  } else if (en.type === "pulse") {
    pulseClick(t, en.beat === 0);
    // no visual event — the stroke highlights and pips already carry the beat
  } else if (en.type === "cue") {
    cueClick(t);
    // no visual event — the downbeat pip lights from the strokes themselves
  } else if (en.silent) {
    // The student's turn: the highlight moves, nothing sounds.
    live.visualQ.push(Object.assign(
      { t: t, type: "stroke", strokeIndex: en.ev.strokeIndex, beat: Math.floor(en.ev.beatPos) }, snap));
  } else {
    var ev = en.ev;
    var scale = Core.dynamicScale(settings.dynamics, pb); // the core decides how loud this stroke is
    if (ev.graces.length) {
      var lead = Core.graceLeadSeconds(st.bpm, live.pattern.slotsPerBeat);
      Core.graceTimes(t, ev.graces.length, lead).forEach(function (gt, i) {
        playStroke(Math.max(gt, audio.currentTime + 0.001), ev.graces[i].hand, Core.scaleVelocity(ev.graces[i].velocity, scale), false, 0);
      });
    }
    playStroke(t, ev.hand, Core.scaleVelocity(ev.velocity, scale), ev.accent,
      ev.buzz ? ev.lengthBeats * Core.beatSeconds(st.bpm) : 0);
    live.visualQ.push(Object.assign(
      { t: t, type: "stroke", strokeIndex: ev.strokeIndex, beat: Math.floor(ev.beatPos) }, snap));
  }
}

/* ---------------- display sync (hear-time) ----------------
   Flushed from BOTH rAF (smooth when visible) and the scheduler tick (keeps
   the display honest when the tab is throttled). Idempotent. */
function flushVisual() {
  if (live.status !== "playing") return;
  var now = audio.currentTime;
  var ev = null;
  while (live.visualQ.length && live.visualQ[0].t <= now) ev = live.visualQ.shift();
  if (ev) {
    if (ev.done) { finishSession(); return; }
    renderNow(ev);
  }
}
function visualLoop() {
  if (live.status !== "playing") return;
  flushVisual();
  live.raf = requestAnimationFrame(visualLoop);
}

/* ---------------- rendering (DOM only) ---------------- */
var PHASE_LABEL = {
  steady: "Steady tempo",
  climbing: "Climbing",
  descending: "Descending",
  closing: "Closing — building speed",
  peak: "Peak",
  opening: "Opening back up",
  building: "Building it up",
};

var lastStatusHTML = "", lastBannerKey = "";
function setStatus(html) {
  if (routineRun) html = "<strong>Drill " + (routineRun.index + 1) + " of " + routineRun.items.length + "</strong> \u00b7 " + html;
  if (html === lastStatusHTML) return;
  lastStatusHTML = html;
  $("statusLine").innerHTML = html;
}
function setBanner(cls, txt) {
  var key = cls + "|" + txt;
  if (key === lastBannerKey) return;
  lastBannerKey = key;
  var b = $("banner");
  b.className = txt ? "banner " + cls : "banner hidden";
  b.textContent = txt;
}

var cellRefs = [];       // strokeIndex -> cell element
var currentCell = null;
function highlightCell(i) {
  if (currentCell) currentCell.classList.remove("current");
  currentCell = cellRefs[i] || null;
  if (currentCell) currentCell.classList.add("current");
}
function clearCellHighlight() { highlightCell(-1); }

var pipRefs = [], pipCount = -1;
function renderPips(n) {
  if (n === pipCount) return;
  pipCount = n;
  var host = $("beats");
  host.innerHTML = "";
  pipRefs = [];
  for (var i = 0; i < n; i++) {
    var p = el("span", "pip" + (i === 0 ? " one" : ""));
    host.appendChild(p);
    pipRefs.push(p);
  }
}
function lightPip(beat) {
  for (var i = 0; i < pipRefs.length; i++) pipRefs[i].classList.toggle("on", i === beat);
}

function renderNow(ev) {
  $("curBpm").innerHTML = ev.bpm + "<small>BPM</small>";
  var pw = $("phaseWord");
  pw.textContent = ev.layerLabel || PHASE_LABEL[ev.phase] || "";
  if ((ev.layer || null) !== shownLayer) showLayer(ev.layer || null);
  pw.className = "phase-word" + (ev.phase === "peak" ? " peak" : "");

  var nb = ev.pendingBpm != null ? ev.pendingBpm : ev.nextPlayed;
  $("nextBpm").innerHTML = nb != null ? nb + "<small> BPM</small>" : "—";

  renderPips(ev.beatsInBlock);
  lightPip(ev.beat);

  $("sticking").classList.toggle("listening", ev.kind !== "play");
  $("sticking").classList.toggle("your-turn", !!ev.response);
  if (ev.type === "stroke") highlightCell(ev.strokeIndex);
  else clearCellHighlight();
  if (ev.type === "stroke" && ev.kind === "play") noteHeard(ev.bpm);

  if (ev.kind === "count-in") {
    setBanner("countin", "Count-in — " + ev.bpm + " BPM");
    setStatus("Counting in…");
  } else if (ev.kind === "transition") {
    setBanner("listen", "Listen — next tempo: " + ev.bpm + " BPM");
    setStatus("Reset — into step " + ev.step + " of " + ev.stepCount);
  } else {
    var turnWord = !ev.turn ? "" : !ev.response ? "Listen"
                 : "Your turn" + (ev.turn > 1 ? " " + ev.turnIndex + " of " + ev.turn : "");
    if (ev.pendingBpm != null) {
      setBanner("warn", (ev.turn ? "Tempo change when the app next plays → "
                                 : "Tempo change at the next cycle → ") + ev.pendingBpm + " BPM");
    } else if (ev.finalBlock && ev.nextLayer && ev.nextLayer !== ev.layer) {
      setBanner("warn", (ev.turn ? "Next time the app plays → " : "Next cycle → ") + ev.nextLayerLabel);
    } else if (ev.finalBlock && ev.nextStageKind === "play" &&
               ev.nextStageBpm != null && ev.nextStageBpm !== ev.bpm) {
      // Open-close-open changes seamlessly — warn on the final cycle.
      setBanner("warn", "Tempo change next cycle → " + ev.nextStageBpm + " BPM");
    } else if (ev.turn) {
      if (ev.response) setBanner("turn", turnWord + " — play it back");
      else setBanner("listen", "Listen — then play it back");
    } else {
      setBanner("", "");
    }
    setStatus("Rep <strong>" + ev.rep + "</strong>" + (ev.reps ? " of " + ev.reps : "") +
      (ev.stepCount > 1 ? (ev.layer ? " · Layer <strong>" : " · Step <strong>") + ev.step + "</strong> of " + ev.stepCount : "") +
      (turnWord ? " · " + turnWord : ""));
  }
}

/* ---------------- sticking display ---------------- */
var WIDE_STAGE = window.matchMedia("(min-width: 1180px)");
function renderSticking() {
  live.pattern = Core.withLead(Core.RUDIMENT_MAP[settings.rudimentId], settings.lead);
  live.events = Core.expandPattern(live.pattern);
  live.layerEventsCache = {};
  shownLayer = null;
  drawCells(live.pattern);
  $("sticking").classList.remove("listening");
  var p = live.pattern, r = Core.RUDIMENT_MAP[p.rudimentId];
  $("stickName").textContent = p.name;
  $("stickSub").textContent = (p.lead === "R" ? "Right" : "Left") + "-hand lead · " + r.subdivision +
    " · " + p.cycleBeats + "-beat cycle";
  renderNotation(r, p.mirrored);
}
// Draw one build-up layer (or the written rudiment, for null). The strokes are
// the same strokes in the same cells, so the highlight indices still line up.
var shownLayer = null;
function showLayer(layer) {
  if (layer === shownLayer) return;
  shownLayer = layer;
  drawCells(layer ? Core.withLayer(live.pattern, layer) : live.pattern);
}
function drawCells(p) {
  var host = $("sticking");
  var wasListening = host.classList.contains("listening"), wasTurn = host.classList.contains("your-turn");
  host.innerHTML = "";
  host.classList.remove("listening");
  cellRefs = [];
  currentCell = null;

  var spb = p.slotsPerBeat;
  // Rows stay phone-sized (8 slots) unless the stage has the whole wide column, where a
  // 16-slot row keeps a long cycle short enough that the stage fits the window's height.
  var beatsPerRow = Math.max(1, Math.floor((WIDE_STAGE.matches ? 16 : 8) / spb));
  host.style.setProperty("--rows", Math.ceil(p.cycleBeats / beatsPerRow));

  var bySlot = {};
  p.strokes.forEach(function (s, i) { bySlot[s.slot] = { s: s, i: i }; });
  var covered = {}; // slots consumed by a longer stroke's cell
  p.strokes.forEach(function (s) {
    for (var d = 1; d < s.duration; d++) covered[s.slot + d] = true;
  });
  var diddlePos = {}; // strokeIndex -> "a" | "b"
  var groups = {};
  p.strokes.forEach(function (s, i) {
    if (s.diddle !== undefined) (groups[s.diddle] = groups[s.diddle] || []).push(i);
  });
  Object.keys(groups).forEach(function (id) {
    diddlePos[groups[id][0]] = "a";
    diddlePos[groups[id][1]] = "b";
  });

  var row = null;
  for (var beat = 0; beat < p.cycleBeats; beat++) {
    if (beat % beatsPerRow === 0) { row = el("div", "stick-row"); host.appendChild(row); }
    var group = el("div", "beat-group");
    group.style.setProperty("--slots", spb);
    row.appendChild(group);
    var s0, slot;
    for (s0 = 0; s0 < spb; s0++) { // counting row
      slot = beat * spb + s0;
      var c = el("div", "count" + (bySlot[slot] ? " on-stroke" : ""));
      c.textContent = p.counting[slot];
      group.appendChild(c);
    }
    for (s0 = 0; s0 < spb; s0++) { // cell row
      slot = beat * spb + s0;
      if (covered[slot]) continue;
      var hit = bySlot[slot];
      var cell;
      if (!hit) {
        cell = el("div", "cell rest");
        cell.innerHTML = '<span class="acc"></span><span class="face"><span class="letter">·</span></span>';
      } else {
        var st = hit.s;
        cell = el("div", "cell hand-" + st.hand.toLowerCase());
        if (diddlePos[hit.i]) cell.classList.add("diddle-" + diddlePos[hit.i]);
        if (st.duration > 1) cell.style.gridColumn = "span " + st.duration;
        cell.innerHTML =
          '<span class="acc">' + (st.accent ? "&gt;" : "") + "</span>" +
          '<span class="face">' +
            st.grace.map(function (g) { return '<span class="grace">' + g.hand + "</span>"; }).join("") +
            '<span class="letter">' + st.hand + "</span>" +
          "</span>";
        cellRefs[hit.i] = cell;
      }
      group.appendChild(cell);
    }
  }

  var r = Core.RUDIMENT_MAP[p.rudimentId];
  $("stickingDesc").textContent = p.name + ", " + (p.lead === "R" ? "right" : "left") +
    "-hand lead, " + r.subdivision.toLowerCase() + ". " + Core.describePattern(p);
  host.classList.toggle("listening", wasListening);
  host.classList.toggle("your-turn", wasTurn);
}

/* ---------------- notation card ----------------
   The rudiment written out, under the live sticking. Every card is drawn with
   a right-hand lead, so on a left lead the caption says so rather than letting
   the two displays quietly disagree. The card is inlined when it can be
   fetched, so its currentColor fill takes --ink in both schemes; over file://
   fetch is refused and an <img> stands in (see the .notation-card CSS). */
var notationFiles = {};  // path -> Promise<SVGSVGElement | null>, one fetch each
var notationShown = null;

function fetchNotation(file) {
  if (location.protocol === "file:") return Promise.resolve(null); // refused anyway, and logged as an error
  if (!notationFiles[file]) {
    notationFiles[file] = fetch(file).then(function (res) {
      if (!res.ok) throw new Error(file + " " + res.status);
      return res.text();
    }).then(function (text) {
      var svg = new DOMParser().parseFromString(text, "image/svg+xml").documentElement;
      if (svg.namespaceURI !== "http://www.w3.org/2000/svg" || svg.localName !== "svg") throw new Error(file + " is not an SVG");
      return svg;
    }).catch(function () { return null; });
  }
  return notationFiles[file];
}

function renderNotation(r, mirrored) {
  $("notationCap").textContent = mirrored
    ? "As written, right-hand lead — your left lead swaps every R and L."
    : "As written, right-hand lead.";
  var file = Core.notationCard(r);
  if (file === notationShown) return;
  notationShown = file;
  var host = $("notationCard");
  host.textContent = "";
  mountCard(host, file, r.name + " written in notation, right-hand lead", function () { return notationShown === file; });
}
// Draw a notation card into host. `wanted` says whether the answer is still
// wanted when the fetch comes back (another rudiment may have been chosen).
function mountCard(host, file, label, wanted) {
  fetchNotation(file).then(function (source) {
    if (!wanted()) return;
    var card;
    if (source) {
      card = document.importNode(source, true);
      var box = (card.getAttribute("viewBox") || "").split(/[\s,]+/);
      card.removeAttribute("width");
      card.removeAttribute("height");
      card.style.setProperty("--card-w", box[2]);
      card.style.setProperty("--card-h", box[3]);
      card.setAttribute("aria-label", label);
    } else {
      card = el("img");
      card.alt = label;
      card.onload = function () {
        card.style.setProperty("--card-w", card.naturalWidth);
        card.style.setProperty("--card-h", card.naturalHeight);
      };
      card.src = file;
    }
    host.appendChild(card);
  });
}

/* ---------------- rudiment info + cards ----------------
   40 rudiments are grouped by family (PAS order within each) and filtered by
   a search box + family/level chips, so the catalog stays scannable. */
var FAMILY_ORDER = ["Roll", "Diddle", "Flam", "Drag"];
var FAMILY_LABEL = { Roll: "Rolls", Diddle: "Diddles", Flam: "Flams", Drag: "Drags" };
var cardIndex = [];   // [{ el, fam, level, hay }] — one per rudiment card
var groupEls = {};    // family -> { wrap, cards, count }
var filters = { q: "", family: "all", level: "all", path: "all" };

function buildCards() {
  var host = $("rudCards");
  host.innerHTML = "";
  cardIndex = [];
  groupEls = {};
  FAMILY_ORDER.forEach(function (fam) {
    var wrap = el("div", "rud-group");
    var head = el("div", "rud-group-head");
    head.innerHTML = FAMILY_LABEL[fam] + ' <span class="gcount"></span>';
    var cards = el("div", "rud-group-cards");
    wrap.appendChild(head);
    wrap.appendChild(cards);
    host.appendChild(wrap);
    groupEls[fam] = { wrap: wrap, cards: cards, count: head.querySelector(".gcount") };
  });
  Core.RUDIMENTS.forEach(function (r) {
    var g = groupEls[r.family];
    if (!g) return; // unknown family — skip rather than drop a card into nowhere
    var b = el("button", "rud-card");
    b.type = "button";
    b.dataset.id = r.id;
    b.innerHTML = '<span class="rname">' + r.name + '</span>' +
      '<span class="rmeta">' + r.family + '<span class="dot">·</span>PAS #' + r.pas +
      '<span class="dot">·</span>' + r.level + "</span>" +
      '<span class="rbest" hidden></span><span class="rlearn" hidden></span>';
    b.addEventListener("click", function () { selectRudiment(r.id); });
    g.cards.appendChild(b);
    var hay = (r.name + " " + r.family + " " + r.level + " pas " + r.pas + " #" + r.pas +
      " " + (r.aliases ? r.aliases.join(" ") : "")).toLowerCase();
    cardIndex.push({ el: b, id: r.id, best: b.querySelector(".rbest"), learn: b.querySelector(".rlearn"), fam: r.family, level: r.level, hay: hay });
  });
}

// Show/hide cards against the current search + family + level, hide empty
// family groups, and keep the count + empty message honest.
function applyFilters() {
  var q = filters.q.trim().toLowerCase();
  var total = cardIndex.length, shown = 0;
  var perFam = { Roll: 0, Diddle: 0, Flam: 0, Drag: 0 };
  cardIndex.forEach(function (c) {
    var ok = (filters.family === "all" || c.fam === filters.family) &&
             (filters.level === "all" || c.level === filters.level) &&
             (filters.path === "all" || (filters.path === "done") === !!progress.learned[c.id]) &&
             (q === "" || c.hay.indexOf(q) !== -1);
    c.el.hidden = !ok;
    if (ok) { shown++; perFam[c.fam]++; }
  });
  FAMILY_ORDER.forEach(function (fam) {
    var g = groupEls[fam];
    g.wrap.hidden = perFam[fam] === 0;
    g.count.textContent = perFam[fam] ? "· " + perFam[fam] : "";
  });
  $("rudCards").hidden = shown === 0;
  $("rudEmpty").hidden = shown !== 0;
  var scope = [];
  if (filters.family !== "all") scope.push(FAMILY_LABEL[filters.family]);
  if (filters.level !== "all") scope.push(filters.level);
  if (filters.path !== "all") scope.push(filters.path === "done" ? "Learned" : "To learn");
  $("filterCount").textContent = "Showing " + shown + " of " + total +
    (scope.length ? " · " + scope.join(" · ") : "");
}

function wireFilters() {
  $("rudSearch").addEventListener("input", function (e) {
    filters.q = e.target.value; applyFilters();
  });
  wireChipGroup("familyFilter", "fam", function (v) { filters.family = v; });
  wireChipGroup("levelFilter", "lvl", function (v) { filters.level = v; });
  wireChipGroup("pathFilter", "path", function (v) { filters.path = v; });
}
function wireChipGroup(id, key, apply) {
  $(id).addEventListener("click", function (e) {
    var btn = e.target.closest("button");
    if (!btn) return;
    var kids = this.querySelectorAll("button");
    for (var i = 0; i < kids.length; i++)
      kids[i].setAttribute("aria-pressed", kids[i] === btn ? "true" : "false");
    apply(btn.dataset[key]);
    applyFilters();
  });
}

function paintCards() {
  var cards = $("rudCards").querySelectorAll(".rud-card");
  for (var i = 0; i < cards.length; i++)
    cards[i].setAttribute("aria-pressed", cards[i].dataset.id === settings.rudimentId ? "true" : "false");
}
function renderRudimentInfo() {
  var r = Core.RUDIMENT_MAP[settings.rudimentId];
  paintCards();
  $("rudChips").innerHTML =
    '<span class="chip family">' + r.family + " rudiment</span>" +
    '<span class="chip">PAS #' + r.pas + "</span>" +
    (r.heritage ? '<span class="chip">' + r.heritage + "</span>" : "") +
    '<span class="chip">' + r.level + "</span>";
  $("teachingNote").textContent = r.teachingNote;
  $("breakdown").textContent = "";
  r.breakdown.forEach(function (step) {
    var item = document.createElement("li");
    item.textContent = step;
    $("breakdown").appendChild(item);
  });
  $("tempoHint").textContent = "Suggested tempo: start near " + r.tempo.suggestedLo +
    "–" + r.tempo.suggestedHi + " BPM.";
  $("suggestedText").textContent = "Suggested " + r.tempo.suggestedLo + "–" + r.tempo.suggestedHi + " BPM";
  $("btnSuggested").textContent = "Start at " + r.tempo.suggestedLo;
  renderBest();
  var leadDisabled = r.leadingHand === "fixed";
  var leadBtns = $("segLead").querySelectorAll("button");
  for (var i = 0; i < leadBtns.length; i++) leadBtns[i].disabled = leadDisabled;
}

function selectRudiment(id) {
  if (id === settings.rudimentId) return;
  stopIfActive();
  settings.rudimentId = id;
  persistSettings();
  renderRudimentInfo();
  renderSticking();
  syncPlanPreview();
  primeDisplay();
  forgetHeard();
}

/* ---------------- transport ---------------- */
function teardownTimers() {
  if (live.timer) { clearInterval(live.timer); live.timer = null; }
  if (live.raf) { cancelAnimationFrame(live.raf); live.raf = null; }
}

function buildPlanFromSettings() {
  // The core tolerates a peak at/below the start (degenerate one-rung path);
  // the student-facing rule is stricter and clearer.
  if (settings.mode === "oco" && settings.oco.peakBpm <= settings.oco.startBpm)
    throw new Error("Peak BPM must be higher than the starting BPM.");
  var turn = { turn: settings.turn };
  if (settings.mode === "fixed") {
    var fixed = { bpm: settings.bpm, turn: settings.turn };
    // A routine gives a Fixed drill a length; on its own, Fixed loops until stopped.
    if (routineRun) fixed.reps = routineRun.items[routineRun.index].p.reps;
    return Core.buildPlan("fixed", fixed, live.pattern);
  }
  if (settings.mode === "ladder") return Core.buildPlan("ladder", Object.assign({}, settings.ladder, turn), live.pattern);
  if (settings.mode === "build") return Core.buildPlan("build", Object.assign({}, settings.build, turn), live.pattern);
  return Core.buildPlan("oco", Object.assign({}, settings.oco, turn), live.pattern);
}

function startPlayback() {
  clearErr();
  readAllFields();
  var plan;
  try { plan = buildPlanFromSettings(); }
  catch (e) { setErr(e.message || "Check the settings and try again."); return; }

  try { initAudio(); }
  catch (e) { setErr("This browser can't play audio here. Try Chrome, Edge, Firefox, or Safari."); return; }
  if (audio.state !== "running") audio.resume();

  // Idempotent: tear down any running scheduler + orphan scheduled sources so
  // rapid Start presses (or Start again) can never stack schedulers or double
  // audio. Changing rudiment/lead/mode also lands here via stopIfActive().
  teardownTimers();
  killPending();

  live.playback = Core.createPracticePlayback(plan);
  live.runPlan = plan;
  forgetRun();
  live.visualQ = [];
  live.doneQueued = false;
  live.heard = null;
  $("cleanNote").textContent = "";
  live.blockStart = audio.currentTime + 0.15;
  buildEntries();
  live.status = "playing";

  lastStatusHTML = ""; lastBannerKey = "";
  renderPips(Core.COUNT_IN_BEATS);
  lightPip(-1);
  setBanner("countin", "Count-in — " + plan.rungs[0] + " BPM");
  setStatus("Count-in at " + plan.rungs[0] + " BPM…");
  updateStartBtn();
  live.timer = setInterval(scheduler, LOOKAHEAD);
  live.raf = requestAnimationFrame(visualLoop);
  requestWakeLock();
}

function pausePlayback() {
  if (live.status !== "playing") return;
  audio.suspend(); // context clock freezes — scheduled strokes stay valid, no doubles
  teardownTimers();
  releaseWakeLock();
  live.status = "paused";
  updateStartBtn();
  setStatus("Paused — Resume picks up exactly where you left off.");
}

function resumePlayback() {
  if (live.status !== "paused") return;
  audio.resume();
  live.status = "playing";
  updateStartBtn();
  live.timer = setInterval(scheduler, LOOKAHEAD);
  live.raf = requestAnimationFrame(visualLoop);
  requestWakeLock();
}

function stopPlayback() {
  teardownTimers();
  releaseWakeLock();
  live.visualQ = [];
  live.doneQueued = false;
  if (audio) { killPending(); if (audio.state !== "running") audio.resume(); }
  live.status = "idle";
  live.playback = null;
  live.heard = null;
}

// Any structural change during playback (rudiment, lead, mode, ladder/OCO
// numbers) stops cleanly first — the next Start builds a fresh plan.
function stopIfActive() {
  if (live.status === "playing" || live.status === "paused") {
    stopPlayback();
    endRoutine();
    primeDisplay();
    updateStartBtn();
  }
}

function resetPractice() {
  stopPlayback();
  endRoutine();
  forgetRun();
  live.status = "idle";
  primeDisplay();
  updateStartBtn();
}

function finishSession() {
  teardownTimers();
  releaseWakeLock();
  live.visualQ = [];
  live.playback = null;
  live.status = "complete";
  updateStartBtn();
  clearCellHighlight();
  lightPip(-1);
  $("sticking").classList.remove("listening");
  $("phaseWord").textContent = "Complete";
  $("phaseWord").className = "phase-word peak";
  $("nextBpm").innerHTML = "—";
  setBanner("complete", settings.mode === "oco" ? "Open–close–open complete ✓"
    : settings.mode === "build" ? "Build-up complete ✓"
    : "Tempo steps complete ✓");
  setStatus("Nice work. Start again, or change the settings.");
  // Taken now, so a settings change after the run cannot rewrite what was
  // played. The best clean tempo is read when copying: the student may press
  // "Clean at" after the run ends.
  var plan = live.runPlan;
  live.lastRun = plan ? { rudimentId: settings.rudimentId, lead: effectiveLead(), mode: plan.mode,
    rungs: plan.rungs.slice(), layers: plan.mode === "build" ? plan.stages.filter(function (s) { return s.kind === "play"; }).map(function (s) { return s.layerLabel; }) : undefined,
    reps: plan.mode === "oco" ? settings.oco.repsPerStep : plan.mode === "build" ? settings.build.repsPerStep
      : plan.mode === "fixed" ? plan.stages[1].blocks / (1 + plan.turn) : settings.ladder.repsPerStep,
    link: shareUrl(), goal: assignedGoal === null ? undefined : assignedGoal } : null;
  if (routineRun) { advanceRoutine(); return; }
  renderLogRow();
}

/* ---------------- practice log ----------------
   After a finished Steps or Open-close-open run, "Copy practice log" copies
   Core.practiceLog as text for a class assignment. No name, nothing sent. */
function renderLogRow() {
  $("logRow").hidden = !live.lastRun && !live.lastRoutine;
  $("logStatus").textContent = "";
}
function forgetRun() {
  if (!live.lastRun && !live.lastRoutine) return;
  live.lastRun = null;
  live.lastRoutine = null;
  renderLogRow();
}
function bestFor(run) { return (bestLog[run.rudimentId] && bestLog[run.rudimentId][run.lead]) || null; }
function copyPracticeLog() {
  var run = live.lastRun, text;
  if (live.lastRoutine) {
    text = Core.routineLog({ date: today(), total: live.lastRoutine.total,
      runs: live.lastRoutine.runs.map(function (r) { return Object.assign({ best: bestFor(r) }, r); }) });
  } else if (run) {
    text = Core.practiceLog(Object.assign({ date: today(), best: bestFor(run) }, run));
  } else return;
  var status = $("logStatus");
  var ok = function () { status.textContent = "Copied. Paste it into your class's assignment."; };
  var fail = function () {
    if (fallbackCopy(text)) ok();
    else status.textContent = "This browser would not copy it. Try again, or take a screenshot of this page.";
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok).catch(fail);
  else fail();
}

function updateStartBtn() {
  var b = $("btnStart");
  if (live.status === "playing") {
    b.textContent = "Pause";
    b.classList.remove("primary"); b.classList.add("play");
  } else {
    b.textContent = live.status === "paused" ? "Resume"
                  : live.status === "complete" ? "Start again" : "Start";
    b.classList.add("primary"); b.classList.remove("play");
  }
  updateCleanBtn(); // every status change passes through here
}

/* ---------------- best clean tempo ----------------
   The student's own log (Core.markClean). "Clean at N" claims the tempo just
   heard; each rudiment keeps its fastest claim per leading hand. The app
   never listens, so nothing here judges — it only keeps the record honest
   about which tempo, rudiment and hand were actually played. Kept under its
   own storage key, on this device only, and never in a share link. */
var BEST_KEY = "rudimentroom-best";
var bestLog = {};
function loadBest() {
  try { bestLog = Core.sanitizeBestLog(JSON.parse(localStorage.getItem(BEST_KEY))); }
  catch (e) { bestLog = {}; }
}
function saveBest() {
  try { localStorage.setItem(BEST_KEY, JSON.stringify(bestLog)); } catch (e) { /* private mode */ }
}
// The hand a best is filed under: the chosen lead, unless the rudiment ignores
// the control (same rule as Core.withLead). Read from settings rather than the
// rendered pattern, so it is right whichever of the renders runs first.
function effectiveLead() {
  var r = Core.RUDIMENT_MAP[settings.rudimentId];
  return r.leadingHand === "mirror" && settings.lead === "L" ? "L" : "R";
}

// Called at hear-time for every played stroke (never count-in or listen
// clicks), so the tempo on the button is the one the student just heard.
function noteHeard(bpm) {
  var h = live.heard;
  if (h && h.bpm === bpm) return;
  live.heard = { bpm: bpm, peak: Math.max(bpm, h ? h.peak : 0) };
  updateCleanBtn();
}
// A run's tempos belong to the rudiment and hand it was played with, so a
// change of either ends the claim — even after a completed run, where the
// status stays "complete" but the display has gone back to Ready.
function forgetHeard() {
  live.heard = null;
  forgetRun();
  $("cleanNote").textContent = "";
  updateCleanBtn();
}
// The tempo a press would claim: the one being heard while playing or paused,
// and the fastest one played once a run completes (an open-close-open run
// ends at its slow end).
function claimableBpm() {
  var h = live.heard;
  if (!h) return null;
  if (live.status === "playing" || live.status === "paused") return h.bpm;
  if (live.status === "complete") return h.peak;
  return null;
}
function updateCleanBtn() {
  var bpm = claimableBpm();
  $("btnClean").disabled = bpm == null;
  $("cleanLabel").textContent = "Clean at " + (bpm == null ? "—" : bpm);
}
function onClean() {
  var bpm = claimableBpm();
  if (bpm == null) return;
  var lead = effectiveLead();
  var r = Core.markClean(bestLog, settings.rudimentId, lead, bpm, today());
  bestLog = r.log;
  saveBest();
  progress = Core.recordClean(progress, settings.rudimentId, lead, bpm, today());
  saveProgress();
  renderBest();
  $("cleanNote").textContent = r.improved
    ? "New best: " + bpm + " BPM clean, " + (lead === "R" ? "right" : "left") + " lead."
    : "Logged " + bpm + " BPM clean. Your best is still " + r.best.bpm + ".";
}

function today() {
  var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
function fmtDay(iso) {
  var y = +iso.slice(0, 4), m = +iso.slice(5, 7), d = +iso.slice(8, 10);
  var opts = { month: "short", day: "numeric" };
  if (y !== new Date().getFullYear()) opts.year = "numeric";
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
}
function renderBest() {
  var rec = bestLog[settings.rudimentId];
  var one = function (e) { return e ? "best clean " + e.bpm + " BPM (" + fmtDay(e.date) + ")" : "not logged yet"; };
  $("bestLine").textContent = rec
    ? "Right lead: " + one(rec.R) + "\nLeft lead: " + one(rec.L)
    : "Best clean: not logged yet. While you are playing it cleanly, press \u201cClean at\u201d.";
  $("btnClearBest").hidden = !rec && !hasHistory(settings.rudimentId);
  renderGoal();
  renderProgress();
  disarmClear();
  renderBestStart();
  cardIndex.forEach(function (c) {
    var r = bestLog[c.id];
    c.best.hidden = !r;
    c.best.textContent = r ? "Best clean " +
      [r.R ? "R " + r.R.bpm : "", r.L ? "L " + r.L.bpm : ""].filter(Boolean).join(" \u00b7 ") : "";
  });
}
// "Start at your best", beside "Start at N" in Fixed mode: sets the tempo to
// this rudiment's best clean tempo for the current hand, and only exists when
// there is one. Like the suggested tempo it only sets the tempo, so mid-play
// it lands at the next cycle.
function renderBestStart() {
  var bpm = Core.bestTempo(bestLog, settings.rudimentId, effectiveLead());
  var b = $("btnBest");
  b.hidden = bpm == null;
  if (bpm != null) b.textContent = "Start at your best (" + bpm + ")";
}
function onBestStart() {
  var bpm = Core.bestTempo(bestLog, settings.rudimentId, effectiveLead());
  if (bpm == null) return;
  $("bpm").value = bpm;
  onBpmChanged();
}
// Clearing takes two presses, a few seconds apart at most. Not confirm(): a
// modal dialog blocks the scheduler's tick and the audio would drop out.
var clearArmed = null;
function onClearBest() {
  if (!clearArmed) {
    $("btnClearBest").textContent = "Press again to clear";
    clearArmed = setTimeout(disarmClear, 4000);
    return;
  }
  bestLog = Core.clearBest(bestLog, settings.rudimentId);
  saveBest();
  progress = Core.clearHistory(progress, settings.rudimentId);
  saveProgress();
  renderBest();
  $("cleanNote").textContent = "Cleared the best clean tempos and the history for " +
    Core.RUDIMENT_MAP[settings.rudimentId].name + ". Your goal and learned mark stay.";
}
function disarmClear() {
  if (clearArmed) clearTimeout(clearArmed);
  clearArmed = null;
  $("btnClearBest").textContent = "Clear";
}

function onStartButton() {
  if (live.status === "playing") pausePlayback();
  else if (live.status === "paused") resumePlayback();
  else startPlayback();
}

/* ---------------- idle/ready display ---------------- */
function startBpmForMode() {
  if (settings.mode === "fixed") return settings.bpm;
  if (settings.mode === "ladder") return settings.ladder.startBpm;
  if (settings.mode === "build") return settings.build.bpm;
  return settings.oco.startBpm;
}
function primeDisplay() {
  lastStatusHTML = ""; lastBannerKey = "";
  $("curBpm").innerHTML = startBpmForMode() + "<small>BPM</small>";
  $("phaseWord").textContent = "Ready";
  $("phaseWord").className = "phase-word";
  var rungs = live.previewPlan ? live.previewPlan.rungs : null;
  $("nextBpm").innerHTML = rungs && rungs.length > 1 ? rungs[1] + "<small> BPM</small>" : "—";
  renderPips(0);
  setBanner("", "");
  setStatus("Press Start — a four-beat count-in leads you in.");
  showLayer(null); // an idle display shows the written rudiment, never a layer left over from a run
  clearCellHighlight();
  $("sticking").classList.remove("listening");
}

/* ---------------- settings wiring ---------------- */
function clampField(id) {
  var f = $(id);
  var min = +f.min, max = +f.max;
  var v = Math.round(+f.value);
  if (!isFinite(v)) v = +f.defaultValue || min;
  v = Math.max(min, Math.min(max, v));
  f.value = v;
  return v;
}
function readAllFields() {
  settings.bpm = clampField("bpm");
  settings.ladder.startBpm = clampField("ladStart");
  settings.ladder.endBpm = clampField("ladEnd");
  settings.ladder.stepBpm = clampField("ladStep");
  settings.ladder.repsPerStep = clampField("ladReps");
  settings.oco.startBpm = clampField("ocoStart");
  settings.oco.peakBpm = clampField("ocoPeak");
  settings.oco.stepBpm = clampField("ocoStep");
  settings.oco.repsPerStep = clampField("ocoReps");
  settings.build.bpm = clampField("buBpm");
  settings.build.repsPerStep = clampField("buReps");
  persistSettings();
}
function setErr(m) { $("err").textContent = m; }
function clearErr() { $("err").textContent = ""; }

// The fixed-mode tempo is special: while playing it parks a pending change
// that the machine applies at the next cycle boundary — playback never stops.
function onBpmChanged() {
  settings.bpm = clampField("bpm");
  persistSettings();
  if ((live.status === "playing" || live.status === "paused") &&
      settings.mode === "fixed" && live.playback) {
    try { live.playback.requestBpm(settings.bpm); } catch (e) { /* out of range — field is clamped */ }
  } else if (live.status === "idle" || live.status === "complete") {
    primeDisplay();
  }
  syncPlanPreview();
}

function onModeFieldChanged() {
  stopIfActive();
  readAllFields();
  syncPlanPreview();
  primeDisplay();
}

function wireSeg(segId, apply) {
  $(segId).addEventListener("click", function (e) {
    var btn = e.target.closest("button");
    if (!btn || btn.disabled) return;
    var kids = this.querySelectorAll("button");
    for (var i = 0; i < kids.length; i++)
      kids[i].setAttribute("aria-pressed", kids[i] === btn ? "true" : "false");
    apply(btn.dataset.val);
  });
}
function setSeg(segId, val) {
  var kids = $(segId).querySelectorAll("button");
  for (var i = 0; i < kids.length; i++)
    kids[i].setAttribute("aria-pressed", kids[i].dataset.val === val ? "true" : "false");
}

var MODE_HINT = {
  fixed: "Loop the rudiment at one tempo. Nudge the tempo while playing — the change lands at the next cycle.",
  ladder: "Step from start to end, up or down. Between tempos: four listen-only clicks at the NEW tempo.",
  oco: "Slow to the peak and back down, in steps. Tempo changes are seamless at a cycle boundary — watch for the warning.",
  build: "Learn it in layers at one tempo: the hands alone, then the accents, then the flams, drags or buzz. Each layer changes at a cycle boundary — watch for the warning.",
};
function applyMode(mode) {
  stopIfActive();
  settings.mode = mode;
  $("settingsFixed").hidden = mode !== "fixed";
  $("settingsLadder").hidden = mode !== "ladder";
  $("settingsOco").hidden = mode !== "oco";
  $("settingsBuild").hidden = mode !== "build";
  $("modeHint").textContent = MODE_HINT[mode];
  persistSettings();
  syncPlanPreview();
  primeDisplay();
}
/* Not structural: the next stroke scheduled takes the new voice, so this
   never stops playback — and it is not part of a shared drill. */
var SOUND_HINT = {
  marching: "A recorded marching snare, buzz strokes included. The right hand sits a little right, the left a little left.",
  snare: "A synthesized snare, lighter than the marching drum. The right hand sits a little right, the left a little left.",
  tones: "The right hand plays a higher tone than the left, so you can hear the sticking.",
};
function soundHint(sound) {
  if (sound === "marching" && marchingState === "failed") {
    return "The marching snare recording did not load, so the synth snare is playing instead.";
  }
  return SOUND_HINT[sound];
}
function applySound(sound) {
  renderSummary();
  settings.sound = sound;
  persistSettings();
  if (sound === "marching") loadMarching();
  $("soundHint").textContent = soundHint(sound);
  previewVoice();
}
/* Structural, like the mode: it changes how many cycles a plan holds, so a
   change mid-run stops playback. It travels in share links — how a drill is
   practiced is part of the drill. */
var TURN_HINT = [
  "Off — the app plays every cycle with you.",
  "The app plays a cycle, then clicks while you play it back once. The highlight keeps going so you can check yourself.",
  "The app plays a cycle, then clicks while you play it back twice. The highlight keeps going so you can check yourself.",
  "The app plays a cycle, then clicks while you play it back three times. The highlight keeps going so you can check yourself.",
];
function applyTurn(val) {
  stopIfActive();
  settings.turn = +val;
  persistSettings();
  $("turnHint").textContent = TURN_HINT[settings.turn];
  syncPlanPreview();
  primeDisplay();
}
/* Not structural: dynamics scale each stroke as it is scheduled, so a change
   lands on the next stroke without stopping playback. It travels in share
   links, since how loudly a drill is practiced is part of the drill. */
var DYNAMICS_HINT = {
  full: "Full \u2014 the original loudness.",
  medium: "Medium \u2014 every stroke at about three quarters of full, accents still above taps.",
  soft: "Soft \u2014 every stroke at half of full. Keep the stick low and the accents clear.",
  swell: "Swell \u2014 soft up to full and back to soft across each tempo\u2019s reps (across 8 reps in endless Fixed mode; two reps play soft, then full).",
};
function applyDynamics(val) {
  if (Core.DYNAMICS.indexOf(val) === -1) return;
  settings.dynamics = val;
  persistSettings();
  $("dynHint").textContent = DYNAMICS_HINT[val];
  syncPlanPreview();
}
function applyLead(lead) {
  stopIfActive();
  settings.lead = lead;
  persistSettings();
  renderSticking();
  syncPlanPreview();
  primeDisplay();
  forgetHeard();
  renderBestStart();
  renderGoal();
  renderProgress();
}

function fmtDuration(secs) {
  var mm = Math.floor(secs / 60), ss = Math.round(secs % 60);
  if (ss === 60) { mm++; ss = 0; }
  return mm + ":" + (ss < 10 ? "0" : "") + ss;
}

/* The one-line summary the setup toggle shows, and the tempo chip in the
   docked bar. The tempo stepper only means something in Fixed mode: the
   other two modes walk their own tempos. */
var DYNAMICS_NAME = { medium: "Medium", soft: "Soft", swell: "Swell" };
var SOUND_NAME = { marching: "Marching snare", snare: "Synth snare", tones: "Tones" };
function renderSummary() {
  var r = Core.RUDIMENT_MAP[settings.rudimentId];
  var mode;
  if (settings.mode === "fixed") mode = "Fixed " + settings.bpm + " BPM";
  else if (settings.mode === "ladder")
    mode = "Steps " + settings.ladder.startBpm + "\u2192" + settings.ladder.endBpm + " BPM";
  else if (settings.mode === "build") mode = "Build up " + settings.build.bpm + " BPM";
  else mode = "Open\u2011Close\u2011Open " + settings.oco.startBpm + "\u2192" + settings.oco.peakBpm + " BPM";
  $("summaryTop").textContent = (r ? r.name : "Rudiment") + " \u00b7 " + (settings.lead === "L" ? "Left" : "Right") + " lead";
  $("summarySub").textContent = mode + " \u00b7 " + (SOUND_NAME[settings.sound] || "") +
    (settings.turn ? " \u00b7 Your turn x" + settings.turn : "") +
    (settings.dynamics !== "full" ? " \u00b7 " + DYNAMICS_NAME[settings.dynamics] : "");
  $("bpmQuick").textContent = settings.bpm;
  $("rtRepsWrap").hidden = settings.mode !== "fixed";
  $("tempoStep").hidden = settings.mode !== "fixed";
}

function syncPlanPreview() {
  renderSummary();
  var wrap = $("planPreview"), meta = $("planMeta");
  var plan;
  try { plan = buildPlanFromSettings(); }
  catch (e) {
    live.previewPlan = null;
    wrap.innerHTML = '<span class="hint">' + (e.message || "Check the settings.") + "</span>";
    meta.textContent = "";
    return;
  }
  live.previewPlan = plan;
  var trade = settings.turn
    ? " · the app plays one, then you play " + (settings.turn === 1 ? "one" : settings.turn) + " alone"
    : "";
  if (settings.mode === "fixed") {
    wrap.innerHTML = '<span class="rung">' + settings.bpm + ' BPM</span> <span class="hint">— loops until you stop it</span>';
    meta.textContent = "One cycle = " + live.pattern.cycleBeats + " beats · count-in first" + trade;
    return;
  }
  if (settings.mode === "build") {
    var labels = plan.stages.filter(function (st) { return st.kind === "play"; }).map(function (st) { return st.layerLabel; });
    wrap.innerHTML = labels.map(function (l, i) {
      return (i ? ' <span class="arrow">\u2192</span> ' : "") + '<span class="rung' + (i === labels.length - 1 ? " peak" : "") + '">' + l + "</span>";
    }).join("") + ' <span class="hint">at ' + settings.build.bpm + " BPM</span>";
    var bc = plan.stages.reduce(function (a, st) { return a + (st.kind === "play" ? st.blocks : 0); }, 0);
    var byours = settings.turn ? bc * settings.turn / (1 + settings.turn) : 0;
    meta.textContent = labels.length === 1
      ? "Nothing to build up \u2014 this rudiment is already just the hands. " + bc + " cycles \u00b7 about " + fmtDuration(Core.totalSeconds(plan)) + " total"
      : labels.length + " layers \u00b7 " + bc + " cycles" + (byours ? " (" + byours + " of them yours)" : "") +
        " \u00b7 about " + fmtDuration(Core.totalSeconds(plan)) + " total" + trade;
    return;
  }
  var peak = Math.max.apply(null, plan.rungs);
  var html = "";
  for (var i = 0; i < plan.rungs.length; i++) {
    if (i) html += ' <span class="arrow">→</span> ';
    var isPeak = settings.mode === "oco" && plan.rungs[i] === peak;
    var isEnd = settings.mode === "ladder" && i === plan.rungs.length - 1;
    html += '<span class="rung' + (isPeak || isEnd ? " peak" : "") + '">' + plan.rungs[i] + "</span>";
  }
  wrap.innerHTML = html;
  var secs = Core.totalSeconds(plan);
  var cycles = plan.stages.reduce(function (a, s) { return a + (s.kind === "play" ? s.blocks : 0); }, 0);
  var yours = settings.turn ? cycles * settings.turn / (1 + settings.turn) : 0;
  meta.textContent = plan.rungs.length + " steps · " + cycles + " cycles" +
    (yours ? " (" + yours + " of them yours)" : "") + " · about " + fmtDuration(secs) + " total";
}

/* ---------------- remembered settings + shareable link ----------------
   Precedence: built-in defaults < last-used (localStorage) < a shared link's
   query params. Every value is validated on the way in. */
// Deliberately still "rudimentbuilder-" after the rename to Rudiment Room:
// this key holds a returning student's saved tempo, mode and lead. Renaming
// it would silently hand every existing user a factory reset.
var STORE_KEY = "rudimentbuilder-settings";
function persistSettings() {
  if (routineRun) return; // a routine borrows the settings; the student's own are restored when it ends
  try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (e) { /* private mode */ }
}
function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { return null; }
}
function toInt(v, lo, hi) {
  if (v === null || v === undefined || v === "") return null;
  var n = Math.round(+v);
  if (!isFinite(n)) return null;
  return Math.max(lo, Math.min(hi, n));
}
function coerceSettings(raw) {
  if (!raw || typeof raw !== "object") return;
  if (Core.RUDIMENT_MAP[raw.rudimentId]) settings.rudimentId = raw.rudimentId;
  if (raw.lead === "R" || raw.lead === "L") settings.lead = raw.lead;
  if (raw.mode === "fixed" || raw.mode === "ladder" || raw.mode === "oco" || raw.mode === "build") settings.mode = raw.mode;
  if (typeof raw.cue === "boolean") settings.cue = raw.cue;
  if (typeof raw.pulse === "boolean") settings.pulse = raw.pulse;
  if (typeof raw.muted === "boolean") settings.muted = raw.muted;
  if (raw.sound === "marching" || raw.sound === "snare" || raw.sound === "tones") settings.sound = raw.sound;
  if (Core.DYNAMICS.indexOf(raw.dynamics) !== -1) settings.dynamics = raw.dynamics;
  var n;
  if ((n = toInt(raw.turn, 0, Core.TURN_MAX)) !== null) settings.turn = n;
  if ((n = toInt(raw.bpm, Core.BPM_MIN, Core.BPM_MAX)) !== null) settings.bpm = n;
  var lad = raw.ladder || {}, oco = raw.oco || {};
  if ((n = toInt(lad.startBpm, Core.BPM_MIN, Core.BPM_MAX)) !== null) settings.ladder.startBpm = n;
  if ((n = toInt(lad.endBpm, Core.BPM_MIN, Core.BPM_MAX)) !== null) settings.ladder.endBpm = n;
  if ((n = toInt(lad.stepBpm, Core.STEP_MIN, Core.STEP_MAX)) !== null) settings.ladder.stepBpm = n;
  if ((n = toInt(lad.repsPerStep, Core.REPS_MIN, Core.REPS_MAX)) !== null) settings.ladder.repsPerStep = n;
  if ((n = toInt(oco.startBpm, Core.BPM_MIN, Core.BPM_MAX)) !== null) settings.oco.startBpm = n;
  if ((n = toInt(oco.peakBpm, Core.BPM_MIN, Core.BPM_MAX)) !== null) settings.oco.peakBpm = n;
  if ((n = toInt(oco.stepBpm, Core.STEP_MIN, Core.STEP_MAX)) !== null) settings.oco.stepBpm = n;
  if ((n = toInt(oco.repsPerStep, Core.REPS_MIN, Core.REPS_MAX)) !== null) settings.oco.repsPerStep = n;
  var bu = raw.build || {};
  if ((n = toInt(bu.bpm, Core.BPM_MIN, Core.BPM_MAX)) !== null) settings.build.bpm = n;
  if ((n = toInt(bu.repsPerStep, Core.REPS_MIN, Core.REPS_MAX)) !== null) settings.build.repsPerStep = n;
}
function queryToRaw() {
  var q = new URLSearchParams(location.search);
  if (![...q.keys()].length) return null;
  return {
    // Steps mode is "ladder" inside the app and in saved settings; its links say
    // mode=steps, and links shared before the rename (mode=ladder) still open it.
    rudimentId: q.get("r"), lead: q.get("lead"), mode: q.get("mode") === "steps" ? "ladder" : q.get("mode"),
    cue: q.get("cue") === null ? undefined : q.get("cue") === "1",
    pulse: q.get("pulse") === null ? undefined : q.get("pulse") === "1",
    turn: q.get("turn"),
    dynamics: q.get("dyn"),
    // muted is deliberately NOT read from links — a shared drill never arrives silent.
    // Nor is sound: which voice plays the strokes is the listener's choice, not the drill's.
    bpm: q.get("bpm"),
    ladder: { startBpm: q.get("ls"), endBpm: q.get("le"), stepBpm: q.get("lst"), repsPerStep: q.get("lr") },
    oco: { startBpm: q.get("os"), peakBpm: q.get("op"), stepBpm: q.get("ost"), repsPerStep: q.get("or") },
    build: { bpm: q.get("bb"), repsPerStep: q.get("br") },
  };
}
function shareParams() {
  var p = new URLSearchParams();
  p.set("r", settings.rudimentId);
  p.set("lead", settings.lead);
  p.set("mode", settings.mode === "ladder" ? "steps" : settings.mode);
  p.set("cue", settings.cue ? "1" : "0");
  p.set("pulse", settings.pulse ? "1" : "0");
  p.set("turn", settings.turn);
  p.set("dyn", settings.dynamics);
  if (settings.mode === "fixed") p.set("bpm", settings.bpm);
  if (settings.mode === "ladder") {
    p.set("ls", settings.ladder.startBpm); p.set("le", settings.ladder.endBpm);
    p.set("lst", settings.ladder.stepBpm); p.set("lr", settings.ladder.repsPerStep);
  }
  if (settings.mode === "build") { p.set("bb", settings.build.bpm); p.set("br", settings.build.repsPerStep); }
  if (settings.mode === "oco") {
    p.set("os", settings.oco.startBpm); p.set("op", settings.oco.peakBpm);
    p.set("ost", settings.oco.stepBpm); p.set("or", settings.oco.repsPerStep);
  }
  return p;
}
function shareUrl() {
  return location.origin + location.pathname + "?" + shareParams().toString();
}

/* ---------------- assignment: goal tempo, QR code, printable sheet ----------------
   A teacher sets a drill, optionally a goal tempo, and hands students a link, a
   QR code or a printed sheet. The goal travels as ?goal=N and is the teacher's
   target, shown to the student; the app never listens, so reaching it is still
   the student's own mark (Clean at N), exactly like the best-tempo log.

   The QR encodes the shop's short link, not this host: a printed sheet cannot
   be corrected, and ADR 0271 (praxis-platform) has every printed code name an
   address the company controls. backwerdrhythmshop.com/rudiment-room redirects
   to wherever the app lives and keeps the query string, so the drill's
   settings ride along. The on-screen link and "Copy link" stay on this host. */
var PRINT_LINK = "https://backwerdrhythmshop.com/rudiment-room";
var assignedGoal = null;   // set by ?goal= on arrival; session only, never stored
function parseGoal(v) {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  var n = Math.round(+v);
  return isFinite(n) && n >= Core.BPM_MIN && n <= Core.BPM_MAX ? n : null;
}
function assignmentQuery(goal) {
  var p = shareParams();
  if (goal !== null) p.set("goal", goal);
  if (routineIncluded()) p.set("routine", Core.encodeRoutine(routine));
  return p.toString();
}
function routineIncluded() { return routine.length > 0 && $("assignRoutine").checked; }
function assignmentLink(goal) { return location.origin + location.pathname + "?" + assignmentQuery(goal); }
function printLink(goal) { return PRINT_LINK + "?" + assignmentQuery(goal); }

var SVG_NS = "http://www.w3.org/2000/svg";
// Black modules on a white ground with the 4-module quiet zone, whatever the
// theme: a code on a dark page would not scan. Returns null if it cannot be made.
function qrSvg(text, label) {
  if (typeof qrcode !== "function") return null;
  var qr;
  try { qr = qrcode(0, "M"); qr.addData(text); qr.make(); } catch (e) { return null; }
  var n = qr.getModuleCount(), quiet = 4, d = "";
  for (var r = 0; r < n; r++)
    for (var c = 0; c < n; c++)
      if (qr.isDark(r, c)) d += "M" + (c + quiet) + " " + (r + quiet) + "h1v1h-1z";
  var svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 " + (n + quiet * 2) + " " + (n + quiet * 2));
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", label);
  svg.setAttribute("shape-rendering", "crispEdges");
  var bg = document.createElementNS(SVG_NS, "rect");
  bg.setAttribute("width", n + quiet * 2); bg.setAttribute("height", n + quiet * 2); bg.setAttribute("fill", "#fff");
  var path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d); path.setAttribute("fill", "#000");
  svg.appendChild(bg); svg.appendChild(path);
  return svg;
}
function describeDrill() {
  var r = Core.RUDIMENT_MAP[settings.rudimentId];
  var reps = function (n) { return n + (n === 1 ? " rep" : " reps") + " at each tempo"; };
  var mode = settings.mode === "fixed" ? "Fixed tempo, " + settings.bpm + " BPM"
    : settings.mode === "ladder" ? "Steps, " + settings.ladder.startBpm + " to " + settings.ladder.endBpm +
        " BPM by " + settings.ladder.stepBpm + ", " + reps(settings.ladder.repsPerStep)
    : settings.mode === "build" ? "Build-up in layers, " + settings.build.bpm + " BPM, " + reps(settings.build.repsPerStep).replace("tempo", "layer")
    : "Open\u2013close\u2013open, " + settings.oco.startBpm + " up to " + settings.oco.peakBpm +
        " BPM by " + settings.oco.stepBpm + ", " + reps(settings.oco.repsPerStep);
  var extra = [];
  if (settings.turn) extra.push("Your turn x" + settings.turn);
  if (settings.dynamics !== "full") extra.push(DYNAMICS_NAME[settings.dynamics] + " dynamics");
  return {
    title: r.name + " (PAS #" + r.pas + ")",
    lines: [(settings.lead === "L" ? "Left" : "Right") + " hand leads", mode].concat(extra),
  };
}
function currentGoalInput() { return parseGoal($("goalInput").value); }
function renderAssignment() {
  $("assignRoutineRow").hidden = routine.length === 0;
  $("assignRoutineLbl").textContent = "Include my routine (" + routine.length + (routine.length === 1 ? " drill" : " drills") + ")";
  var goal = currentGoalInput();
  var raw = $("goalInput").value.trim();
  $("goalNote").textContent = raw && goal === null
    ? "Goal tempo must be a whole number from " + Core.BPM_MIN + " to " + Core.BPM_MAX + ". The link has no goal until it is."
    : "";
  var d = describeDrill();
  $("assignDrill").textContent = d.title + " \u2014 " + d.lines.join(" \u00b7 ") + (goal !== null ? " \u00b7 Goal " + goal + " BPM" : "");
  var link = assignmentLink(goal);
  $("assignLink").value = link;
  var box = $("assignQr");
  box.textContent = "";
  var svg = qrSvg(printLink(goal), "QR code that opens this drill in Rudiment Room");
  if (svg) box.appendChild(svg);
  else box.textContent = "The QR code could not be made for this drill. Copy the link instead.";
  $("btnAssignPrint").disabled = !svg;
}
function copyAssignmentLink() {
  var url = assignmentLink(currentGoalInput());
  var b = $("btnAssignCopy"), was = b.textContent;
  var done = function (msg) { b.textContent = msg; setTimeout(function () { b.textContent = was; }, 1600); };
  var fail = function () { done(fallbackCopy(url) ? "Copied \u2713" : "Copy failed"); };
  if (navigator.clipboard && navigator.clipboard.writeText)
    navigator.clipboard.writeText(url).then(function () { done("Copied \u2713"); }).catch(fail);
  else fail();
}
// The sheet is built into #printSheet, which only prints; the page and dialogs are hidden then.
function printAssignment() {
  var goal = currentGoalInput(), d = describeDrill();
  var sheet = $("printSheet");
  sheet.textContent = "";
  var add = function (tag, cls, text) { var e = el(tag, cls); e.textContent = text; sheet.appendChild(e); return e; };
  add("p", "ps-brand", "Backwerd Rhythm Shop \u00b7 Rudiment Room");
  add("h1", "", "Practice assignment");
  add("p", "ps-rud", d.title);
  d.lines.forEach(function (t) { add("p", "ps-line", t); });
  if (goal !== null) add("p", "ps-goal", "Goal tempo: " + goal + " BPM");
  if (routineIncluded()) {
    add("p", "ps-line", "Routine, in order:");
    routine.forEach(function (it, i) { add("p", "ps-line", (i + 1) + ". " + Core.describeRoutineItem(it)); });
  }
  var qr = el("div", "ps-qr");
  qr.appendChild(qrSvg(printLink(goal), "QR code that opens this drill in Rudiment Room"));
  sheet.appendChild(qr);
  add("p", "ps-scan", "Scan to open the drill, set up and ready.");
  add("p", "ps-url", printLink(goal));
  add("p", "ps-note", "Rudiment Room is free and needs no account. It does not listen or grade: \u201cclean\u201d is your own call.");
  document.body.classList.add("printing-assignment");
  var clear = function () {
    document.body.classList.remove("printing-assignment");
    window.removeEventListener("afterprint", clear);
  };
  window.addEventListener("afterprint", clear);
  window.print();
}
function renderGoal() {
  var line = $("goalLine");
  if (assignedGoal === null) { line.hidden = true; return; }
  var mine = bestLog[settings.rudimentId] && bestLog[settings.rudimentId][effectiveLead()];
  line.hidden = false;
  line.textContent = "Assigned goal: " + assignedGoal + " BPM" +
    (mine ? (mine.bpm >= assignedGoal ? " \u2014 you have marked " + mine.bpm + " BPM clean for this hand."
                                        : " \u2014 your best clean mark is " + mine.bpm + " BPM.")
          : ". Mark a tempo clean when you play it cleanly.");
}

/* ---------------- progress ----------------
   The student's own record, on this device only (Core's progress model): dated
   clean marks, a goal tempo per hand, "I can play this" marks, and a learning
   path derived from the data. All of it is a claim; the app never listens. It
   never travels in a link. The copy button produces a plain-text summary. */
var PROGRESS_KEY = "rudimentroom-progress";
var progress = Core.emptyProgress();
function loadProgress() {
  try { progress = Core.sanitizeProgress(JSON.parse(localStorage.getItem(PROGRESS_KEY))); }
  catch (e) { progress = Core.emptyProgress(); }
}
function saveProgress() {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch (e) { /* private mode */ }
}
function hasHistory(id) { return !!progress.history[id]; }
function handWord(lead) { return lead === "R" ? "right" : "left"; }
function nameOf(id) { return Core.RUDIMENT_MAP[id].name; }
// Choose a rudiment, and a hand where the rudiment has one to choose.
function chooseDrill(id, lead) {
  selectRudiment(id);
  if (lead && Core.RUDIMENT_MAP[id].leadingHand === "mirror" && settings.lead !== lead) {
    setSeg("segLead", lead);
    applyLead(lead);
  }
  $("setupToggle").scrollIntoView && $("setupToggle").scrollIntoView({ block: "nearest" });
}
function onLearnedToggle(e) {
  progress = Core.setLearned(progress, settings.rudimentId, e.target.checked ? today() : null);
  saveProgress();
  renderProgress();
  if (filters.path !== "all") applyFilters();
}
function setMyGoal(bpm) {
  var lead = effectiveLead();
  progress = Core.setGoal(progress, settings.rudimentId, lead, bpm);
  saveProgress();
  renderProgress();
}
function onSetGoal() {
  var raw = $("myGoal").value.trim();
  if (raw === "") { setMyGoal(null); return; }
  var n = Math.round(+raw);
  if (!isFinite(n) || n < Core.BPM_MIN || n > Core.BPM_MAX) {
    $("goalProgress").textContent = "A goal tempo is a whole number from " + Core.BPM_MIN + " to " + Core.BPM_MAX + ".";
    return;
  }
  setMyGoal(n);
}
// A small line chart of the day's best clean mark over time, with the goal as a
// dashed line. Spaced by mark, not by calendar, so a gap between sessions does
// not flatten the trend. The same facts are in the label for screen readers.
function histChart(series, goal, lead) {
  var host = $("histChart");
  host.textContent = "";
  if (!series.length) return;
  var shown = series.slice(-30);
  var recent = shown.slice(-6).map(function (e) { return fmtDay(e.date) + " " + e.bpm; }).join(", ");
  var label = "Clean tempo marks, " + handWord(lead) + " hand, " + shown.length + (shown.length === 1 ? " day" : " days") +
    ". Latest: " + recent + (goal ? ". Goal " + goal + " BPM." : ".");
  if (shown.length < 2) {
    var one = el("p", "hist-cap"); one.textContent = "One mark so far: " + recent + " BPM (" + handWord(lead) + " hand)."; host.appendChild(one); return;
  }
  var W = 300, H = 84, padX = 10, padY = 12;
  var vals = shown.map(function (e) { return e.bpm; }).concat(goal ? [goal] : []);
  var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
  if (hi === lo) { hi += 5; lo -= 5; }
  var X = function (i) { return padX + (W - 2 * padX) * i / (shown.length - 1); };
  var Y = function (v) { return H - padY - (H - 2 * padY) * (v - lo) / (hi - lo); };
  var svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", label);
  var mk = function (tag, attrs) {
    var n = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    svg.appendChild(n); return n;
  };
  if (goal) mk("line", { x1: padX, x2: W - padX, y1: Y(goal), y2: Y(goal), stroke: "currentColor", "stroke-width": 1.5, "stroke-dasharray": "4 4", opacity: 0.6 });
  mk("polyline", { points: shown.map(function (e, i) { return X(i).toFixed(1) + "," + Y(e.bpm).toFixed(1); }).join(" "),
    fill: "none", stroke: "currentColor", "stroke-width": 2.5, "stroke-linejoin": "round" });
  shown.forEach(function (e, i) { mk("circle", { cx: X(i).toFixed(1), cy: Y(e.bpm).toFixed(1), r: 3.5, fill: "currentColor" }); });
  host.appendChild(svg);
  var cap = el("p", "hist-cap");
  cap.textContent = fmtDay(shown[0].date) + " " + shown[0].bpm + " \u2192 " + fmtDay(shown[shown.length - 1].date) + " " +
    shown[shown.length - 1].bpm + " BPM" + (goal ? " \u00b7 dashed line is your goal, " + goal : "");
  host.appendChild(cap);
}
function renderProgress() {
  var id = settings.rudimentId, lead = effectiveLead();
  var r = Core.RUDIMENT_MAP[id];
  $("learnedToggle").checked = !!progress.learned[id];
  var hand = r.leadingHand === "mirror" ? handWord(lead) + " hand" : "";
  $("myGoalLbl").textContent = "My goal" + (hand ? ", " + hand : "") + " (BPM)";
  var g = Core.goalStatus(progress, bestLog, id, lead);
  var mine = progress.goals[id] && progress.goals[id][lead];
  if (document.activeElement !== $("myGoal")) $("myGoal").value = mine || "";
  $("btnClearGoal").hidden = !mine;
  $("goalProgress").textContent = !g ? "Set a goal tempo to see how near you are."
    : g.best === null ? "Goal " + g.goal + " BPM. Mark a tempo clean while you play to start measuring."
    : g.reached ? "Goal " + g.goal + " BPM reached \u2014 your best clean mark is " + g.best + " BPM. (Your own mark.)"
    : "Goal " + g.goal + " BPM \u2014 your best clean mark is " + g.best + " BPM, " + g.pct + "% of the way.";
  histChart(Core.historySeries(progress, id, lead), mine || null, lead);

  var st = Core.pathStatus(progress);
  $("pathLine").textContent = "Your path: " + st.learned + " of " + st.total + " learned" +
    (st.next ? " \u00b7 next up: " + nameOf(st.next) : " \u00b7 every rudiment marked learned");
  $("btnNext").hidden = !st.next;
  var near = Core.closestToGoal(progress, bestLog);
  $("nudgeRow").hidden = !near;
  if (near) $("nudgeLine").textContent = "Closest to your goal: " + nameOf(near.id) +
    (Core.RUDIMENT_MAP[near.id].leadingHand === "mirror" ? ", " + handWord(near.lead) + " hand" : "") +
    " \u2014 " + near.best + " of " + near.goal + " BPM (" + near.pct + "%).";
  cardIndex.forEach(function (c) {
    var done = !!progress.learned[c.id], isNext = c.id === st.next;
    c.learn.hidden = !done && !isNext;
    c.learn.textContent = done ? "\u2713 Learned" : "Next up";
  });
}
function copyProgress() {
  var text = Core.progressSummary({ date: today(), progress: progress, bestLog: bestLog });
  var status = $("progressStatus");
  var ok = function () { status.textContent = "Copied. It names no one; paste it where your teacher asked."; };
  var fail = function () {
    if (fallbackCopy(text)) ok();
    else status.textContent = "This browser would not copy it. Try again.";
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok).catch(fail);
  else fail();
}

/* ---------------- quiz: name that rudiment ----------------
   Core builds the questions (Core.buildQuiz) and scores them. This only shows
   them. By ear, the rudiment is played from the written pattern at its default
   tempo, right lead, in the chosen stroke sound; by notation, the drawn card is
   shown with a description that leaves the name out. The score lives in memory
   for the round and is never stored. */
var quiz = null; // { questions, i, picks, answered, type, scope, sampleTimer }
var quizType = "mixed", quizScope = "all";
function quizView(which) {
  ["quizSetup", "quizPlay", "quizDone"].forEach(function (id) { $(id).hidden = id !== which; });
}
function openQuiz() {
  stopIfActive();
  stopQuizSample();
  quiz = null;
  quizView("quizSetup");
  var n = Core.quizPool("learned", progress).length;
  $("quizSetupNote").textContent = n < Core.QUIZ_CHOICES
    ? "The Learned scope needs at least " + Core.QUIZ_CHOICES + " rudiments marked learned (you have " + n + ")." : "";
}
function startQuiz() {
  var pool = Core.quizPool(quizScope, progress);
  if (quizScope === "learned" && pool.length < Core.QUIZ_CHOICES) {
    $("quizSetupNote").textContent = "Mark at least " + Core.QUIZ_CHOICES + " rudiments as learned first, or pick a level.";
    return;
  }
  quiz = { questions: Core.buildQuiz({ pool: pool, type: quizType }), i: 0, picks: [], answered: false, sampleTimer: null };
  showQuestion();
}
function stopQuizSample() {
  if (quiz && quiz.sampleTimer) { clearTimeout(quiz.sampleTimer); quiz.sampleTimer = null; }
  if (audio) killPending();
  $("btnQuizPlay").textContent = "Play it";
}
// The written rudiment, right lead, a few cycles at its default tempo.
function playQuizSample(id) {
  var msg = $("quizFeedback");
  if (settings.muted) { msg.textContent = "Sound is muted. Turn it on with the Sound button, then play it again."; return; }
  try { initAudio(); } catch (e) { msg.textContent = "This browser can't play audio here."; return; }
  if (audio.state !== "running") audio.resume();
  stopQuizSample();
  var r = Core.RUDIMENT_MAP[id], pat = Core.withLead(r, "R"), events = Core.expandPattern(pat);
  var bpm = r.tempo.defaultBpm, beat = Core.beatSeconds(bpm);
  var cycles = Math.max(1, Math.min(4, Math.ceil(8 / pat.cycleBeats)));
  var t0 = audio.currentTime + 0.15;
  for (var c = 0; c < cycles; c++) events.forEach(function (ev) {
    var t = t0 + (c * pat.cycleBeats + ev.beatPos) * beat;
    if (ev.graces.length) {
      Core.graceTimes(t, ev.graces.length, Core.graceLeadSeconds(bpm, pat.slotsPerBeat)).forEach(function (gt, i) {
        playStroke(Math.max(gt, audio.currentTime + 0.001), ev.graces[i].hand, ev.graces[i].velocity, false, 0);
      });
    }
    playStroke(t, ev.hand, ev.velocity, ev.accent, ev.buzz ? ev.lengthBeats * beat : 0);
  });
  $("btnQuizPlay").textContent = "Playing\u2026";
  quiz.sampleTimer = setTimeout(function () { quiz.sampleTimer = null; $("btnQuizPlay").textContent = "Play it again"; },
    (cycles * pat.cycleBeats * beat + 0.4) * 1000);
}
function showQuestion() {
  var q = quiz.questions[quiz.i];
  quiz.answered = false;
  quizView("quizPlay");
  $("quizCount").textContent = "Question " + (quiz.i + 1) + " of " + quiz.questions.length;
  $("quizPrompt").textContent = q.type === "ear" ? "Listen, then name the rudiment." : "Read the notation, then name the rudiment.";
  $("quizFeedback").textContent = "";
  $("quizReveal").textContent = "";
  $("btnQuizNext").hidden = true;
  $("btnQuizPlay").textContent = "Play it";
  var media = document.querySelector(".quiz-media");
  media.dataset.kind = q.type;
  $("quizCard").textContent = "";
  $("quizCardDesc").textContent = "";
  if (q.type === "eye") {
    var r = Core.RUDIMENT_MAP[q.answer];
    mountCard($("quizCard"), Core.notationCard(r), "Notation to name, right-hand lead",
      function () { return quiz && quiz.questions[quiz.i] === q; });
    // No name in it: describePattern speaks of strokes, never of the rudiment.
    $("quizCardDesc").textContent = Core.describePattern(Core.withLead(r, "R"));
    $("quizCard").setAttribute("aria-describedby", "quizCardDesc");
  }
  var host = $("quizChoices");
  host.textContent = "";
  q.choices.forEach(function (id, n) {
    var b = el("button", "quiz-choice");
    b.type = "button"; b.dataset.id = id;
    var mark = el("span", "mark"); mark.setAttribute("aria-hidden", "true");
    var name = el("span"); name.textContent = Core.RUDIMENT_MAP[id].name;
    b.appendChild(mark); b.appendChild(name);
    host.appendChild(b);
  });
  if (q.type === "ear") { playQuizSample(q.answer); }
  var first = host.querySelector("button"); if (first) first.focus();
}
function answerQuiz(id) {
  if (!quiz || quiz.answered) return;
  var q = quiz.questions[quiz.i];
  quiz.answered = true;
  quiz.picks[quiz.i] = id;
  stopQuizSample();
  var right = id === q.answer;
  $("quizChoices").querySelectorAll("button").forEach(function (b) {
    b.disabled = true;
    var mark = b.firstChild;
    if (b.dataset.id === q.answer) { b.classList.add("right"); mark.textContent = "\u2713"; }
    else if (b.dataset.id === id) { b.classList.add("wrong"); mark.textContent = "\u2717"; }
  });
  var r = Core.RUDIMENT_MAP[q.answer];
  $("quizFeedback").textContent = right ? "Correct \u2014 " + r.name + "." : "Not quite. It was " + r.name + ".";
  if (q.type === "ear") {
    // Show what they heard, written down.
    mountCard($("quizReveal"), Core.notationCard(r), r.name + " written in notation, right-hand lead",
      function () { return quiz && quiz.questions[quiz.i] === q; });
  }
  var last = quiz.i === quiz.questions.length - 1;
  var next = $("btnQuizNext");
  next.textContent = last ? "See my score" : "Next";
  next.hidden = false;
  next.focus();
}
function nextQuizQuestion() {
  if (!quiz || !quiz.answered) return;
  if (quiz.i < quiz.questions.length - 1) { quiz.i++; showQuestion(); return; }
  var res = Core.scoreQuiz(quiz.questions, quiz.picks);
  quizView("quizDone");
  $("quizScore").textContent = "You got " + res.correct + " of " + res.total + ".";
  var host = $("quizMissed");
  host.textContent = "";
  if (!res.missed.length) {
    var p = el("p", "hint"); p.textContent = "Every one right. Try a harder level, or by ear only."; host.appendChild(p);
    return;
  }
  var h = el("p", "hint"); h.textContent = "Worth another look:"; host.appendChild(h);
  var ul = el("ul");
  res.missed.forEach(function (id) {
    var li = el("li"), t = el("strong"); t.textContent = Core.RUDIMENT_MAP[id].name;
    var b = el("button", "btn ghost mini"); b.type = "button"; b.textContent = "Practice it";
    b.setAttribute("aria-label", "Practice " + Core.RUDIMENT_MAP[id].name);
    b.addEventListener("click", function () { $("workspace-quiz").close(); chooseDrill(id, null); });
    li.appendChild(t); li.appendChild(b); ul.appendChild(li);
  });
  host.appendChild(ul);
}

/* ---------------- routines ----------------
   A routine is up to Core.ROUTINE_MAX saved drills played in order. Each item
   is run through the same path as a hand-started drill: its settings are
   borrowed (nothing is saved while it runs), the app starts it with its own
   count-in, and when it finishes the next one starts. When the routine ends,
   or the student touches anything structural, the student's own settings come
   back. The routine itself lives in its own key, and a link's ?routine= is
   used for the session without overwriting the saved one until it is edited. */
var ROUTINE_KEY = "rudimentroom-routine";
var routine = [];
var routineRun = null; // { items, index, snapshot, runs } while a routine is playing
function loadRoutine() {
  try { routine = Core.sanitizeRoutine(JSON.parse(localStorage.getItem(ROUTINE_KEY))); }
  catch (e) { routine = []; }
  var link = Core.decodeRoutine(new URLSearchParams(location.search).get("routine"));
  if (link.length) routine = link;
}
function saveRoutine() {
  try { localStorage.setItem(ROUTINE_KEY, JSON.stringify(routine)); } catch (e) { /* private mode */ }
}
function routineMsg(text) { $("rtMeta").textContent = text; }
function renderRoutine() {
  var host = $("rtList");
  host.textContent = "";
  routine.forEach(function (it, i) {
    var li = el("li");
    if (routineRun && routineRun.index === i) li.setAttribute("aria-current", "true");
    var text = el("span", "rt-text");
    text.textContent = (i + 1) + ". " + Core.describeRoutineItem(it);
    li.appendChild(text);
    [["up", "\u2191", "Move up", i === 0], ["down", "\u2193", "Move down", i === routine.length - 1],
     ["remove", "\u2715", "Remove", false]].forEach(function (b) {
      var btn = el("button", "rt-btn");
      btn.type = "button"; btn.textContent = b[1]; btn.dataset.act = b[0]; btn.dataset.i = i;
      btn.setAttribute("aria-label", b[2] + ": drill " + (i + 1));
      btn.disabled = b[3] || !!routineRun;
      li.appendChild(btn);
    });
    host.appendChild(li);
  });
  $("rtEmpty").hidden = routine.length > 0;
  $("rtStart").disabled = routine.length === 0 || !!routineRun;
  $("rtClear").disabled = routine.length === 0 || !!routineRun;
  $("rtAdd").disabled = !!routineRun || routine.length >= Core.ROUTINE_MAX;
  $("rtRepsWrap").hidden = settings.mode !== "fixed";
  if (!routineRun) routineMsg(routine.length
    ? routine.length + (routine.length === 1 ? " drill" : " drills") + " \u00b7 about " + fmtDuration(Core.routineSeconds(routine)) + " total" +
      (routine.length >= Core.ROUTINE_MAX ? " \u00b7 full" : "")
    : "");
}
function addRoutineDrill() {
  if (routineRun) return;
  if (routine.length >= Core.ROUTINE_MAX) { routineMsg("A routine holds up to " + Core.ROUTINE_MAX + " drills."); return; }
  readAllFields();
  var reps = settings.mode === "fixed" ? clampField("rtReps") : undefined;
  var item;
  try { item = Core.routineItem(Object.assign({}, settings, { lead: effectiveLead() }), reps); }
  catch (e) { routineMsg("This drill cannot be added: " + (e.message || "check its settings") + "."); return; }
  routine.push(item);
  saveRoutine();
  renderRoutine();
}
function onRoutineListClick(e) {
  var btn = e.target.closest("button");
  if (!btn || btn.disabled || routineRun) return;
  var i = +btn.dataset.i, act = btn.dataset.act;
  if (act === "remove") routine.splice(i, 1);
  else if (act === "up" && i > 0) routine.splice(i - 1, 0, routine.splice(i, 1)[0]);
  else if (act === "down" && i < routine.length - 1) routine.splice(i + 1, 0, routine.splice(i, 1)[0]);
  saveRoutine();
  renderRoutine();
  // The list rebuilds, so put focus back on the control that was used: the same
  // button on the item that moved, the other direction if it has reached an end,
  // or the neighbour after a removal.
  var at = act === "up" ? i - 1 : act === "down" ? i + 1 : Math.min(i, routine.length - 1);
  var sel = function (a, n) { return $("rtList").querySelector('button[data-act="' + a + '"][data-i="' + n + '"]:not(:disabled)'); };
  var again = act === "remove" ? (sel("remove", at) || $("rtAdd"))
    : (sel(act, at) || sel(act === "up" ? "down" : "up", at) || sel("remove", at));
  if (again) again.focus();
}
function clearRoutine() {
  if (routineRun || !routine.length) return;
  routine = [];
  saveRoutine();
  renderRoutine();
}
function applyRoutineItem(it) {
  settings.rudimentId = it.rudimentId;
  settings.lead = it.lead;
  settings.mode = it.mode;
  settings.turn = it.turn;
  settings.dynamics = it.dynamics;
  if (it.mode === "fixed") settings.bpm = it.p.bpm;
  else if (it.mode === "ladder") Object.assign(settings.ladder, it.p);
  else if (it.mode === "oco") Object.assign(settings.oco, it.p);
  else Object.assign(settings.build, it.p);
}
function showSettingsEverywhere() {
  hydrateControls();
  renderRudimentInfo();
  renderSticking();
  syncPlanPreview();
}
function startRoutine() {
  if (!routine.length || routineRun) return;
  resetPractice();
  routineRun = { items: routine.slice(), index: 0, snapshot: JSON.parse(JSON.stringify(settings)), runs: [] };
  runRoutineItem();
}
function runRoutineItem() {
  applyRoutineItem(routineRun.items[routineRun.index]);
  showSettingsEverywhere();
  primeDisplay();
  renderRoutine();
  startPlayback();
  if (live.status !== "playing") { endRoutine(); primeDisplay(); updateStartBtn(); }
}
// Put the student's own settings back. Safe to call when no routine is running.
function endRoutine() {
  if (!routineRun) return;
  var snap = routineRun.snapshot;
  routineRun = null;
  Object.keys(snap).forEach(function (k) { settings[k] = snap[k]; });
  showSettingsEverywhere();
  renderRoutine();
}
function advanceRoutine() {
  if (live.lastRun) routineRun.runs.push(live.lastRun);
  routineRun.index++;
  if (routineRun.index < routineRun.items.length) { runRoutineItem(); return; }
  var total = routineRun.items.length, runs = routineRun.runs.slice();
  endRoutine();
  live.lastRun = null;
  live.lastRoutine = { total: total, runs: runs };
  setBanner("complete", "Routine complete \u2713");
  setStatus("Nice work. " + total + (total === 1 ? " drill" : " drills") + " done. Copy the log, or start again.");
  renderLogRow();
}

/* Class view: the sticking and tempo large for a projector or a shared screen,
   with the setup panels out of the way. It changes layout only; the drill and
   the transport are untouched, so it can be switched on and off mid-run. */
function setClassView(on) {
  document.body.classList.toggle("class-view", on);
  $("btnClassView").setAttribute("aria-pressed", on ? "true" : "false");
  $("btnClassView").lastElementChild.textContent = on ? "Exit class view" : "Class view";
}
function copyShareLink() {
  var url = shareUrl();
  var ok = function () { flashShare("Copied ✓"); };
  var fail = function () { if (fallbackCopy(url)) ok(); else flashShare("Copy failed"); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok).catch(fail);
  else fail();
}
function fallbackCopy(text) {
  try {
    var ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    var done = document.execCommand("copy");
    document.body.removeChild(ta);
    return done;
  } catch (e) { return false; }
}
var shareTimer = null;
function flashShare(msg) {
  var b = $("btnShare");
  b.textContent = msg;
  if (shareTimer) clearTimeout(shareTimer);
  shareTimer = setTimeout(function () { b.textContent = "Copy link"; }, 1600);
}

function updateCueEnabled() { $("cueToggle").disabled = settings.pulse; }

function hydrateControls() {
  $("bpm").value = settings.bpm;
  $("ladStart").value = settings.ladder.startBpm;
  $("ladEnd").value = settings.ladder.endBpm;
  $("ladStep").value = settings.ladder.stepBpm;
  $("ladReps").value = settings.ladder.repsPerStep;
  $("ocoStart").value = settings.oco.startBpm;
  $("ocoPeak").value = settings.oco.peakBpm;
  $("ocoStep").value = settings.oco.stepBpm;
  $("ocoReps").value = settings.oco.repsPerStep;
  $("buBpm").value = settings.build.bpm;
  $("buReps").value = settings.build.repsPerStep;
  $("cueToggle").checked = settings.cue;
  $("pulseToggle").checked = settings.pulse;
  updateCueEnabled();
  updateMuteBtn();
  setSeg("segLead", settings.lead);
  setSeg("segMode", settings.mode);
  setSeg("segSound", settings.sound);
  setSeg("segTurn", String(settings.turn));
  $("turnHint").textContent = TURN_HINT[settings.turn];
  setSeg("segDynamics", settings.dynamics);
  $("dynHint").textContent = DYNAMICS_HINT[settings.dynamics];
  if (settings.sound === "marching") loadMarching();
  $("soundHint").textContent = soundHint(settings.sound);
  $("settingsFixed").hidden = settings.mode !== "fixed";
  $("settingsLadder").hidden = settings.mode !== "ladder";
  $("settingsOco").hidden = settings.mode !== "oco";
  $("settingsBuild").hidden = settings.mode !== "build";
  $("modeHint").textContent = MODE_HINT[settings.mode];
}

/* The rudiment list and the settings each float over the page from their own bar, so each panel
   closes the way a popover does: Escape (focus returns to its bar), a tap outside, or full screen.
   From 1700px the settings are a column beside the practice; the CSS shows it and hides its bar. */
function wireSetupPanel() {
  var toggle = $("setupToggle"), panel = $("setupPanel");
  var sToggle = $("settingsToggle"), sBody = $("settingsBody");
  function isOpen(el) { return el.getAttribute("data-open") === "true"; }
  function setOpen(open) {
    panel.setAttribute("data-open", open ? "true" : "false");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }
  function setSettingsOpen(open) {
    sBody.setAttribute("data-open", open ? "true" : "false");
    sToggle.setAttribute("aria-expanded", open ? "true" : "false");
  }
  toggle.addEventListener("click", function () { setOpen(!isOpen(panel)); });
  sToggle.addEventListener("click", function () { setSettingsOpen(!isOpen(sBody)); });
  document.addEventListener("click", function (e) {
    if (isOpen(panel) && !(panel.contains(e.target) || toggle.contains(e.target))) setOpen(false);
    // A control in the settings can redraw itself; a detached target is not a tap outside.
    if (isOpen(sBody) && e.target.isConnected && !(sBody.contains(e.target) || sToggle.contains(e.target))) setSettingsOpen(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (isOpen(panel)) { setOpen(false); toggle.focus(); }
    else if (isOpen(sBody)) { setSettingsOpen(false); sToggle.focus(); }
  });
  document.addEventListener("fullscreenchange", function () {
    if (document.fullscreenElement) { setOpen(false); setSettingsOpen(false); }
  });
}

/* ---------------- events ---------------- */
function wireEvents() {
  $("btnStart").addEventListener("click", onStartButton);
  $("btnReset").addEventListener("click", resetPractice);
  $("btnShare").addEventListener("click", copyShareLink);
  $("btnQuiz").addEventListener("click", openQuiz);
  $("btnQuizStart").addEventListener("click", startQuiz);
  $("btnQuizNext").addEventListener("click", nextQuizQuestion);
  $("btnQuizAgain").addEventListener("click", openQuiz);
  $("btnQuizPlay").addEventListener("click", function () { if (quiz) playQuizSample(quiz.questions[quiz.i].answer); });
  $("quizChoices").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) answerQuiz(b.dataset.id); });
  $("workspace-quiz").addEventListener("close", function () { stopQuizSample(); });
  wireSeg("segQuizType", function (v) { quizType = v; });
  wireSeg("segQuizScope", function (v) { quizScope = v; $("quizSetupNote").textContent = ""; });
  $("learnedToggle").addEventListener("change", onLearnedToggle);
  $("btnSetGoal").addEventListener("click", onSetGoal);
  $("myGoal").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); onSetGoal(); } });
  $("btnClearGoal").addEventListener("click", function () { setMyGoal(null); });
  $("btnCopyProgress").addEventListener("click", copyProgress);
  $("btnNext").addEventListener("click", function () { var n = Core.pathStatus(progress).next; if (n) chooseDrill(n, null); });
  $("btnNudge").addEventListener("click", function () { var c = Core.closestToGoal(progress, bestLog); if (c) chooseDrill(c.id, c.lead); });
  $("rtAdd").addEventListener("click", addRoutineDrill);
  $("rtStart").addEventListener("click", startRoutine);
  $("rtClear").addEventListener("click", clearRoutine);
  $("rtList").addEventListener("click", onRoutineListClick);
  $("assignRoutine").addEventListener("change", renderAssignment);
  $("btnAssign").addEventListener("click", function () {
    $("goalInput").value = assignedGoal === null ? "" : assignedGoal;
    renderAssignment();
  });
  $("goalInput").addEventListener("input", renderAssignment);
  $("btnAssignCopy").addEventListener("click", copyAssignmentLink);
  $("btnAssignPrint").addEventListener("click", printAssignment);
  $("btnClassView").addEventListener("click", function () { setClassView(!document.body.classList.contains("class-view")); });
  $("btnFull").addEventListener("click", function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else (document.documentElement.requestFullscreen ||
          document.documentElement.webkitRequestFullscreen).call(document.documentElement);
  });

  wireSeg("segLead", applyLead);
  wireSeg("segMode", applyMode);
  wireSeg("segSound", applySound);
  wireSeg("segTurn", applyTurn);
  wireSeg("segDynamics", applyDynamics);

  document.querySelectorAll("button.step").forEach(function (b) {
    b.addEventListener("click", function () {
      var f = $(this.dataset.target);
      f.value = (Math.round(+f.value) || 0) + (+this.dataset.d);
      if (this.dataset.target === "bpm") onBpmChanged();
      else onModeFieldChanged();
    });
  });
  $("bpm").addEventListener("change", onBpmChanged);
  // Tempo stays on the main screen, in the docked bar, while the full control sits in the panel.
  [["bpmDown", -5], ["bpmUp", 5]].forEach(function (p) {
    $(p[0]).addEventListener("click", function () {
      $("bpm").value = (Math.round(+$("bpm").value) || 0) + p[1];
      onBpmChanged();
    });
  });
  wireSetupPanel();
  // A window resized across the wide-stage breakpoint re-lays the sticking rows, but never
  // under a running drill (the highlight lives on the cells).
  var onStageWidth = function () {
    if (live.status === "idle" || live.status === "complete") renderSticking();
  };
  if (WIDE_STAGE.addEventListener) WIDE_STAGE.addEventListener("change", onStageWidth);
  else if (WIDE_STAGE.addListener) WIDE_STAGE.addListener(onStageWidth);
  ["ladStart", "ladEnd", "ladStep", "ladReps", "ocoStart", "ocoPeak", "ocoStep", "ocoReps", "buBpm", "buReps"]
    .forEach(function (id) { $(id).addEventListener("change", onModeFieldChanged); });

  // The pulse and downbeat cue are not structural: toggling them applies from
  // the next cycle without stopping playback. Mute only moves the master gain.
  $("cueToggle").addEventListener("change", function (e) {
    settings.cue = e.target.checked;
    persistSettings();
  });
  $("pulseToggle").addEventListener("change", function (e) {
    settings.pulse = e.target.checked;
    persistSettings();
    updateCueEnabled();
  });
  $("btnMute").addEventListener("click", toggleMute);
  $("btnClean").addEventListener("click", onClean);
  $("btnCopyLog").addEventListener("click", copyPracticeLog);
  $("btnClearBest").addEventListener("click", onClearBest);
  $("btnBest").addEventListener("click", onBestStart);
  $("btnSuggested").addEventListener("click", function () {
    var r = Core.RUDIMENT_MAP[settings.rudimentId];
    $("bpm").value = r.tempo.suggestedLo;
    onBpmChanged();
  });

  // Keyboard: Space starts/pauses, R resets — but never steal Space from a
  // focused control (buttons must stay activatable by keyboard).
  document.addEventListener("keydown", function (e) {
    var tag = document.activeElement ? document.activeElement.tagName : "";
    var onControl = /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(tag);
    if (e.code === "Space" && !onControl) {
      e.preventDefault();
      onStartButton();
    } else if ((e.key === "r" || e.key === "R") && !/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) {
      resetPractice();
    }
  });

  // Returning to the tab: snap the display to hear-time, re-acquire wake lock.
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && live.status === "playing") { flushVisual(); requestWakeLock(); }
  });
}

/* ---------------- offline ----------------
   sw.js stores this build so the app opens and plays with no connection (its
   header has the rules). Not over file://, which has no worker and already
   runs from disk. The footer says so once the build is stored, and if a newer
   build takes over while this tab is open it says a reload will bring it in.
   It never reloads by itself: that would stop a student mid-practice. The
   check is for a stored page, not merely a worker, so the development copy of
   sw.js (which stores nothing) never claims to work offline. */
function initOffline() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  var sw = navigator.serviceWorker;
  var hadController = !!sw.controller;
  var say = function (text) { var n = $("offlineNote"); n.textContent = text; n.hidden = false; };
  sw.addEventListener("controllerchange", function () {
    if (hadController) say("A new build is ready. Reload when you finish practicing to use it.");
    hadController = true;
  });
  // After the page has loaded, so storing the build never competes with it.
  var register = function () { sw.register("sw.js").catch(function () {}); };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register);
  sw.ready.then(function () { return window.caches ? caches.match("./") : null; })
    .then(function (page) {
      if (page && !/new build/.test($("offlineNote").textContent)) {
        say("Saved for offline use: Rudiment Room opens and plays without a connection.");
      }
    })
    .catch(function () {});
}

/* ---------------- boot ----------------
   Validate the registry FIRST — bad rudiment data must fail loudly, not play
   wrong strokes. Then: defaults < saved settings < share-link params. */
(function boot() {
  try {
    Core.assertValidRegistry(Core.RUDIMENTS);
  } catch (e) {
    setErr(e.message);
    $("btnStart").disabled = true;
    $("statusLine").textContent = "Rudiment data failed validation — the app is disabled.";
    return;
  }
  coerceSettings(loadSaved());
  coerceSettings(queryToRaw());
  assignedGoal = parseGoal(new URLSearchParams(location.search).get("goal"));
  loadBest();
  loadProgress();
  loadRoutine();
  buildCards();
  applyFilters();
  hydrateControls();
  wireEvents();
  wireFilters();
  renderRudimentInfo();
  renderSticking();
  syncPlanPreview();
  primeDisplay();
  updateStartBtn();
  renderRoutine();
  initOffline();
})();
