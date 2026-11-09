import test from 'node:test';
import assert from 'node:assert/strict';
import {transferQuoteStatus} from '../services/transfer-quote-policy.js';
const q=(time,symbol='USDRUBrfd')=>({symbol,bid:82.388,ask:82.538,time});
const at=(quote,now,conversion=true)=>transferQuoteStatus(quote,{now:Date.parse(now),conversion});
test('Monday RUB close may convert a fresh EURUSD execution after 18:55 MSK',()=>{
 const quote=q('2026-11-09T15:54:59Z');
 assert.equal(at(quote,'2026-11-09T16:05:04Z').reason,'conversion-session-close');
 assert.equal(at(quote,'2026-11-09T16:05:04Z',false).usable,false);
 assert.equal(at(q(quote.time,'EURUSDrfd'),'2026-11-09T16:05:04Z').usable,false);
});
test('last close carries overnight and weekend only until next RUB session opens',()=>{
 const monday=q('2026-11-09T15:54:59Z');
 assert.equal(at(monday,'2026-11-10T06:04:59Z').usable,true);
 assert.equal(at(monday,'2026-11-10T06:05:00Z').usable,false);
 const friday=q('2026-11-06T15:54:59Z');
 assert.equal(at(friday,'2026-11-09T06:04:59Z').usable,true);
 assert.equal(at(friday,'2026-11-09T06:05:00Z').usable,false);
 assert.equal(at(friday,'2026-11-09T16:00:00Z').usable,false);
});
test('missing session ticks, wrong close date, invalid prices and stale execution stay blocked',()=>{
 assert.equal(at(q('2026-11-09T15:40:00Z'),'2026-11-09T16:05:00Z').usable,false);
 assert.equal(at(q('2026-11-06T15:54:59Z'),'2026-11-09T16:05:00Z').usable,false);
 assert.equal(at({...q('2026-11-09T15:54:59Z'),bid:0},'2026-11-09T16:05:00Z').usable,false);
 assert.equal(at({...q('2026-11-09T15:54:59Z'),ask:1},'2026-11-09T16:05:00Z').usable,false);
 assert.equal(at(q('2026-11-09T14:00:00Z'),'2026-11-09T14:10:00Z').usable,false);
 assert.equal(at(q('2026-11-09T16:05:10Z'),'2026-11-09T16:05:00Z').usable,false);
});
