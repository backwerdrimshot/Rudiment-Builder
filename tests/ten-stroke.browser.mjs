// Local-only: PREVIEW_URL selects the served checkout; PLAYWRIGHT_MODULE selects installed Playwright.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const preview = process.env.PREVIEW_URL || 'http://127.0.0.1:8841';
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try {
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(preview + '/tests/test.html');
assert.equal((await page.evaluate(()=>window.__TEST_RESULTS__)).failed,0);
await page.goto(preview + '/');
await page.waitForFunction(()=>window.Core&&window.live.pattern);
const result=await page.evaluate(()=>{
selectRudiment('ten-stroke-roll');applyLead('R');
const events=live.events.map(e=>[e.beatPos,e.lengthBeats,e.hand,e.accent]);
return {events,cycle:live.pattern.cycleBeats,counting:live.pattern.counting};
});
assert.deepEqual(result.events.map(e=>e[0]),[0,.25,.375,.5,.625,.75,.875,1,1.125,1.25]);assert.equal(result.cycle,2);
await page.evaluate(()=>{applyMode('fixed');startPlayback();});await page.waitForTimeout(4000);
assert.equal(await page.evaluate(()=>live.status),'playing');
await page.evaluate(()=>pausePlayback());assert.equal(await page.evaluate(()=>live.status),'paused');
await page.evaluate(()=>resumePlayback());await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>live.status),'playing');
await page.evaluate(()=>resetPractice());
await page.setViewportSize({width:375,height:812});
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
assert.deepEqual(errors,[]); console.log('PASS: browser core cases, ten-stroke events, two-beat cycle, start/pause/resume/reset, 375px width; '+JSON.stringify(result));
} finally {await browser.close();}
