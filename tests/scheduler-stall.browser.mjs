// Run explicitly with PREVIEW_URL and PLAYWRIGHT_MODULE; serves the app (the repository root or dist/).
// Blocks the page for five seconds while the audio clock keeps running, then fails if any
// sound is scheduled in the past, which would play the missed steps at once.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const FREEZE = 5000;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH, headless: true, args: ['--autoplay-policy=no-user-gesture-required', ...(process.env.PLAYWRIGHT_ARGS ? process.env.PLAYWRIGHT_ARGS.split(' ') : [])] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/cloudflareinsights/, route => route.fulfill({ status: 200, body: '' }));
  // Record every sound the page schedules: its start time against the audio clock at the time of the call.
  await page.addInitScript(() => {
    window.__starts = [];
    for (const C of [window.OscillatorNode, window.AudioBufferSourceNode]) {
      const start = C.prototype.start;
      C.prototype.start = function (when) { window.__ctx = this.context; window.__starts.push({ when: when || 0, now: this.context.currentTime, at: performance.now() }); return start.apply(this, arguments); };
    }
  });
  await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:8812');
  await page.locator('#btnStart').click();
  await page.waitForTimeout(1500);
  const steady = await page.evaluate(() => ({ calls: window.__starts.length, past: window.__starts.filter(s => s.when < s.now - 0.05).length }));
  assert.ok(steady.calls > 0, 'playback never started');
  assert.equal(steady.past, 0, 'sounds were already late before the stall');
  const clock0 = await page.evaluate(() => window.__ctx.currentTime);
  const mark = await page.evaluate(ms => { const t = performance.now(); while (performance.now() - t < ms) {} return t; }, FREEZE);
  const advanced = await page.evaluate(c => window.__ctx.currentTime - c, clock0);
  assert.ok(advanced > FREEZE / 1000 - 1, `the audio clock did not run during the stall, so this check proved nothing: ${advanced.toFixed(2)} s`);
  await page.waitForTimeout(700);
  const after = await page.evaluate(t => { const s = window.__starts.filter(x => x.at > t); return { calls: s.length, past: s.filter(x => x.when < x.now - 0.05).length, worstLate: s.length ? Math.max(...s.map(x => x.now - x.when)) : 0 }; }, mark);
  assert.ok(after.calls > 0, 'playback did not resume after the stall');
  assert.equal(after.past, 0, `${after.past} sounds were scheduled in the past after a ${FREEZE / 1000} s stall (worst ${after.worstLate.toFixed(2)} s late): the backlog played at once`);
  assert.deepEqual(errors, []);
  console.log(`Scheduler stall check passed: after a ${FREEZE / 1000} s main-thread stall no sound was scheduled in the past and playback resumed (${after.calls} sounds).`);
} finally { await browser.close(); }
