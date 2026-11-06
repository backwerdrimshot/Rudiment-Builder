import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const app=fs.readFileSync(new URL('../js/rudiment-app.js',import.meta.url),'utf8');
const ctx={Core:{RUDIMENT_MAP:{a:{},b:{},c:{}}}};
vm.runInNewContext(app.slice(app.indexOf('function normalizeShortcuts('),app.indexOf('function loadShortcuts(')),ctx);
const normalize=value=>JSON.parse(JSON.stringify(ctx.normalizeShortcuts(value)));
test('shortcuts accept only known unique IDs and the current schema',()=>{
 assert.deepEqual(normalize({version:1,favorites:['a','bad','a','b',null,'__proto__'],recent:['c','a','c']}),{version:1,favorites:['a','b'],recent:['c','a']});
 for(const value of [null,{},'bad',{version:2,favorites:['a']},{version:1,favorites:42}])assert.deepEqual(normalize(value),{version:1,favorites:[],recent:[]});
});
test('recent list is capped at eight IDs',()=>{
 const map={};for(let i=0;i<15;i++)map['r'+i]={};ctx.Core.RUDIMENT_MAP=map;
 assert.equal(normalize({version:1,recent:Object.keys(map)}).recent.length,8);
});
