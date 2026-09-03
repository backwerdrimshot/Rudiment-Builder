/* Rudiment Builder core test cases — runner-agnostic.
   Each case is { name, fn(assert, core) } where assert provides
   ok / equal / deepEqual. Run them either way:
     - Node:    node --test tests/        (wraps these in node:test)
     - Browser: open tests/test.html      (no tooling needed)

   Covers the product spec's required checks. Items that live in the audio /
   scheduler harness rather than the pure core are exercised in index.html and
   verified in the browser:
     - pause/resume cannot duplicate events (pause = AudioContext.suspend(),
       so the clock freezes and scheduled strokes stay valid — plus the
       snapshot/restore case below proves the position survives a rebuild)
     - rapid Start presses cannot stack schedulers (startPlayback tears down
       the previous interval and orphans scheduled sources first)
     - changing the rudiment, lead, or mode during playback stops the previous
       playback before the new pattern loads                                  */
(function (root) {
"use strict";

function getCases(core) {
  const MAP = core.RUDIMENT_MAP;

  // A small valid record used as the base for the invalid-data cases.
  function sampleRudiment() {
    return {
      id: "sample", name: "Sample", pas: 0, family: "Diddle", level: "Beginner",
      cycleBeats: 1, slotsPerBeat: 4, subdivision: "Sixteenth notes",
      tempo: { defaultBpm: 80, suggestedLo: 60, suggestedHi: 120 },
      leadingHand: "mirror", teachingNote: "Sample note.",
      counting: ["1", "e", "&", "a"],
      strokes: [
        { slot: 0, hand: "R", accent: true },
        { slot: 1, hand: "L" },
        { slot: 2, hand: "R", diddle: 1 },
        { slot: 3, hand: "R", diddle: 1 },
      ],
    };
  }

  // Break the sample with `mutate`, expect at least one error mentioning `hint`.
  function expectInvalid(assert, mutate, hint) {
    const r = sampleRudiment();
    mutate(r);
    const errs = core.validateRudiment(r);
    assert.ok(errs.length > 0, "expected errors after: " + hint);
    assert.ok(errs.some(function (e) { return e.indexOf(hint) !== -1; }),
      'expected an error mentioning "' + hint + '", got: ' + JSON.stringify(errs));
  }

  function hands(pattern) {
    return pattern.strokes.map(function (s) { return s.hand; }).join("");
  }

  // Hands of a pattern (primaries + graces) as plain data, and a reference
  // flip of that data — used for the involution check.
  function handArray(pattern) {
    return pattern.strokes.map(function (s) {
      return { hand: s.hand, graces: s.grace.map(function (g) { return g.hand; }) };
    });
  }
  function flipArray(arr) {
    const flip = function (h) { return h === "R" ? "L" : "R"; };
    return arr.map(function (x) { return { hand: flip(x.hand), graces: x.graces.map(flip) }; });
  }

  // Walk a playback machine to completion, one row per block.
  function walkBlocks(pb, cap) {
    const rows = [];
    let guard = cap || 10000;
    while (!pb.done && guard-- > 0) {
      rows.push({
        kind: pb.currentStage().kind, bpm: pb.currentBpm(), phase: pb.phase(),
        step: pb.stepNumber(), stepCount: pb.stepCount(), rep: pb.repNumber(),
        listening: pb.isListening(), final: pb.isFinalBlockOfStage(),
        nextPlayed: pb.nextPlayedBpm(),
      });
      pb.advanceBlock();
    }
    return rows;
  }

  function threw(fn) { try { fn(); return false; } catch (e) { return true; } }

  function pattern(id, lead) { return core.withLead(MAP[id], lead || "R"); }

  function plan(mode, settings, id, lead) {
    return core.buildPlan(mode, settings, pattern(id, lead));
  }

  return [

  /* ================= data validation ================= */

  { name: "registry: the full PAS 40 catalog validates", fn: function (assert) {
    assert.ok(core.assertValidRegistry(core.RUDIMENTS), "registry valid");
    assert.equal(core.RUDIMENTS.length, 40, "ships all 40 PAS International Drum Rudiments");
    ["single-paradiddle", "flam-accent", "five-stroke-roll", "multiple-bounce-roll", "triple-stroke-roll"]
      .forEach(function (id) { assert.ok(MAP[id], id + " present"); });
  }},

  { name: "catalog: PAS numbers cover 1..40 exactly once, every id unique", fn: function (assert) {
    const pas = core.RUDIMENTS.map(function (r) { return r.pas; }).sort(function (a, b) { return a - b; });
    const expected = []; for (let n = 1; n <= 40; n++) expected.push(n);
    assert.deepEqual(pas, expected, "PAS 1..40 present exactly once, no gaps or dups");
    const ids = {};
    core.RUDIMENTS.forEach(function (r) {
      assert.ok(!ids[r.id], "duplicate id " + r.id);
      ids[r.id] = true;
    });
  }},

  { name: "catalog: family split matches the PAS grouping and every level is known", fn: function (assert) {
    const by = { Roll: 0, Diddle: 0, Flam: 0, Drag: 0 };
    core.RUDIMENTS.forEach(function (r) { by[r.family]++; });
    assert.deepEqual(by, { Roll: 15, Diddle: 4, Flam: 11, Drag: 10 }, "15 rolls, 4 diddles, 11 flams, 10 drags");
    core.RUDIMENTS.forEach(function (r) {
      assert.ok(["Beginner", "Intermediate", "Advanced"].indexOf(r.level) !== -1, r.id + " has a known level");
    });
  }},

  { name: "educational lineage: every rudiment carries its PAS number and NARD heritage", fn: function (assert) {
    core.RUDIMENTS.forEach(function (r) {
      assert.ok(Number.isInteger(r.pas) && r.pas >= 1 && r.pas <= 40, r.id + " has a PAS 40 number");
      assert.ok(typeof r.heritage === "string" && r.heritage.length > 0, r.id + " has a heritage chip");
    });
    // These foundational rudiments trace to the N.A.R.D. Standard 26. The exact
    // heritage wording is a pedagogy decision that lives in the data, so assert
    // the lineage rather than a fixed label.
    ["five-stroke-roll", "flam-accent", "single-paradiddle"].forEach(function (id) {
      assert.ok(MAP[id].heritage.indexOf("NARD") !== -1, id + " carries a NARD heritage");
    });
  }},

  { name: "registry: definitions are deep-frozen (transforms must copy)", fn: function (assert) {
    assert.ok(threw(function () { MAP["single-paradiddle"].strokes[0].hand = "L"; }),
      "mutating a frozen stroke throws in strict mode");
    assert.equal(MAP["single-paradiddle"].strokes[0].hand, "R", "value unchanged");
  }},

  { name: "invalid data fails clearly (one message per broken field)", fn: function (assert) {
    expectInvalid(assert, function (r) { delete r.id; }, "missing id");
    expectInvalid(assert, function (r) { r.family = "Groove"; }, "unknown family");
    expectInvalid(assert, function (r) { delete r.teachingNote; }, "missing teachingNote");
    expectInvalid(assert, function (r) { r.strokes[1].hand = "X"; }, 'hand must be "R" or "L"');
    expectInvalid(assert, function (r) { r.strokes[1].slot = 0; }, "overlaps");
    expectInvalid(assert, function (r) { r.strokes[1].slot = 99; }, "slot must be an integer");
    expectInvalid(assert, function (r) { r.strokes[1].duration = 4; }, "crosses a beat boundary");
    expectInvalid(assert, function (r) { r.strokes = []; }, "non-empty");
    expectInvalid(assert, function (r) { r.counting.pop(); }, "counting");
    expectInvalid(assert, function (r) { r.tempo.defaultBpm = 20; }, "tempo.defaultBpm");
    expectInvalid(assert, function (r) { r.tempo.defaultBpm = 150; }, "suggested range");
    expectInvalid(assert, function (r) { r.strokes[0].velocity = 2; }, "velocity");
    expectInvalid(assert, function (r) { r.leadingHand = "either"; }, "leadingHand");
    expectInvalid(assert, function (r) { r.heritage = 26; }, "heritage");
  }},

  { name: "invalid diddle structures fail clearly", fn: function (assert) {
    expectInvalid(assert, function (r) { delete r.strokes[3].diddle; }, "exactly 2 strokes");
    expectInvalid(assert, function (r) { r.strokes[3].hand = "L"; }, "same hand");
    expectInvalid(assert, function (r) { // same hand but not adjacent
      r.strokes[1] = { slot: 1, hand: "R", diddle: 9 };
      r.strokes[3] = { slot: 3, hand: "R", diddle: 9 };
      r.strokes[2] = { slot: 2, hand: "L" };
    }, "consecutive");
  }},

  { name: "invalid grace notes fail clearly", fn: function (assert) {
    expectInvalid(assert, function (r) { r.strokes[0].grace = []; }, "1 (flam) or 2 (drag)");
    expectInvalid(assert, function (r) { r.strokes[0].grace = [{ hand: "R" }]; }, "opposite hand");
    expectInvalid(assert, function (r) { r.strokes[0].grace = [{ hand: "Q" }]; }, 'hand must be "R" or "L"');
  }},

  { name: "assertValidRegistry throws one error naming every problem", fn: function (assert) {
    const bad = sampleRudiment(); delete bad.name; bad.strokes[0].hand = "Z";
    const dup = sampleRudiment(); // same id as bad -> duplicate
    let msg = "";
    try { core.assertValidRegistry([bad, dup]); } catch (e) { msg = e.message; }
    assert.ok(msg.indexOf("missing name") !== -1, "names the missing field");
    assert.ok(msg.indexOf("hand") !== -1, "names the bad hand");
    assert.ok(msg.indexOf("duplicate id") !== -1, "names the duplicate id");
  }},

  /* ================= leading hand ================= */

  { name: "paradiddle: right lead is RLRR LRLL, left lead is the exact mirror", fn: function (assert) {
    assert.equal(hands(pattern("single-paradiddle", "R")), "RLRRLRLL", "right lead");
    assert.equal(hands(pattern("single-paradiddle", "L")), "LRLLRLRR", "left lead");
  }},

  { name: "flam accent: left lead mirrors the grace hands too", fn: function (assert) {
    const left = pattern("flam-accent", "L");
    assert.equal(hands(left), "LRLRLR", "primary hands mirrored");
    assert.deepEqual(left.strokes[0].grace, [{ hand: "R" }], "grace mirrored on stroke 1");
    assert.deepEqual(left.strokes[3].grace, [{ hand: "L" }], "grace mirrored on stroke 4");
    left.strokes.forEach(function (s, i) {
      s.grace.forEach(function (g) {
        assert.ok(g.hand !== s.hand, "stroke " + i + ": grace stays on the opposite hand");
      });
    });
  }},

  { name: "five stroke roll: left lead swaps the doubles and the release", fn: function (assert) {
    assert.equal(hands(pattern("five-stroke-roll", "R")), "RRLLRLLRRL", "right lead");
    assert.equal(hands(pattern("five-stroke-roll", "L")), "LLRRLRRLLR", "left lead");
  }},

  { name: "PAS chart proofing 2026-08-25: corrected hybrids match the official chart", fn: function (assert) {
    // Pinned against the official 1984 PAS International Drum Rudiments chart
    // (Taylor's reference). hands = primary strokes in order, right lead;
    // accents/graced = stroke indices carrying an accent / grace notes.
    [
      { id: "flamacue",            hands: "RLRL",         accents: [1],     graced: [0] },
      { id: "swiss-army-triplet",  hands: "RRL",          accents: [0],     graced: [0] },
      { id: "inverted-flam-tap",   hands: "RLLR",         accents: [0, 2],  graced: [0, 2] },
      { id: "flam-drag",           hands: "RLLRLRRL",     accents: [0, 4],  graced: [0, 4] },
      { id: "single-drag-tap",     hands: "RLLR",         accents: [1, 3],  graced: [0, 2] },
      { id: "double-drag-tap",     hands: "RRLLLR",       accents: [2, 5],  graced: [0, 1, 3, 4] },
      { id: "lesson-25",           hands: "RLR",          accents: [2],     graced: [0] },
      { id: "single-dragadiddle",  hands: "RRLRRLLRLL",   accents: [0, 5],  graced: [] },
      { id: "drag-paradiddle-1",   hands: "RRLRRLLRLL",   accents: [0, 5],  graced: [1, 6] },
      { id: "drag-paradiddle-2",   hands: "RRRLRRLLLRLL", accents: [0, 6],  graced: [1, 2, 7, 8] },
      { id: "single-ratamacue",    hands: "RLRLLRLR",     accents: [3, 7],  graced: [0, 4] },
      { id: "double-ratamacue",    hands: "RRLRLLLRLR",   accents: [4, 9],  graced: [0, 1, 5, 6] },
      { id: "triple-ratamacue",    hands: "RRRLRLLLLRLR", accents: [5, 11], graced: [0, 1, 2, 6, 7, 8] },
    ].forEach(function (t) {
      const r = MAP[t.id];
      assert.ok(r, t.id + " exists");
      assert.equal(hands(r), t.hands, t.id + ": sticking matches the chart");
      const accents = [], graced = [];
      r.strokes.forEach(function (s, i) {
        if (s.accent) accents.push(i);
        if (s.grace) graced.push(i);
      });
      assert.deepEqual(accents, t.accents, t.id + ": accents on the chart's strokes");
      assert.deepEqual(graced, t.graced, t.id + ": grace notes on the chart's strokes");
    });
  }},

  { name: "PAS per-rudiment SVGs 2026-09-03: single-stroke lengths and the six stroke roll", fn: function (assert) {
    // Pinned against the SVGs PAS published per rudiment in May 2026
    // (pas.org/rudiment/<n>-<slug>/ → PAS-rud-NN.svg), which are drawn from the
    // same 1984 chart but one rudiment to a file, so lengths are unambiguous.
    const one = MAP["single-stroke-roll"];
    assert.equal(one.cycleBeats * one.slotsPerBeat, 8,
      "single stroke roll: eight thirty-seconds, as PAS-rud-01 draws it — not sixteen");
    assert.equal(hands(one), "RLRLRLRL", "single stroke roll: strict alternation");

    // PAS-rud-08 draws the six stroke roll as accent / rolled body / accent.
    // That is the CLOSED form of these same six strokes, not a rhythm we differ
    // on: the strokes and both accents match, so the data stands and the
    // shorthand lives in the poster's closed-roll layer.
    const six = MAP["six-stroke-roll"];
    assert.equal(hands(six), "RLLRRL", "six stroke roll: sticking matches the chart");
    const sixAccents = [];
    six.strokes.forEach(function (s, i) { if (s.accent) sixAccents.push(i); });
    assert.deepEqual(sixAccents, [0, 5], "six stroke roll: accents bracket the diddles");
  }},

  { name: "withLead never mutates the source definition", fn: function (assert) {
    const before = JSON.stringify(core.RUDIMENTS);
    ["single-paradiddle", "flam-accent", "five-stroke-roll"].forEach(function (id) {
      core.withLead(MAP[id], "L");
      core.withLead(MAP[id], "R");
    });
    assert.equal(JSON.stringify(core.RUDIMENTS), before, "registry byte-identical");
  }},

  { name: "mirroring twice returns the original sticking (involution)", fn: function (assert) {
    core.RUDIMENTS.forEach(function (r) {
      const right = pattern(r.id, "R"), left = pattern(r.id, "L");
      assert.deepEqual(flipArray(handArray(left)), handArray(right),
        r.id + ": flipping the left lead recovers the right lead");
      assert.deepEqual(flipArray(flipArray(handArray(right))), handArray(right),
        r.id + ": double flip is the identity");
    });
  }},

  { name: 'a "fixed" leading-hand rudiment ignores the lead control', fn: function (assert) {
    const r = sampleRudiment(); r.leadingHand = "fixed";
    assert.equal(core.validateRudiment(r).length, 0, "fixed sample is valid");
    assert.equal(hands(core.withLead(r, "L")), hands(core.withLead(r, "R")), "no mirroring");
    assert.equal(core.withLead(r, "L").mirrored, false, "marked unmirrored");
  }},

  { name: "withLead rejects a bad lead value", fn: function (assert) {
    assert.ok(threw(function () { core.withLead(MAP["single-paradiddle"], "both"); }), "throws");
  }},

  /* ================= expansion: ordering, accents, graces, diddles ================= */

  { name: "expansion: events are in strict time order for every rudiment", fn: function (assert) {
    core.RUDIMENTS.forEach(function (r) {
      ["R", "L"].forEach(function (lead) {
        const ev = core.expandPattern(pattern(r.id, lead));
        assert.equal(ev.length, r.strokes.length, r.id + ": one event per stroke");
        for (let i = 1; i < ev.length; i++)
          assert.ok(ev[i].beatPos > ev[i - 1].beatPos, r.id + " " + lead + ": strictly increasing at " + i);
        ev.forEach(function (e, i) { assert.equal(e.strokeIndex, i, "strokeIndex tracks the cell"); });
      });
    });
  }},

  { name: "expansion: paradiddle sits on the sixteenth grid of two beats", fn: function (assert) {
    const pos = core.expandPattern(pattern("single-paradiddle")).map(function (e) { return e.beatPos; });
    assert.deepEqual(pos, [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75], "eight sixteenths");
  }},

  { name: "expansion: five stroke roll leaves the release ringing (gap before the next double)", fn: function (assert) {
    const pos = core.expandPattern(pattern("five-stroke-roll")).map(function (e) { return e.beatPos; });
    assert.deepEqual(pos, [0, 0.25, 0.5, 0.75, 1, 2, 2.25, 2.5, 2.75, 3], "double-double-release, twice");
  }},

  { name: "accents: velocity tiers order accent > normal > grace", fn: function (assert) {
    assert.ok(core.VELOCITY.accent > core.VELOCITY.normal, "accent > normal");
    assert.ok(core.VELOCITY.normal > core.VELOCITY.grace, "normal > grace");
    const ev = core.expandPattern(pattern("single-paradiddle"));
    ev.forEach(function (e, i) {
      assert.equal(e.velocity, e.accent ? core.VELOCITY.accent : core.VELOCITY.normal,
        "stroke " + i + " uses its tier");
    });
    assert.deepEqual(ev.map(function (e) { return e.accent; }),
      [true, false, false, false, true, false, false, false], "accents on 1 and on beat 2 only");
  }},

  { name: "accents: five stroke roll accents exactly the two release strokes", fn: function (assert) {
    const ev = core.expandPattern(pattern("five-stroke-roll"));
    const accented = ev.map(function (e, i) { return e.accent ? i : -1; })
                       .filter(function (i) { return i >= 0; });
    assert.deepEqual(accented, [4, 9], "strokes 5 and 10");
    assert.equal(ev[4].beatPos, 1, "first release lands on beat 2");
    assert.equal(ev[9].beatPos, 3, "second release lands on beat 4");
  }},

  { name: "graces: flam accent has one opposite-hand grace on each flammed beat", fn: function (assert) {
    const ev = core.expandPattern(pattern("flam-accent"));
    assert.deepEqual(ev.map(function (e) { return e.graces.length; }),
      [1, 0, 0, 1, 0, 0], "flams on the two downbeats only");
    assert.equal(ev[0].graces[0].hand, "L", "right primary takes a left grace");
    assert.equal(ev[3].graces[0].hand, "R", "left primary takes a right grace");
    assert.equal(ev[0].graces[0].velocity, core.VELOCITY.grace, "grace tier");
    assert.ok(ev[0].accent && ev[3].accent, "the flammed notes carry the accents");
  }},

  { name: "graces: grace notes are scheduled just AHEAD of their primary", fn: function (assert) {
    const lead = core.graceLeadSeconds(80, 3);
    const t = 10;
    assert.deepEqual(core.graceTimes(t, 1, lead), [t - lead], "flam: one grace, one lead ahead");
    const drag = core.graceTimes(t, 2, lead);
    assert.deepEqual(drag, [t - 2 * lead, t - lead], "drag: two graces walking into the primary");
    drag.forEach(function (g) { assert.ok(g < t, "every grace precedes the primary"); });
  }},

  { name: "graces: the lead compresses at fast subdivisions (never eats a slot)", fn: function (assert) {
    assert.equal(core.graceLeadSeconds(80, 4), 0.035, "capped at 35 ms at practice tempos");
    const fast = core.graceLeadSeconds(300, 4); // sixteenths at 300: slot = 50 ms
    assert.ok(fast < 0.035, "compressed when the slot shrinks");
    assert.ok(fast <= (60 / 300 / 4) * 0.4 + 1e-9, "at most 40% of the slot");
  }},

  { name: "diddles: every group is two same-hand strokes on consecutive slots", fn: function (assert) {
    core.RUDIMENTS.forEach(function (r) {
      const groups = {};
      r.strokes.forEach(function (s) {
        if (s.diddle !== undefined) (groups[s.diddle] = groups[s.diddle] || []).push(s);
      });
      Object.keys(groups).forEach(function (id) {
        const g = groups[id];
        assert.equal(g.length, 2, r.id + " diddle " + id + ": two strokes");
        assert.equal(g[0].hand, g[1].hand, r.id + " diddle " + id + ": one hand");
        assert.equal(g[1].slot, g[0].slot + (g[0].duration || 1), r.id + " diddle " + id + ": consecutive");
      });
    });
    assert.equal(Object.keys((function () { // five stroke: four doubles
      const g = {};
      MAP["five-stroke-roll"].strokes.forEach(function (s) { if (s.diddle !== undefined) g[s.diddle] = 1; });
      return g;
    })()).length, 4, "five stroke roll carries four diddle groups");
  }},

  { name: "describePattern narrates hands, accents, flams, and diddles", fn: function (assert) {
    const text = core.describePattern(pattern("flam-accent"));
    assert.ok(text.indexOf("Right flam") !== -1, "mentions the flam");
    assert.ok(text.indexOf("accented") !== -1, "mentions the accent");
    const roll = core.describePattern(pattern("five-stroke-roll"));
    assert.ok(roll.indexOf("diddle") !== -1, "mentions the diddles");
  }},

  /* ================= generated counting, buzz, and groups ================= */

  { name: "counting: syllables are generated per subdivision when a record omits them", fn: function (assert) {
    assert.deepEqual(core.countingFor(4, 2), ["1", "e", "&", "a", "2", "e", "&", "a"], "sixteenths");
    assert.deepEqual(core.countingFor(3, 1), ["1", "trip", "let"], "triplet");
    assert.deepEqual(core.countingFor(2, 2), ["1", "&", "2", "&"], "eighths");
    assert.deepEqual(core.countingFor(1, 3), ["1", "2", "3"], "quarters");
    assert.deepEqual(core.countingFor(5, 1), ["1", "·", "·", "·", "·"],
      "unknown subdivision keeps the downbeat and dots the rest");
  }},

  { name: "counting: every rudiment carries a full grid-length row with beat numbers on the downbeats", fn: function (assert) {
    core.RUDIMENTS.forEach(function (r) {
      const p = core.withLead(r, "R");
      const slots = r.cycleBeats * r.slotsPerBeat;
      assert.equal(p.counting.length, slots, r.id + ": one label per slot");
      for (let b = 0; b < r.cycleBeats; b++)
        assert.equal(p.counting[b * r.slotsPerBeat], String(b + 1),
          r.id + ": beat " + (b + 1) + " labelled on its downbeat");
    });
  }},

  { name: "counting: a record's own counting overrides the generated row", fn: function (assert) {
    const r = sampleRudiment(); // ships an explicit ["1","e","&","a"]
    assert.deepEqual(core.withLead(r, "R").counting, ["1", "e", "&", "a"], "explicit counting preserved");
  }},

  { name: "buzz: the multiple bounce roll marks buzzed strokes and expansion carries the flag", fn: function (assert) {
    const r = MAP["multiple-bounce-roll"];
    assert.ok(r.strokes.some(function (s) { return s.buzz; }), "the data marks buzzed strokes");
    const ev = core.expandPattern(core.withLead(r, "R"));
    assert.ok(ev.every(function (e) { return e.buzz === true; }), "every expanded event is a buzz");
    assert.ok(core.describePattern(core.withLead(r, "R")).indexOf("buzz") !== -1, "narrated as a buzz");
  }},

  { name: "buzz: validation rejects a non-boolean buzz and a buzz that also carries a grace", fn: function (assert) {
    expectInvalid(assert, function (r) { r.strokes[0].buzz = "yes"; }, "buzz must be a boolean");
    expectInvalid(assert, function (r) { r.strokes[0].buzz = true; r.strokes[0].grace = [{ hand: "L" }]; },
      "cannot also carry a grace");
  }},

  { name: "groups: the triple stroke roll brackets 3+ same-hand consecutive strokes", fn: function (assert) {
    const groups = {};
    MAP["triple-stroke-roll"].strokes.forEach(function (s) {
      if (s.group !== undefined) (groups[s.group] = groups[s.group] || []).push(s);
    });
    const ids = Object.keys(groups);
    assert.ok(ids.length > 0, "the roll uses stroke groups");
    ids.forEach(function (id) {
      const g = groups[id];
      assert.ok(g.length >= 3, "group " + id + " has 3+ strokes");
      g.forEach(function (s, k) {
        assert.equal(s.hand, g[0].hand, "group " + id + ": one hand");
        if (k > 0) assert.equal(s.slot, g[k - 1].slot + (g[k - 1].duration || 1), "group " + id + ": consecutive");
      });
    });
  }},

  { name: "groups: validation rejects a short, mixed-hand, or non-consecutive group", fn: function (assert) {
    expectInvalid(assert, function (r) { r.strokes[0].group = 7; }, "at least 2 strokes");
    expectInvalid(assert, function (r) { r.strokes[0].group = 8; r.strokes[1].group = 8; }, "same hand");
    expectInvalid(assert, function (r) { r.strokes[0].group = 9; r.strokes[2].group = 9; }, "consecutive");
  }},

  /* ================= tempo paths ================= */

  { name: "ladder rungs: ascend by step and land exactly on the end", fn: function (assert) {
    assert.deepEqual(core.buildLadderRungs({ startBpm: 60, endBpm: 100, stepBpm: 8 }),
      [60, 68, 76, 84, 92, 100]);
    assert.deepEqual(core.buildLadderRungs({ startBpm: 60, endBpm: 100, stepBpm: 15 }),
      [60, 75, 90, 100], "off-grid endpoint still hit exactly");
    assert.deepEqual(core.buildLadderRungs({ startBpm: 60, endBpm: 60, stepBpm: 5 }),
      [60], "equal endpoints = one rung");
  }},

  { name: "ladder rungs: a descending ladder walks down to the end", fn: function (assert) {
    assert.deepEqual(core.buildLadderRungs({ startBpm: 100, endBpm: 60, stepBpm: 15 }),
      [100, 85, 70, 60]);
  }},

  { name: "ladder rungs: endpoint appears exactly once", fn: function (assert) {
    [[60, 100, 7], [60, 100, 40], [90, 62, 9]].forEach(function (t) {
      const rungs = core.buildLadderRungs({ startBpm: t[0], endBpm: t[1], stepBpm: t[2] });
      assert.equal(rungs.filter(function (b) { return b === t[1]; }).length, 1,
        "one endpoint in " + JSON.stringify(rungs));
      assert.equal(rungs[rungs.length - 1], t[1], "ends on the endpoint");
    });
  }},

  { name: "tempo path guards: rejects out-of-range and non-integer inputs", fn: function (assert) {
    assert.ok(threw(function () { core.buildLadderRungs({ startBpm: 60, endBpm: 100, stepBpm: 0 }); }), "zero step");
    assert.ok(threw(function () { core.buildLadderRungs({ startBpm: 10, endBpm: 100, stepBpm: 5 }); }), "start too low");
    assert.ok(threw(function () { core.buildLadderRungs({ startBpm: 60, endBpm: 400, stepBpm: 5 }); }), "end too high");
    assert.ok(threw(function () { core.buildLadderRungs({ startBpm: 60.5, endBpm: 100, stepBpm: 5 }); }), "fractional bpm");
    assert.ok(threw(function () { core.buildOcoRungs({ startBpm: 60, peakBpm: 100, stepBpm: -2 }); }), "negative step");
  }},

  { name: "open-close-open rungs: symmetric, peak exactly once", fn: function (assert) {
    assert.deepEqual(core.buildOcoRungs({ startBpm: 60, peakBpm: 70, stepBpm: 5 }),
      [60, 65, 70, 65, 60]);
    const off = core.buildOcoRungs({ startBpm: 60, peakBpm: 72, stepBpm: 5 });
    assert.deepEqual(off, [60, 65, 70, 72, 70, 65, 60], "off-grid peak still hit exactly");
    [[60, 70, 5], [60, 100, 5], [72, 101, 7], [50, 63, 4]].forEach(function (t) {
      const rungs = core.buildOcoRungs({ startBpm: t[0], peakBpm: t[1], stepBpm: t[2] });
      const peak = Math.max.apply(null, rungs);
      assert.equal(rungs.filter(function (b) { return b === peak; }).length, 1, "one peak");
      assert.equal(rungs[0], t[0], "starts at start");
      assert.equal(rungs[rungs.length - 1], t[0], "ends at start");
      for (let i = 0; i < rungs.length; i++)
        assert.equal(rungs[i], rungs[rungs.length - 1 - i], "symmetric at " + i);
    });
    assert.deepEqual(core.buildOcoRungs({ startBpm: 60, peakBpm: 70, stepBpm: 15 }),
      [60, 70, 60], "step wider than the gap");
    assert.deepEqual(core.buildOcoRungs({ startBpm: 80, peakBpm: 70, stepBpm: 5 }),
      [80], "peak at or below start collapses to one rung");
  }},

  /* ================= plans ================= */

  { name: "every plan opens with a 4-beat count-in at the starting tempo", fn: function (assert) {
    [
      plan("fixed", { bpm: 92 }, "single-paradiddle"),
      plan("ladder", { startBpm: 60, endBpm: 80, stepBpm: 5, repsPerStep: 4 }, "flam-accent"),
      plan("oco", { startBpm: 60, peakBpm: 80, stepBpm: 5, repsPerStep: 2 }, "five-stroke-roll"),
    ].forEach(function (p) {
      const ci = p.stages[0];
      assert.equal(ci.kind, "count-in", p.mode + ": first stage is the count-in");
      assert.equal(ci.beatsPerBlock, core.COUNT_IN_BEATS, p.mode + ": four beats");
      assert.equal(ci.bpm, p.rungs[0], p.mode + ": at the starting tempo");
      assert.equal(ci.blocks, 1, p.mode + ": one block");
    });
  }},

  { name: "fixed plan: one endless play stage at the chosen tempo", fn: function (assert) {
    const p = plan("fixed", { bpm: 84 }, "single-paradiddle");
    assert.equal(p.stages.length, 2, "count-in + play");
    assert.equal(p.stages[1].kind, "play", "play stage");
    assert.equal(p.stages[1].blocks, null, "endless");
    assert.equal(p.stages[1].bpm, 84, "chosen tempo");
    assert.equal(p.stages[1].beatsPerBlock, 2, "block = one 2-beat paradiddle cycle");
    assert.equal(core.totalSeconds(p), null, "no finite duration");
  }},

  { name: "ladder plan: one transition before each rung after the first, clicking at the NEW tempo", fn: function (assert) {
    const p = plan("ladder", { startBpm: 60, endBpm: 80, stepBpm: 5, repsPerStep: 4 }, "single-paradiddle");
    const trans = p.stages.filter(function (s) { return s.kind === "transition"; });
    assert.equal(trans.length, p.rungs.length - 1, "rungs minus one transitions");
    p.stages.forEach(function (s, i) {
      if (s.kind === "transition") {
        const next = p.stages[i + 1];
        assert.equal(next.kind, "play", "transition leads into its play stage");
        assert.equal(s.bpm, next.bpm, "transition clicks at the upcoming tempo");
        assert.equal(s.beatsPerBlock, core.TRANSITION_BEATS, "four beats");
      }
      if (s.kind === "play") {
        assert.equal(s.blocks, 4, "repsPerStep cycles at every rung");
        assert.equal(s.bpm, p.rungs[s.stepIndex], "play bpm matches its rung");
      }
    });
    const plays = p.stages.filter(function (s) { return s.kind === "play"; });
    assert.equal(plays[plays.length - 1].bpm, 80, "final play stage is the configured endpoint");
  }},

  { name: "open-close-open plan: no transitions, phases run closing -> peak -> opening", fn: function (assert) {
    const p = plan("oco", { startBpm: 60, peakBpm: 80, stepBpm: 5, repsPerStep: 2 }, "single-paradiddle");
    assert.equal(p.stages.filter(function (s) { return s.kind === "transition"; }).length, 0, "seamless");
    const phases = p.stages.filter(function (s) { return s.kind === "play"; })
                           .map(function (s) { return s.phase; });
    assert.deepEqual(phases,
      ["closing", "closing", "closing", "closing", "peak", "opening", "opening", "opening", "opening"],
      "closing on the climb, one peak, opening on the way back out");
    const peakStages = p.stages.filter(function (s) { return s.phase === "peak"; });
    assert.equal(peakStages.length, 1, "exactly one peak stage");
    assert.equal(peakStages[0].bpm, 80, "peak stage at the peak tempo");
  }},

  { name: "plans reject broken settings with clear errors", fn: function (assert) {
    assert.ok(threw(function () { plan("fixed", { bpm: 10 }, "single-paradiddle"); }), "bpm too low");
    assert.ok(threw(function () { plan("ladder", { startBpm: 60, endBpm: 80, stepBpm: 5, repsPerStep: 0 }, "single-paradiddle"); }), "zero reps");
    assert.ok(threw(function () { plan("waltz", { bpm: 80 }, "single-paradiddle"); }), "unknown mode");
    assert.ok(threw(function () { core.buildPlan("fixed", { bpm: 80 }, null); }), "missing pattern");
  }},

  /* ================= the position machine ================= */

  { name: "machine: a ladder runs count-in, rungs, transitions, then completes", fn: function (assert) {
    const p = plan("ladder", { startBpm: 60, endBpm: 70, stepBpm: 5, repsPerStep: 2 }, "single-paradiddle");
    const pb = core.createPracticePlayback(p);
    const rows = walkBlocks(pb);
    // 1 count-in + rungs 60,65,70 at 2 reps + 2 transitions = 1 + 6 + 2 = 9 blocks
    assert.equal(rows.length, 9, "block count");
    assert.deepEqual(rows.map(function (r) { return r.kind; }),
      ["count-in", "play", "play", "transition", "play", "play", "transition", "play", "play"],
      "stage order");
    assert.deepEqual(rows.map(function (r) { return r.bpm; }),
      [60, 60, 60, 65, 65, 65, 70, 70, 70], "tempo path including transitions at the new tempo");
    assert.ok(pb.done, "completed");
    assert.equal(pb.advanceBlock(), "done", "stays done");
    assert.equal(pb.nextPlayedBpm(), null, "nothing left to play");
  }},

  { name: "machine: open-close-open ascends, peaks once, descends, completes", fn: function (assert) {
    const p = plan("oco", { startBpm: 60, peakBpm: 70, stepBpm: 5, repsPerStep: 2 }, "flam-accent");
    const pb = core.createPracticePlayback(p);
    const rows = walkBlocks(pb);
    const played = rows.filter(function (r) { return r.kind === "play"; });
    assert.deepEqual(played.map(function (r) { return r.bpm; }),
      [60, 60, 65, 65, 70, 70, 65, 65, 60, 60], "symmetric tempo path");
    const phases = played.map(function (r) { return r.phase; });
    const firstPeak = phases.indexOf("peak"), lastPeak = phases.lastIndexOf("peak");
    assert.ok(firstPeak > 0, "peak reached");
    for (let k = firstPeak; k <= lastPeak; k++) assert.equal(phases[k], "peak", "contiguous peak");
    assert.ok(phases.slice(0, firstPeak).every(function (ph) { return ph === "closing"; }), "closing before");
    assert.ok(phases.slice(lastPeak + 1).every(function (ph) { return ph === "opening"; }), "opening after");
    assert.ok(pb.done, "completed");
  }},

  { name: "machine: tempo never changes inside a block, only at boundaries", fn: function (assert) {
    const p = plan("ladder", { startBpm: 60, endBpm: 72, stepBpm: 5, repsPerStep: 2 }, "five-stroke-roll");
    const pb = core.createPracticePlayback(p);
    // Rebuild the per-beat tempo timeline the scheduler would walk.
    const beats = [];
    while (!pb.done) {
      const st = pb.currentStage();
      for (let b = 0; b < st.beatsPerBlock; b++) beats.push({ bpm: st.bpm, boundary: b === 0 });
      pb.advanceBlock();
    }
    for (let i = 1; i < beats.length; i++)
      if (beats[i].bpm !== beats[i - 1].bpm)
        assert.ok(beats[i].boundary, "tempo change at beat " + i + " lands on a block boundary");
  }},

  { name: "machine: fixed mode loops endlessly and counts reps upward", fn: function (assert) {
    const p = plan("fixed", { bpm: 80 }, "single-paradiddle");
    const pb = core.createPracticePlayback(p);
    assert.equal(pb.currentStage().kind, "count-in", "starts at count-in");
    pb.advanceBlock();
    for (let i = 0; i < 500; i++) {
      assert.equal(pb.currentStage().kind, "play", "still playing");
      assert.equal(pb.repNumber(), i + 1, "rep number climbs");
      assert.equal(pb.advanceBlock(), "advanced", "endless stage never ends");
    }
    assert.equal(pb.done, false, "never done");
    assert.equal(pb.repsInStage(), null, "endless marker");
  }},

  { name: "machine: a fixed-mode tempo change waits for the cycle boundary", fn: function (assert) {
    const p = plan("fixed", { bpm: 80 }, "single-paradiddle");
    const pb = core.createPracticePlayback(p);
    pb.advanceBlock(); // leave the count-in
    assert.equal(pb.currentBpm(), 80, "playing at 80");
    assert.equal(pb.requestBpm(96), 96, "change parked");
    assert.equal(pb.currentBpm(), 80, "still 80 until the boundary");
    assert.equal(pb.pendingBpm, 96, "pending visible for the UI warning");
    pb.advanceBlock();
    assert.equal(pb.currentBpm(), 96, "applied exactly at the boundary");
    assert.equal(pb.pendingBpm, null, "pending cleared");
    assert.equal(pb.requestBpm(96), null, "requesting the current tempo parks nothing");
    const lp = core.createPracticePlayback(plan("ladder",
      { startBpm: 60, endBpm: 70, stepBpm: 5, repsPerStep: 2 }, "single-paradiddle"));
    assert.ok(threw(function () { lp.requestBpm(90); }), "ladder mode refuses requestBpm");
  }},

  { name: "machine: snapshot/restore preserves the exact position (pause/resume)", fn: function (assert) {
    const p = plan("oco", { startBpm: 60, peakBpm: 80, stepBpm: 5, repsPerStep: 3 }, "five-stroke-roll");
    const pb = core.createPracticePlayback(p);
    for (let i = 0; i < 11; i++) pb.advanceBlock(); // wander mid-plan
    const before = { bpm: pb.currentBpm(), phase: pb.phase(), step: pb.stepNumber(),
                     rep: pb.repNumber(), listening: pb.isListening(), next: pb.nextPlayedBpm() };
    const pb2 = core.createPracticePlayback(p);
    pb2.restore(pb.snapshot());
    assert.equal(pb2.currentBpm(), before.bpm, "bpm");
    assert.equal(pb2.phase(), before.phase, "phase");
    assert.equal(pb2.stepNumber(), before.step, "step");
    assert.equal(pb2.repNumber(), before.rep, "rep");
    assert.equal(pb2.isListening(), before.listening, "listening");
    assert.equal(pb2.nextPlayedBpm(), before.next, "next played bpm");
  }},

  { name: "machine: reset returns to the top of the plan", fn: function (assert) {
    const p = plan("ladder", { startBpm: 60, endBpm: 70, stepBpm: 10, repsPerStep: 2 }, "flam-accent");
    const pb = core.createPracticePlayback(p);
    while (!pb.done) pb.advanceBlock();
    pb.reset();
    assert.equal(pb.stageIndex, 0, "stage 0");
    assert.equal(pb.blockInStage, 0, "block 0");
    assert.equal(pb.done, false, "not done");
    assert.equal(pb.pendingBpm, null, "no pending tempo");
    assert.equal(pb.currentStage().kind, "count-in", "back at the count-in");
  }},

  { name: "machine: the final block of a stage is flagged (upcoming-change warning)", fn: function (assert) {
    const p = plan("oco", { startBpm: 60, peakBpm: 70, stepBpm: 5, repsPerStep: 2 }, "single-paradiddle");
    const pb = core.createPracticePlayback(p);
    let warnings = 0, changes = 0, prev = pb.currentBpm();
    while (!pb.done) {
      const next = pb.nextStage();
      assert.equal(pb.isFinalBlockOfStage(),
        pb.blockInStage === pb.currentStage().blocks - 1, "flag matches position");
      if (pb.currentStage().kind === "play" && pb.isFinalBlockOfStage() &&
          next && next.bpm !== pb.currentBpm()) warnings++;
      pb.advanceBlock();
      if (!pb.done && pb.currentBpm() !== prev) { changes++; prev = pb.currentBpm(); }
    }
    assert.ok(warnings > 0, "warnings fire");
    assert.equal(warnings, changes, "exactly one warning per tempo change");
  }},

  /* ================= timing ================= */

  { name: "timing: no drift — closed-form total equals the per-beat walk", fn: function (assert) {
    const p = plan("oco", { startBpm: 60, peakBpm: 100, stepBpm: 5, repsPerStep: 8 }, "five-stroke-roll");
    const closed = core.totalSeconds(p);
    let acc = 0;
    p.stages.forEach(function (st) {
      for (let blk = 0; blk < st.blocks; blk++)
        for (let b = 0; b < st.beatsPerBlock; b++) acc += core.beatSeconds(st.bpm);
    });
    assert.ok(Math.abs(acc - closed) < 1e-6,
      "drift " + Math.abs(acc - closed) + "s over " + closed.toFixed(1) + "s");
  }},

  { name: "timing: cycle length follows the pattern and the tempo", fn: function (assert) {
    assert.equal(core.cycleSeconds(pattern("single-paradiddle"), 60), 2, "2 beats at 60 = 2s");
    assert.equal(core.cycleSeconds(pattern("five-stroke-roll"), 120), 2, "4 beats at 120 = 2s");
    assert.equal(core.beatSeconds(90), 60 / 90, "beat length");
  }},

  ];
}

const api = { getCases: getCases };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.RudimentTests = api;

})(typeof self !== "undefined" ? self : this);
