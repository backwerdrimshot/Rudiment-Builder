// PREVIEW_URL and PLAYWRIGHT_MODULE select a local preview and installed Playwright.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const url = process.env.PREVIEW_URL || 'http://127.0.0.1:8836';
  await page.goto(url + '/tests/test.html');
  assert.equal((await page.evaluate(() => window.__TEST_RESULTS__)).failed, 0);
  await page.goto(url);
  await page.waitForFunction(() => window.Core && window.live.pattern);
  const result = await page.evaluate(() => {
    const original = playStroke, calls = [];
    playStroke = (time, hand, velocity, accent, buzz) => calls.push({ time, hand, velocity, accent, buzz });
    initAudio();
    let checked = 0;
    // Use real playback instances for snapshot/dynamic state, real scheduler and real events.
    for (const r of Core.RUDIMENTS.filter(Core.supportsHandListening)) {
      for (const lead of ['R', 'L']) {
        selectRudiment(r.id); applyLead(lead);
        const plan = Core.buildPlan('fixed', settings, live.pattern);
        const playback = Core.createPracticePlayback(plan);
        const stage = plan.stages.find(s => s.kind === 'play');
        for (const ev of live.events.concat(...Core.buildLayers(r).map(layer => Core.expandPattern(Core.withLayer(live.pattern, layer.id))))) {
          calls.length = 0; settings.listeningHand = 'both';
          scheduleEntry({ type: 'stroke', ev }, 100, stage, playback);
          const both = calls.slice();
          for (const part of ['R', 'L']) {
            calls.length = 0; settings.listeningHand = part;
            scheduleEntry({ type: 'stroke', ev }, 100, stage, playback);
            if (JSON.stringify(calls) !== JSON.stringify(both.filter(c => c.hand === part)))
              throw Error('Mismatch ' + r.id + ' ' + lead + ' ' + part);
            checked++;
            calls.length = 0;
            scheduleEntry({ type: 'stroke', ev, silent: true }, 100, stage, playback);
            if (calls.length) throw Error('Response turn made a sound');
          }
        }
      }
    }
    selectRudiment('flam-accent'); settings.listeningHand = 'R';
    quiz = { sampleTimer: null }; calls.length = 0; playQuizSample('flam-accent');
    if (!calls.some(c => c.hand === 'R') || !calls.some(c => c.hand === 'L')) throw Error('Quiz was filtered');
    stopQuizSample(); quiz = null;
    playStroke = original;
    selectRudiment('flam-accent'); applyListeningHand('R');
    const visible = !document.getElementById('handListening').hidden;
    const fullGrid = cellRefs.length === live.pattern.strokes.length;
    selectRudiment('five-stroke-roll');
    const reset = settings.listeningHand === 'both' && document.getElementById('handListening').hidden;
    return { checked, visible, fullGrid, reset };
  });
  assert.ok(result.checked > 100); assert.ok(result.visible && result.fullGrid && result.reset);
  await page.evaluate(() => { selectRudiment('single-paradiddle'); applyListeningHand('L'); });
  await page.locator('#btnStart').click();
  await page.waitForTimeout(250);
  await page.evaluate(() => applyListeningHand('R'));
  assert.equal(await page.evaluate(() => live.status), 'idle');
  await page.locator('#btnStart').click();
  await page.waitForTimeout(200);
  await page.locator('#btnStart').click();
  assert.equal(await page.evaluate(() => live.status), 'paused');
  await page.evaluate(() => applyListeningHand('L'));
  assert.equal(await page.evaluate(() => live.status), 'idle');
  await page.locator('#btnStart').click();
  await page.waitForTimeout(200);
  await page.locator('#btnStart').click();
  await page.locator('#btnStart').click();
  assert.equal(await page.evaluate(() => live.status), 'playing');
  await page.evaluate(() => resetPractice());
  for (const mode of ['ladder', 'oco', 'build']) {
    await page.evaluate(mode => {
      settings.ladder = { startBpm: 300, endBpm: 305, stepBpm: 5, repsPerStep: 1 };
      settings.oco = { startBpm: 300, peakBpm: 305, stepBpm: 5, repsPerStep: 1 };
      settings.build = { bpm: 300, repsPerStep: 1 };
      selectRudiment('flam'); applyMode(mode); applyListeningHand('R'); hydrateControls(); startPlayback();
    }, mode);
    await page.waitForFunction(() => live.status === 'complete', null, { timeout: 20000 });
    assert.equal(await page.evaluate(() => live.lastRun.listeningHand), 'R');
    assert.ok(await page.evaluate(() => Core.practiceLog(live.lastRun).includes('Right hand only (shared link opens both hands)')));
  }
  await page.evaluate(() => { applyMode('fixed'); applyListeningHand('L'); startPlayback(); document.getElementById("bpm").value = 95; onBpmChanged(); });
  await page.waitForTimeout(1800);
  assert.equal(await page.evaluate(() => live.status), 'playing');
  await page.evaluate(() => resetPractice());
  await page.setViewportSize({ width: 375, height: 812 });
  assert.equal(await page.locator('#handListening').isVisible(), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  for (const b of await page.locator('#segListeningHand button').all()) {
    const box = await b.boundingBox(); assert.ok(box && box.height >= 44 && box.width >= 44);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#btnRudimentHelp').focus();
  await page.keyboard.press('Tab');
  for (let i = 0; i < 20 && !(await page.locator('#segListeningHand button[data-val="both"]').evaluate(e => e === document.activeElement)); i++) await page.keyboard.press('Tab');
  assert.equal(await page.locator('#segListeningHand button[data-val="both"]').evaluate(e => e === document.activeElement), true);
  assert.equal(await page.locator('#segListeningHand button[data-val="both"]').evaluate(e => e.matches(':focus-visible')), true);
  await page.reload();
  assert.equal(await page.evaluate(() => settings.listeningHand), 'both');
  assert.deepEqual(errors, []);
  console.log('Hand listening browser checks passed:', result);
} finally { await browser.close(); }
