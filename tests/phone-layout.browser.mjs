// Local-only phone layout regression. No production writes.
import assert from 'node:assert/strict';
const {chromium,webkit,devices}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=process.env.PREVIEW_URL||'http://127.0.0.1:8855/';
for (const [engine,profile] of [[chromium,devices['Pixel 7']],[webkit,devices['iPhone 13']]]) {
 const browser=await engine.launch({headless:true,...(engine===webkit&&process.env.WEBKIT_EXECUTABLE?{executablePath:process.env.WEBKIT_EXECUTABLE}:{})});
 try {
  const context=await browser.newContext(profile);await context.route(/cloudflareinsights\.com/,r=>r.abort());
  const page=await context.newPage();await page.goto(url);await page.waitForFunction(()=>window.live?.pattern);
  for(const viewport of [profile.viewport,{width:profile.viewport.height,height:profile.viewport.width}]) {
   await page.setViewportSize(viewport);
   for(const expanded of [false,true]) {
    if(await page.locator('.dock-tools').evaluate(e=>e.open)!==expanded) await page.locator('.dock-tools>summary').tap();
    const geometry=await page.evaluate(()=>({dock:document.querySelector('.dock').getBoundingClientRect().toJSON(),notes:document.querySelector('.area-sticking').getBoundingClientRect().toJSON(),position:getComputedStyle(document.querySelector('.dock')).position,overflow:document.documentElement.scrollWidth>innerWidth}));
    assert.equal(geometry.position,'static');assert.equal(geometry.overflow,false);assert.ok(geometry.dock.top>=geometry.notes.bottom);
    for(const id of ['btnStart','btnReset'])assert.ok((await page.locator('#'+id).boundingBox()).height>=44);
    await page.locator('#btnStart').tap();assert.equal(await page.evaluate(()=>live.status),'playing');await page.locator('#btnReset').tap();assert.equal(await page.evaluate(()=>live.status),'idle');
   }
  }
  console.log(engine.name(),profile.viewport,'phone dock portrait/landscape collapsed/expanded: PASS');
 } finally {await browser.close();}
}
