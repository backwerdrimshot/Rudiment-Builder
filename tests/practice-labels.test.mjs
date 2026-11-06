import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync(new URL('../js/rudiment-app.js', import.meta.url), 'utf8');
const claim = app.slice(app.indexOf('function claimableBpm() {'), app.indexOf('function onClean() {'));
function cleanControl(status, heard) {
  const nodes = { btnClean: {}, cleanLabel: {} };
  const context = { live: { status, heard }, $(id) { return nodes[id]; } };
  vm.runInNewContext(claim + '\nupdateCleanBtn();', context);
  return { nodes, bpm: context.claimableBpm() };
}

test('clean logging stays unavailable until a rudiment tempo was heard', () => {
  const { nodes, bpm } = cleanControl('playing', null);
  assert.equal(bpm, null);
  assert.equal(nodes.btnClean.disabled, true);
  assert.equal(nodes.cleanLabel.textContent, 'Log clean rep');
  assert.match(nodes.btnClean.title, /You decide what counts as clean/);
  assert.match(nodes.btnClean.title, /does not listen or grade/);
});

test('playing and paused clean labels name the actually heard tempo', () => {
  for (const status of ['playing', 'paused']) {
    const { nodes, bpm } = cleanControl(status, { bpm: 70, peak: 90 });
    assert.equal(bpm, 70);
    assert.equal(nodes.btnClean.disabled, false);
    assert.equal(nodes.cleanLabel.textContent, 'Log clean rep · 70 BPM');
    assert.doesNotMatch(nodes.btnClean.title, /highest/);
  }
});

test('completed runs retain peak-tempo claim and explain it explicitly', () => {
  const { nodes, bpm } = cleanControl('complete', { bpm: 70, peak: 90 });
  assert.equal(bpm, 90);
  assert.equal(nodes.cleanLabel.textContent, 'Log clean rep · 90 BPM');
  assert.match(nodes.btnClean.title, /highest played tempo/);
});

test('idle/reset never offers a stale clean claim', () => {
  const { nodes, bpm } = cleanControl('idle', { bpm: 70, peak: 90 });
  assert.equal(bpm, null);
  assert.equal(nodes.btnClean.disabled, true);
});
