import assert from 'node:assert/strict';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
for(const engine of [chromium,webkit]){
 const browser=await engine.launch({headless:true,...(engine===webkit&&process.env.WEBKIT_EXECUTABLE?{executablePath:process.env.WEBKIT_EXECUTABLE}:{})});
 try{
 const context=await browser.newContext({serviceWorkers:'block'});await context.route(/cloudflareinsights\.com/,r=>r.fulfill({status:200,contentType:'application/javascript',body:'/* analytics disabled in local test */'}));
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:8855/');await page.waitForFunction(()=>window.live?.pattern);
 for(const width of [320,390,812,1440,1920]){
  await page.setViewportSize({width,height:664});await page.evaluate(()=>{selectRudiment('single-paradiddle');applyLead('L');});
  await page.locator('#btnEnlargeNotation').click();assert.equal(await page.locator('#workspace-notation').evaluate(e=>e.matches(':modal')),true);
  await page.waitForSelector('#notationZoomCard svg');assert.match(await page.locator('#notationZoomCaption').textContent(),/left lead swaps every R and L/);
  assert.equal(await page.locator('#notationZoomCard svg').getAttribute('data-rudiment'),'single-paradiddle');
  await page.locator('#notationZoomIn').click();await page.locator('#notationZoomIn').click();assert.equal(await page.locator('#notationZoomLevel').textContent(),'200%');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('#notationZoomFit').click();assert.equal(await page.locator('#notationZoomLevel').textContent(),'100%');
  await page.keyboard.press('Escape');assert.equal(await page.locator('#btnEnlargeNotation').evaluate(e=>e===document.activeElement),true);
 }
 await page.setViewportSize({width:390,height:664});await page.locator('#btnFavorite').click();assert.equal(await page.locator('#btnFavorite').getAttribute('aria-pressed'),'true');assert.ok((await page.locator('#btnFavorite').boundingBox()).height>=44);
 await page.evaluate(()=>{selectRudiment('flam');selectRudiment('single-paradiddle');});await page.reload();await page.waitForFunction(()=>window.live?.pattern);
 assert.equal(await page.locator('#btnFavorite').getAttribute('aria-pressed'),'true');assert.deepEqual(await page.evaluate(()=>shortcuts.recent.slice(0,2)),['single-paradiddle','flam']);
 await page.locator('#setupToggle').click();await page.locator('#personalShortcuts>summary').click();await page.locator('#recentShortcuts button').filter({hasText:'Flam'}).click();
 assert.equal(await page.evaluate(()=>settings.rudimentId),'flam');assert.equal(await page.locator('#setupPanel').evaluate(e=>e.open),false);assert.equal(await page.locator('#setupToggle').evaluate(e=>e===document.activeElement),true);
 await page.locator('#btnStart').click();const status=await page.evaluate(()=>live.status);await page.locator('#btnFavorite').click();assert.equal(await page.evaluate(()=>live.status),status);
 await page.locator('#btnEnlargeNotation').click();assert.equal(await page.evaluate(()=>live.status),status);await page.evaluate(()=>selectRudiment('flam-accent'));await page.waitForFunction(()=>document.querySelector('#notationZoomCard svg')?.getAttribute('data-rudiment')==='flam-accent');assert.match(await page.locator('#notationZoomTitle').textContent(),/Flam Accent/);await page.keyboard.press('Escape');await page.locator('#btnReset').click();
 await page.evaluate(()=>localStorage.setItem(SHORTCUTS_KEY,'{broken'));await page.reload();await page.waitForFunction(()=>window.live?.pattern);assert.deepEqual(await page.evaluate(()=>shortcuts.favorites),[]);
 await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new Error('quota');};});await page.locator('#btnFavorite').click();assert.match(await page.locator('#shortcutStorageNote').textContent(),/this visit only/);assert.equal(await page.locator('#btnFavorite').getAttribute('aria-pressed'),'true');
 assert.deepEqual(errors,[]);console.log(engine.name(),'PASS zoom/dialog/lead/focus/responsive/favorites/recent/persistence/corruption/storage failure/playback');
 }finally{await browser.close();}
}
