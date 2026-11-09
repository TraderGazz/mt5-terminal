import test from 'node:test';
import assert from 'node:assert/strict';
import {createHistoryRefresh,createHistoryClock} from '../src/data/historyRefresh.ts';
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
test('fresh close response cannot be replaced by an older poll',async()=>{
 const old=deferred(),fresh=deferred();const queue=[old,fresh],received=[];
 const refresh=createHistoryRefresh(()=>queue.shift().promise,data=>received.push(data),()=>assert.fail('unexpected failure'));
 const a=refresh(),b=refresh();fresh.resolve({closed:[123]});await b;old.resolve({closed:[]});await a;
 assert.deepEqual(received,[{closed:[123]}]);
});
test('old request failure cannot hide successful close refresh',async()=>{
 const old=deferred(),fresh=deferred();const queue=[old,fresh];let failures=0,received;
 const refresh=createHistoryRefresh(()=>queue.shift().promise,data=>received=data,()=>failures++);
 const a=refresh(),b=refresh();fresh.resolve('new history');await b;old.reject(Error('offline'));await a;
 assert.equal(received,'new history');assert.equal(failures,0);
});
test('history upper boundary includes a server-stamped close despite a slow browser clock',()=>{
 let local=Date.parse('2026-11-09T16:00:00Z');const clock=createHistoryClock(()=>local);
 assert.equal(clock.now(),local);
 const close=Date.parse('2026-11-09T16:00:03Z');clock.observe('2026-11-09T16:00:04Z');
 assert.ok(clock.now()>=close);local+=2000;assert.equal(clock.now(),Date.parse('2026-11-09T16:00:06Z'));
 clock.observe('invalid');assert.ok(Number.isFinite(clock.now()));
});
