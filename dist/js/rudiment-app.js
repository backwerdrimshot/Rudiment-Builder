"use strict";
/* Rudiment Builder — audio scheduler + UI on top of RudimentCore.
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

/* Stroke voices: right and left take different pitches and a gentle opposite
   pan; accents are brighter (square) and louder; grace notes reuse the hand's
   voice at the quiet grace tier. Count-in/transition blocks use the family's
   soft sine "listen" voice so the student HEARS "don't play yet". */
var STROKE_VOICE = {
  R: { f: 784, pan: 0.28 },   // G5, nudged right
  L: { f: 587, pan: -0.28 },  // D5, nudged left
};
function strokeSound(time, hand, velocity, accent) {
  var v = STROKE_VOICE[hand];
  var osc = audio.createOscillator();
  var g = audio.createGain();
  osc.frequency.value = v.f;
  osc.type = accent ? "square" : "triangle";
  var peak = 0.9 * velocity; // tiers come from the core (accent > normal > grace)
  var d = accent ? 0.07 : 0.05;
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(peak, time + 0.0015);
  g.gain.exponentialRampToValueAtTime(0.0001, time + d);
  osc.connect(g);
  var out = g;
  if (canPan) {
    var p = audio.createStereoPanner();
    p.pan.value = v.pan;
    g.connect(p);
    out = p;
  }
  out.connect(master);
  osc.start(time);
  osc.stop(time + d + 0.02);
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
        strokeSound(Math.max(gt, audio.currentTime + 0.001), ev.graces[i].hand, ev.graces[i].velocity, false);
      });
    }
    strokeSound(t, ev.hand, ev.velocity, ev.accent);
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
      '<span class="dot">·</span>' + r.level + "</span>";
    b.addEventListener("click", function () { selectRudiment(r.id); });
    g.cards.appendChild(b);
    var hay = (r.name + " " + r.family + " " + r.level + " pas " + r.pas + " #" + r.pas +
      " " + (r.aliases ? r.aliases.join(" ") : "")).toLowerCase();
    cardIndex.push({ el: b, fam: r.family, level: r.level, hay: hay });
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
function applyLead(lead) {
  stopIfActive();
  settings.lead = lead;
  persistSettings();
  renderSticking();
  syncPlanPreview();
  primeDisplay();
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
    // muted is deliberately NOT read from links — a shared drill never arrives silent
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
