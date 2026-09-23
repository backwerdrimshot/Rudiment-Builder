"use strict";
/* Rudiment Room — audio scheduler + UI on top of RudimentCore.
   The lookahead scheduler, listen voice, pause-by-suspend, and visual queue
   are adapted from Tempo Ladder / Click Drop / Pulse Pocket. Layer boundaries:
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
  sound: "snare",
  bpm: 80,
  ladder: { startBpm: 60, endBpm: 100, stepBpm: 5, repsPerStep: 4 },
  oco: { startBpm: 60, peakBpm: 100, stepBpm: 5, repsPerStep: 2 },
};
var settings = JSON.parse(JSON.stringify(DEFAULTS));

/* ---------------- audio ---------------- */
var audio = null, master = null, canPan = false;
function initAudio() {
  if (audio) return;
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
    if (live.status !== "playing" || audio.state !== "suspended") return;
    if (!document.hidden) {
      audio.resume().catch(function () {});
      setTimeout(function () {
        if (live.status === "playing" && audio.state === "suspended") externalPause();
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
   the student chose and turns a buzz into its bounces (Core.buzzBounces) —
   before that, a buzz sounded as one plain stroke. Loudness always comes from
   the core's velocity tiers (accent > normal > grace); count-in/transition
   blocks keep the family's soft sine "listen" voice in either setting, so the
   student HEARS "don't play yet". A voice change is picked up by the next
   stroke scheduled, so it never needs to stop playback. */
function playStroke(time, hand, velocity, accent, buzzSeconds) {
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
// A two-stroke sample of the chosen voice when it is picked while nothing is
// playing. Never while paused: resuming the context to sound it would also
// unfreeze the paused plan.
function previewVoice() {
  if (live.status !== "idle" && live.status !== "complete") return;
  try { initAudio(); } catch (e) { return; }
  if (audio.state === "suspended") audio.resume();
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
};

/* One block's schedule. Listen blocks (count-in / transition) walk quarter
   clicks; play blocks walk the pattern's stroke events plus the optional
   downbeat cue. Rebuilt at every block boundary, so a tempo change or a cue
   toggle lands exactly on the boundary — never mid-cycle. */
function buildEntries() {
  var st = live.playback.currentStage();
  var list = [];
  if (st.kind !== "play") {
    for (var b = 0; b < st.beatsPerBlock; b++) list.push({ tBeats: b, type: "beat", beat: b });
  } else {
    if (settings.pulse) {
      // The pulse covers every beat (including the downbeat), so it supersedes
      // the lighter downbeat-only cue.
      for (var p = 0; p < st.beatsPerBlock; p++) list.push({ tBeats: p, type: "pulse", beat: p });
    } else if (settings.cue) {
      list.push({ tBeats: 0, type: "cue" });
    }
    live.events.forEach(function (e) { list.push({ tBeats: e.beatPos, type: "stroke", ev: e }); });
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
    finalBlock: pb.isFinalBlockOfStage(),
    nextStageBpm: next ? next.bpm : null,
    nextStageKind: next ? next.kind : null,
    nextPlayed: pb.nextPlayedBpm(),
    pendingBpm: pb.pendingBpm,
    beatsInBlock: st.beatsPerBlock,
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
  } else {
    var ev = en.ev;
    if (ev.graces.length) {
      var lead = Core.graceLeadSeconds(st.bpm, live.pattern.slotsPerBeat);
      Core.graceTimes(t, ev.graces.length, lead).forEach(function (gt, i) {
        playStroke(Math.max(gt, audio.currentTime + 0.001), ev.graces[i].hand, ev.graces[i].velocity, false, 0);
      });
    }
    playStroke(t, ev.hand, ev.velocity, ev.accent,
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
};

var lastStatusHTML = "", lastBannerKey = "";
function setStatus(html) {
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
  pw.textContent = PHASE_LABEL[ev.phase] || "";
  pw.className = "phase-word" + (ev.phase === "peak" ? " peak" : "");

  var nb = ev.pendingBpm != null ? ev.pendingBpm : ev.nextPlayed;
  $("nextBpm").innerHTML = nb != null ? nb + "<small> BPM</small>" : "—";

  renderPips(ev.beatsInBlock);
  lightPip(ev.beat);

  $("sticking").classList.toggle("listening", ev.kind !== "play");
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
    if (ev.pendingBpm != null) {
      setBanner("warn", "Tempo change at the next cycle → " + ev.pendingBpm + " BPM");
    } else if (ev.finalBlock && ev.nextStageKind === "play" &&
               ev.nextStageBpm != null && ev.nextStageBpm !== ev.bpm) {
      // Open-close-open changes seamlessly — warn on the final cycle.
      setBanner("warn", "Tempo change next cycle → " + ev.nextStageBpm + " BPM");
    } else {
      setBanner("", "");
    }
    setStatus("Rep <strong>" + ev.rep + "</strong>" + (ev.reps ? " of " + ev.reps : "") +
      (ev.stepCount > 1 ? " · Step <strong>" + ev.step + "</strong> of " + ev.stepCount : ""));
  }
}

/* ---------------- sticking display ---------------- */
function renderSticking() {
  live.pattern = Core.withLead(Core.RUDIMENT_MAP[settings.rudimentId], settings.lead);
  live.events = Core.expandPattern(live.pattern);
  var p = live.pattern;
  var host = $("sticking");
  host.innerHTML = "";
  host.classList.remove("listening");
  cellRefs = [];
  currentCell = null;

  var spb = p.slotsPerBeat;
  var beatsPerRow = Math.max(1, Math.floor(8 / spb)); // keep rows phone-sized

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
  $("stickName").textContent = p.name;
  $("stickSub").textContent = (p.lead === "R" ? "Right" : "Left") + "-hand lead · " + r.subdivision +
    " · " + p.cycleBeats + "-beat cycle";
  $("stickingDesc").textContent = p.name + ", " + (p.lead === "R" ? "right" : "left") +
    "-hand lead, " + r.subdivision.toLowerCase() + ". " + Core.describePattern(p);
  renderNotation(r, p.mirrored);
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
  var label = r.name + " written in notation, right-hand lead";
  fetchNotation(file).then(function (source) {
    if (notationShown !== file) return; // another rudiment was chosen meanwhile
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
var filters = { q: "", family: "all", level: "all" };

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
      '<span class="rbest" hidden></span>';
    b.addEventListener("click", function () { selectRudiment(r.id); });
    g.cards.appendChild(b);
    var hay = (r.name + " " + r.family + " " + r.level + " pas " + r.pas + " #" + r.pas +
      " " + (r.aliases ? r.aliases.join(" ") : "")).toLowerCase();
    cardIndex.push({ el: b, id: r.id, best: b.querySelector(".rbest"), fam: r.family, level: r.level, hay: hay });
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
  $("filterCount").textContent = "Showing " + shown + " of " + total +
    (scope.length ? " · " + scope.join(" · ") : "");
}

function wireFilters() {
  $("rudSearch").addEventListener("input", function (e) {
    filters.q = e.target.value; applyFilters();
  });
  wireChipGroup("familyFilter", "fam", function (v) { filters.family = v; });
  wireChipGroup("levelFilter", "lvl", function (v) { filters.level = v; });
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
  if (settings.mode === "fixed") return Core.buildPlan("fixed", { bpm: settings.bpm }, live.pattern);
  if (settings.mode === "ladder") return Core.buildPlan("ladder", settings.ladder, live.pattern);
  return Core.buildPlan("oco", settings.oco, live.pattern);
}

function startPlayback() {
  clearErr();
  readAllFields();
  var plan;
  try { plan = buildPlanFromSettings(); }
  catch (e) { setErr(e.message || "Check the settings and try again."); return; }

  try { initAudio(); }
  catch (e) { setErr("This browser can't play audio here. Try Chrome, Edge, Firefox, or Safari."); return; }
  if (audio.state === "suspended") audio.resume();

  // Idempotent: tear down any running scheduler + orphan scheduled sources so
  // rapid Start presses (or Start again) can never stack schedulers or double
  // audio. Changing rudiment/lead/mode also lands here via stopIfActive().
  teardownTimers();
  killPending();

  live.playback = Core.createPracticePlayback(plan);
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
  if (audio) { killPending(); if (audio.state === "suspended") audio.resume(); }
  live.status = "idle";
  live.playback = null;
  live.heard = null;
}

// Any structural change during playback (rudiment, lead, mode, ladder/OCO
// numbers) stops cleanly first — the next Start builds a fresh plan.
function stopIfActive() {
  if (live.status === "playing" || live.status === "paused") {
    stopPlayback();
    primeDisplay();
    updateStartBtn();
  }
}

function resetPractice() {
  stopPlayback();
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
  setBanner("complete", settings.mode === "oco"
    ? "Open–close–open complete ✓"
    : "Ladder complete ✓");
  setStatus("Nice work. Start again, or change the settings.");
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
  $("btnClearBest").hidden = !rec;
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
  renderBest();
  $("cleanNote").textContent = "Cleared the best clean tempos for " +
    Core.RUDIMENT_MAP[settings.rudimentId].name + ".";
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
  ladder: "Climb (or descend) from start to end. Between tempos: four listen-only clicks at the NEW tempo.",
  oco: "Slow to the peak and back down, in steps. Tempo changes are seamless at a cycle boundary — watch for the warning.",
};
function applyMode(mode) {
  stopIfActive();
  settings.mode = mode;
  $("settingsFixed").hidden = mode !== "fixed";
  $("settingsLadder").hidden = mode !== "ladder";
  $("settingsOco").hidden = mode !== "oco";
  $("modeHint").textContent = MODE_HINT[mode];
  persistSettings();
  syncPlanPreview();
  primeDisplay();
}
/* Not structural: the next stroke scheduled takes the new voice, so this
   never stops playback — and it is not part of a shared drill. */
var SOUND_HINT = {
  snare: "Both hands sound like the drum; the right sits a little right, the left a little left.",
  tones: "The right hand plays a higher tone than the left, so you can hear the sticking.",
};
function applySound(sound) {
  settings.sound = sound;
  persistSettings();
  $("soundHint").textContent = SOUND_HINT[sound];
  previewVoice();
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
}

function fmtDuration(secs) {
  var mm = Math.floor(secs / 60), ss = Math.round(secs % 60);
  if (ss === 60) { mm++; ss = 0; }
  return mm + ":" + (ss < 10 ? "0" : "") + ss;
}

function syncPlanPreview() {
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
  if (settings.mode === "fixed") {
    wrap.innerHTML = '<span class="rung">' + settings.bpm + ' BPM</span> <span class="hint">— loops until you stop it</span>';
    meta.textContent = "One cycle = " + live.pattern.cycleBeats + " beats · count-in first";
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
  meta.textContent = plan.rungs.length + " steps · " + cycles + " cycles · about " + fmtDuration(secs) + " total";
}

/* ---------------- remembered settings + shareable link ----------------
   Precedence: built-in defaults < last-used (localStorage) < a shared link's
   query params. Every value is validated on the way in. */
// Deliberately still "rudimentbuilder-" after the rename to Rudiment Room:
// this key holds a returning student's saved tempo, mode and lead. Renaming
// it would silently hand every existing user a factory reset.
var STORE_KEY = "rudimentbuilder-settings";
function persistSettings() {
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
  if (raw.mode === "fixed" || raw.mode === "ladder" || raw.mode === "oco") settings.mode = raw.mode;
  if (typeof raw.cue === "boolean") settings.cue = raw.cue;
  if (typeof raw.pulse === "boolean") settings.pulse = raw.pulse;
  if (typeof raw.muted === "boolean") settings.muted = raw.muted;
  if (raw.sound === "snare" || raw.sound === "tones") settings.sound = raw.sound;
  var n;
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
}
function queryToRaw() {
  var q = new URLSearchParams(location.search);
  if (![...q.keys()].length) return null;
  return {
    rudimentId: q.get("r"), lead: q.get("lead"), mode: q.get("mode"),
    cue: q.get("cue") === null ? undefined : q.get("cue") === "1",
    pulse: q.get("pulse") === null ? undefined : q.get("pulse") === "1",
    // muted is deliberately NOT read from links — a shared drill never arrives silent.
    // Nor is sound: which voice plays the strokes is the listener's choice, not the drill's.
    bpm: q.get("bpm"),
    ladder: { startBpm: q.get("ls"), endBpm: q.get("le"), stepBpm: q.get("lst"), repsPerStep: q.get("lr") },
    oco: { startBpm: q.get("os"), peakBpm: q.get("op"), stepBpm: q.get("ost"), repsPerStep: q.get("or") },
  };
}
function shareUrl() {
  var p = new URLSearchParams();
  p.set("r", settings.rudimentId);
  p.set("lead", settings.lead);
  p.set("mode", settings.mode);
  p.set("cue", settings.cue ? "1" : "0");
  p.set("pulse", settings.pulse ? "1" : "0");
  if (settings.mode === "fixed") p.set("bpm", settings.bpm);
  if (settings.mode === "ladder") {
    p.set("ls", settings.ladder.startBpm); p.set("le", settings.ladder.endBpm);
    p.set("lst", settings.ladder.stepBpm); p.set("lr", settings.ladder.repsPerStep);
  }
  if (settings.mode === "oco") {
    p.set("os", settings.oco.startBpm); p.set("op", settings.oco.peakBpm);
    p.set("ost", settings.oco.stepBpm); p.set("or", settings.oco.repsPerStep);
  }
  return location.origin + location.pathname + "?" + p.toString();
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
  $("cueToggle").checked = settings.cue;
  $("pulseToggle").checked = settings.pulse;
  updateCueEnabled();
  updateMuteBtn();
  setSeg("segLead", settings.lead);
  setSeg("segMode", settings.mode);
  setSeg("segSound", settings.sound);
  $("soundHint").textContent = SOUND_HINT[settings.sound];
  $("settingsFixed").hidden = settings.mode !== "fixed";
  $("settingsLadder").hidden = settings.mode !== "ladder";
  $("settingsOco").hidden = settings.mode !== "oco";
  $("modeHint").textContent = MODE_HINT[settings.mode];
}

/* ---------------- events ---------------- */
function wireEvents() {
  $("btnStart").addEventListener("click", onStartButton);
  $("btnReset").addEventListener("click", resetPractice);
  $("btnShare").addEventListener("click", copyShareLink);
  $("btnFull").addEventListener("click", function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else (document.documentElement.requestFullscreen ||
          document.documentElement.webkitRequestFullscreen).call(document.documentElement);
  });

  wireSeg("segLead", applyLead);
  wireSeg("segMode", applyMode);
  wireSeg("segSound", applySound);

  document.querySelectorAll("button.step").forEach(function (b) {
    b.addEventListener("click", function () {
      var f = $(this.dataset.target);
      f.value = (Math.round(+f.value) || 0) + (+this.dataset.d);
      if (this.dataset.target === "bpm") onBpmChanged();
      else onModeFieldChanged();
    });
  });
  $("bpm").addEventListener("change", onBpmChanged);
  ["ladStart", "ladEnd", "ladStep", "ladReps", "ocoStart", "ocoPeak", "ocoStep", "ocoReps"]
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
  loadBest();
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
})();
