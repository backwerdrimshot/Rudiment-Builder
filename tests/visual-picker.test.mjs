import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app = fs.readFileSync(new URL('../js/rudiment-app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const coreContext = {};
vm.runInNewContext(fs.readFileSync(new URL('../js/rudiment-data.js', import.meta.url), 'utf8'), coreContext);
vm.runInNewContext(fs.readFileSync(new URL('../js/rudiment-core.js', import.meta.url), 'utf8'), coreContext);
test('every preview resolves to the existing, PAS-matched notation asset', () => {
  const core = coreContext.RudimentCore;
  for (const r of core.RUDIMENTS) {
    const svg = fs.readFileSync(new URL('../' + core.notationCard(r), import.meta.url), 'utf8');
    assert.ok(svg.includes(`data-pas="${r.pas}"`), r.name);
    assert.ok(svg.includes('Right-hand lead'), r.name);
  }
  assert.equal(core.RUDIMENTS.length, 40);
});
test('picker uses lazy decorative previews and preserves selected button semantics', () => {
  assert.match(app, /Core\.notationCard\(r\) \+ '\" alt=\"\" loading=\"lazy\" decoding=\"async\"/);
  assert.match(app, /setAttribute\("aria-pressed", cards\[i\]\.dataset\.id === settings\.rudimentId/);
  assert.match(html, /Notation previews show right-hand lead/);
});
test('choosing even the current card closes the chooser and restores focus', () => {
  const handler = app.match(/b\.addEventListener\("click", function \(\) \{([\s\S]*?)\n    \}\);/)[1];
  const calls = [];
  vm.runInNewContext(handler, { r: { id: 'single-paradiddle' }, selectRudiment(id) { calls.push(id); }, $(id) { assert.equal(id, 'setupPanel'); return { getAttribute() { return "modal"; }, close() { calls.push('close'); } }; } });
  assert.deepEqual(calls, ['single-paradiddle', 'close']);
  assert.match(app, /panel.addEventListener\("close", function \(\) \{[\s\S]*?toggle.focus\(\)/);
  assert.match(html, /<dialog class="setup-panel"[^>]*aria-labelledby="hRudiment"[^>]*aria-modal="true"/);
  assert.match(app, /panel.showModal\(\)/);
});

test('Space does not steal activation from the filter disclosure', () => {
  assert.match(app, /INPUT\|TEXTAREA\|SELECT\|BUTTON\|A\|SUMMARY/);
});

test('learned badges use ink in selected and hovered cards in either theme', () => {
  assert.ok(html.includes('.rud-card[aria-pressed="true"] .rlearn,.rud-card:hover .rlearn{color:var(--ink)}'));
});

test('picker keyboard boundaries wrap visible controls, excluding hidden and disabled controls', () => {
  const handler = app.match(/panel\.addEventListener\("keydown", function \(e\) \{([\s\S]*?)\n  \}\);/)[1];
  const focused = [];
  const make = (id, visible = true, disabled = false) => ({ disabled, tabIndex: 0, getClientRects: () => visible ? [{}] : [], focus: () => focused.push(id) });
  const first = make('close'), last = make('left'), hidden = make('hidden', false), disabled = make('disabled', true, true);
  const context = { panel: { getAttribute: () => "modal", querySelectorAll: () => [first, hidden, disabled, last] }, document: { activeElement: first }, e: { key: 'Tab', shiftKey: true, preventDefault() { focused.push('prevent'); } } };
  vm.runInNewContext('(function(){' + handler + '})()', context);
  assert.deepEqual(focused, ['prevent', 'left']);
  focused.length = 0;
  context.document.activeElement = last;
  context.e.shiftKey = false;
  vm.runInNewContext('(function(){' + handler + '})()', context);
  assert.deepEqual(focused, ['prevent', 'close']);
});

test('sidebar selection stays open so the player can compare another rudiment', () => {
  const handler = app.match(/b\.addEventListener\("click", function \(\) \{([\s\S]*?)\n    \}\);/)[1];
  const calls = [];
  vm.runInNewContext(handler, { r: { id: 'single-paradiddle' }, selectRudiment(id) { calls.push(id); }, $() { return { getAttribute() { return 'sidebar'; }, close() { calls.push('close'); } }; } });
  assert.deepEqual(calls, ['single-paradiddle']);
});

test('nonmodal sidebar does not trap the player away from practice controls', () => {
  const handler = app.match(/panel\.addEventListener\("keydown", function \(e\) \{([\s\S]*?)\n  \}\);/)[1];
  vm.runInNewContext('(function(){' + handler + '})()', { panel: { getAttribute: () => 'sidebar' }, e: { key: 'Tab', preventDefault() { assert.fail('sidebar must not trap Tab'); } } });
  assert.match(app, /if \(wide\) panel.show\(\); else panel.showModal\(\)/);
  assert.match(html, /max-width:1399px/);
  assert.match(html, /height:100dvh/);
});

test('full-height modal removes the native dialog width cap', () => {
  assert.ok(html.includes('.setup-panel{inset:0;width:100%;max-width:none;height:100dvh;'));
});

test('phone transport follows notation without covering it', () => {
  assert.ok(html.indexOf('class="panel dock"') > html.indexOf('class="panel area-sticking"'));
  assert.ok(html.indexOf('class="panel dock"') < html.indexOf('class="panel area-status"'));
  assert.match(html, /max-width:979px\)\{\s*\.dock\{position:static/);
});

test('full notation and supported hand controls stay on the practice surface', () => {
  const start=html.indexOf('<section class="panel area-sticking"');
  const end=html.indexOf('</section>',start);
  const practice=html.slice(start,end);
  assert.match(practice,/id="notation"/);assert.match(practice,/id="handListening"/);
  assert.ok(practice.indexOf('id="notation"')<practice.indexOf('id="handListening"'));
  assert.ok(practice.indexOf('id="handListening"')<practice.indexOf('id="sticking"'));
  assert.equal(coreContext.RudimentCore.RUDIMENTS.filter(coreContext.RudimentCore.supportsHandListening).length,18);
  assert.match(practice,/Both hands play for this rudiment/);
});
