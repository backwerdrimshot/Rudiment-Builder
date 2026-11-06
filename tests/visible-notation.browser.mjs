// Local-only practice notation regression.
import assert from 'node:assert/strict';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
for(const engine of [chromium,webkit]){
const browser=await engine.launch({headless:true,...(engine===webkit&&process.env.WEBKIT_EXECUTABLE?{executablePath:process.env.WEBKIT_EXECUTABLE}:{})});
try{
const page=await browser.newPage();await page.route(/cloudflareinsights\.com/,r=>r.abort());await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:8855/');await page.waitForFunction(()=>window.live?.pattern);
for(const width of [320,390,664,980,1440,1920]){
 await page.setViewportSize({width,height:664});
 const ids=await page.evaluate(()=>Core.RUDIMENTS.map(r=>r.id));
 for(const id of ids){
  await page.evaluate(id=>{selectRudiment(id);applyLead('R');},id);
  await page.waitForFunction(()=>document.querySelector('#notationCard svg,#notationCard img'));
  assert.equal(await page.locator('#notation').evaluate(e=>!!e.closest('.area-sticking')&&!e.closest('dialog')),true);
  assert.ok(await page.locator('#notation').isVisible());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const supported=await page.evaluate(()=>Core.supportsHandListening(Core.RUDIMENT_MAP[settings.rudimentId]));
  assert.equal(await page.locator('#handListening').isVisible(),supported);assert.equal(await page.locator('#handListeningAvailability').isVisible(),!supported);
  await page.evaluate(()=>applyLead('L'));assert.match(await page.locator('#notationCap').textContent(),/left lead swaps every R and L/);
  if(supported){
   const before=await page.locator('#notationCard').innerHTML();await page.locator('#segListeningHand [data-val="R"]').click();
   assert.equal(await page.locator('#notationCard').innerHTML(),before);assert.equal(await page.evaluate(()=>effectiveLead()),'L');
   assert.match(await page.locator('#listeningStatus').textContent(),/right hand only/);
   assert.ok((await page.locator('#segListeningHand [data-val="R"]').boundingBox()).height>=44);
  }else assert.equal(await page.evaluate(()=>effectiveListeningHand()),'both');
 }
}
console.log(engine.name(),'PASS all40, six widths, full score on practice, both leads,18 availability, audio-only isolation');
}finally{await browser.close();}
}
