import assert from 'node:assert/strict';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
for(const engine of [chromium,webkit]){
 const b=await engine.launch({headless:true,...(engine===webkit?{executablePath:process.env.WEBKIT_EXECUTABLE}:{})});
 try{const p=await b.newPage({serviceWorkers:'block'}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route(/cloudflareinsights/,r=>r.fulfill({body:'',contentType:'application/javascript'}));await p.goto(process.env.PREVIEW_URL||'http://127.0.0.1:8858');
 for(const width of [320,390,759,834,1200,1440,1920]){
 await p.setViewportSize({width,height:844});await p.evaluate(()=>selectRudiment('single-paradiddle'));
 assert.equal(await p.locator('#rudimentDossier').isVisible(),true);
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 for(const lead of ['R','L']){await p.evaluate(l=>applyLead(l),lead);assert.equal(await p.locator('#sticking .letter').first().textContent(),lead);}
 await p.locator('#btnEnlargeNotation').click();await p.waitForSelector('#notationZoomCard svg');await p.keyboard.press('Escape');assert.equal(await p.locator('#btnEnlargeNotation').evaluate(e=>e===document.activeElement),true);
 await p.locator('#btnFavorite').click();await p.locator('#btnStart').click();assert.equal(await p.evaluate(()=>live.status),'playing');await p.locator('#btnStart').click();
 await p.evaluate(()=>selectRudiment('flam'));assert.equal(await p.locator('#rudimentDossier').isVisible(),false);assert.equal(await p.locator('.area-sticking #sticking').count(),1);assert.equal(await p.locator('.transport #btnReset').count(),1);
 await p.evaluate(()=>selectRudiment('single-paradiddle'));
 }
 await p.setViewportSize({width:320,height:568});await p.evaluate(()=>selectRudiment('single-paradiddle'));await p.waitForFunction(()=>document.querySelector('.dock').parentElement.id==='rudimentDossier');const startBox=await p.locator('#btnStart').boundingBox();assert.ok(startBox.y+startBox.height<=568,JSON.stringify({startBox,geometry:await p.evaluate(()=>Object.fromEntries(['#rudimentDossier','.dock','.dossier-scroll','.dossier-heading'].map(s=>[s,document.querySelector(s).getBoundingClientRect().toJSON()])))}));
 await p.locator('#btnStart').focus();await p.evaluate(()=>renderSticking());assert.equal(await p.locator('#btnStart').evaluate(e=>e===document.activeElement),true);
 await p.setViewportSize({width:1440,height:1000});await p.evaluate(()=>setClassView(true));assert.equal(await p.locator('#rudimentDossier').isVisible(),false);assert.ok(await p.locator('#sticking .letter').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>28));await p.evaluate(()=>setClassView(false));assert.equal(await p.locator('#rudimentDossier').isVisible(),true);
 await p.setViewportSize({width:320,height:568});await p.evaluate(()=>{selectRudiment('single-paradiddle');window.scrollTo(0,0);});const teaching=p.locator('.dossier-learning summary').first();await teaching.focus();await p.keyboard.press('Enter');const windowY=await p.evaluate(()=>scrollY);await p.keyboard.press('PageDown');assert.equal(await p.evaluate(()=>scrollY),windowY);assert.ok(await p.locator('.dossier-scroll').evaluate(e=>e.scrollTop>0));
 assert.deepEqual(errors,[]);console.log(engine.name(),'PASS seven widths, restoration, lead, focus, favorites and transport');
 await p.setViewportSize({width:390,height:844});await p.evaluate(()=>{document.querySelectorAll('.dossier-section').forEach(d=>d.open=false);document.querySelector('.dossier-scroll').scrollTop=0;window.scrollTo(0,0);});await p.screenshot({path:'../dossier-phone.png',fullPage:true});
 await p.setViewportSize({width:834,height:1112});await p.waitForFunction(()=>document.querySelector('.dock').parentElement.classList.contains('dossier-practice'));await p.screenshot({path:'../dossier-tablet.png',fullPage:true});
 await p.setViewportSize({width:1440,height:1000});await p.waitForFunction(()=>getComputedStyle(document.querySelector('.dossier-scroll')).gridTemplateColumns.split(' ').length===3);await p.screenshot({path:'../dossier-desktop.png',fullPage:true});
 }finally{await b.close();}
}
