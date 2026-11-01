import test from 'node:test';
import assert from 'node:assert/strict';
import { startRecoveringFeed } from '../src/data/recoveringFeed.ts';

const tick = () => new Promise(resolve => setImmediate(resolve));
function harness(fetchSnapshot) {
  let push;
  const data=[],errors=[];
  let ready=0,unsubscribed=false;
  const stop=startRecoveringFeed({
    fetchSnapshot,subscribe:receive=>{push=receive;return()=>{unsubscribed=true;};},
    receive:value=>data.push(value),setError:flag=>errors.push(flag),ready:()=>ready++,retryMs:10,
  });
  return {data,errors,stop,push:value=>push(value),get ready(){return ready;},get unsubscribed(){return unsubscribed;}};
}
test('failed REST recovers without any WS update and stops retries after success', async () => {
  let count=0;
  const h=harness(async()=>{if(++count===1)throw Error('temporary outage');return {balance:123};});
  try {
    await new Promise(resolve=>setTimeout(resolve,60));
    assert.deepEqual(h.errors,[true,false]);
    assert.deepEqual(h.data,[{balance:123}]);
    assert.equal(count,2);
    assert.equal(h.ready,2);
  } finally {h.stop();}
});
test('keep the error while offline; never publish mock data', async () => {
  const h=harness(async()=>{throw Error('offline');});
  try {
    await new Promise(resolve=>setTimeout(resolve,35));
    assert.ok(h.errors.length>=2);
    assert.ok(h.errors.every(Boolean));
    assert.deepEqual(h.data,[]);
  } finally {h.stop();}
});
test('fresh WS data wins over an older failed REST request', async () => {
  let reject;
  const h=harness(()=>new Promise((resolve,no)=>{reject=no;}));
  try {
    h.push({balance:456}); reject(Error('older failure')); await tick();
    assert.deepEqual(h.errors,[false]);
    assert.deepEqual(h.data,[{balance:456}]);
  } finally {h.stop();}
});
test('fresh WS data wins over an older successful REST response', async () => {
  let resolve;
  const h=harness(()=>new Promise(yes=>{resolve=yes;}));
  try {
    h.push(['new-position']); resolve(['old-position']); await tick();
    assert.deepEqual(h.data,[['new-position']]);
  } finally {h.stop();}
});
test('stopping the feed cancels scheduled retries and unsubscribes', async () => {
  let count=0;
  const h=harness(async()=>{count++;throw Error('offline');});
  await tick(); h.stop();
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(count,1); assert.equal(h.unsubscribed,true);
});
