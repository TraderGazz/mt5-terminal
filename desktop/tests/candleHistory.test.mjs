import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/live.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('  let candleUnsub = null;'), source.indexOf('\n  // Служебная строка'));
const bar = (time, close = 1) => ({time, open:1, high:2, low:0, close});
function setup() {
  const pending = [], handlers = new Map(), elements = new Map();
  const element = () => ({style:{}, append(){}, replaceChildren(){}});
  const context = vm.createContext({
    console, Date, Map, state:{symbol:'EURUSDrfd', tf:'M15', offset:0}, bars:[], view:{begin:100},
    draw(){},
    document:{ getElementById(id){if(!elements.has(id)) elements.set(id,element());return elements.get(id);}, createElement:element, createTextNode:t=>t },
    api(path, opts){ return new Promise((resolve,reject)=>pending.push({opts,resolve,reject})); },
    ws:{on(channel,handler){handlers.set(channel,handler);return ()=>handlers.delete(channel);}},
  });
  context.terminalAPI = {setBars(data){context.bars = data; context.draw();}};
  vm.runInContext(code + '\nglobalThis.start=loadCandles; globalThis.older=()=>loadOlderCandles(candleHistory);', context);
  return {context,pending,handlers};
}
const flush = () => new Promise(resolve=>setImmediate(resolve));
async function initial(s) {
  s.context.start('M15');
  s.pending.shift().resolve({bars:[bar(100),bar(200)]});
  await flush();
}
test('older pages prepend, deduplicate and keep viewport offset; live windows preserve history', async()=>{
  const s=setup(); await initial(s); s.context.state.offset=1;
  const p=s.context.older();
  assert.equal(s.pending[0].opts.query.to,new Date(100000-1).toISOString());
  s.pending.shift().resolve({bars:[bar(50),bar(100)]}); await p;
  assert.deepEqual(Array.from(s.context.bars,b=>b.t),[50000,100000,200000]);
  assert.equal(s.context.state.offset,1);
  s.handlers.get('candle:M15')({symbol:'EURUSDrfd',bars:[bar(200,1.5),bar(300)]});
  assert.deepEqual(Array.from(s.context.bars,b=>b.t),[50000,100000,200000,300000]);
  assert.equal(s.context.state.offset,2);
  assert.equal(s.context.bars[2].c,1.5);
});
test('only one older request at a time; empty page stops automatic requests', async()=>{
  const s=setup(); await initial(s);
  const p=s.context.older(); await s.context.older(); assert.equal(s.pending.length,1);
  s.pending.shift().resolve({bars:[]}); await p;
  await s.context.older(); assert.equal(s.pending.length,0);
});
test('late history from previous timeframe cannot overwrite active chart', async()=>{
  const s=setup(); await initial(s); const p=s.context.older(); const old=s.pending.shift();
  s.context.start('H4'); s.pending.shift().resolve({bars:[bar(500)]}); await flush();
  old.resolve({bars:[bar(50)]}); await p;
  assert.deepEqual(Array.from(s.context.bars,b=>b.t),[500000]);
});
test('WebSocket update wins over initial HTTP and ignores another symbol', async()=>{
  const s=setup(); s.context.start('M15');
  s.handlers.get('candle:M15')({symbol:'EURUSDrfd',bars:[bar(200,1.8)]});
  s.pending.shift().resolve({bars:[bar(100),bar(200,1.1)]}); await flush();
  assert.equal(s.context.bars[1].c,1.8);
  s.handlers.get('candle:M15')({symbol:'XAUUSDrfd',bars:[bar(300)]});
  assert.equal(s.context.bars.length,2);
});

test('drawing near left edge starts pagination automatically', async()=>{
  const s=setup(); await initial(s);
  s.context.view.begin=59; s.context.draw(); s.context.draw();
  assert.equal(s.pending.length,1);
  s.pending.shift().resolve({bars:[bar(50)]}); await flush();
  assert.equal(s.context.bars[0].t,50000);
});
test('history failure preserves chart and does not flood requests', async()=>{
  const s=setup(); await initial(s); const p=s.context.older();
  s.pending.shift().reject(new Error('network')); await p;
  assert.equal(s.context.bars.length,2);
  await s.context.older(); assert.equal(s.pending.length,0);
});
test('normalized chart times do not move viewport on repeated weekly updates', async()=>{
  const s=setup(); await initial(s); s.context.state.offset=5;
  s.context.bars=[{t:180000}];
  s.handlers.get('candle:M15')({bars:[bar(200,1.8)]});
  s.handlers.get('candle:M15')({bars:[bar(200,1.9)]});
  assert.equal(s.context.state.offset,5);
});
