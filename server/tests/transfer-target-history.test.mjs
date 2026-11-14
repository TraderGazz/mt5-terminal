import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTargetHistory} from '../services/transfer-target-history.js';
import {buildHistory} from '../services/history.js';
import {addMoney} from '../services/money.js';
const startedAt='2026-11-09T18:57:58Z';
const opening={ticket:11,positionId:42,type:'buy',entry:'in',symbol:'EURUSDrfd',volume:1,price:1.12,profit:0,swap:0,commission:-1.01,time:'2026-11-13T09:00:00Z'};
const close=(ticket,volume,profit,time)=>({...opening,ticket,type:'sell',entry:'out',volume,price:1.13,profit,swap:-2,commission:-0.10,time});
test('opening is a leg and charge, not a closed position; balance deposits are excluded',()=>{
 const h=buildTargetHistory([opening,{ticket:1,type:'balance',profit:900100,time:opening.time}],{startedAt});
 assert.equal(h.rows.length,0);assert.equal(h.legs.length,1);assert.equal(h.charges[0].commission,-1.01);
 assert.equal(buildHistory(h.rows,{tradeCharges:h.charges,period:'all'}).totals.balance,-1.01);
 assert.equal(h.legs[0].positionId,4000000000000042);
});
test('partial closes allocate entry fees exactly once, repeat in any order and preserve total financial result',()=>{
 const a=close(12,0.5,100,'2026-11-13T10:00:00Z');
 const partial=buildTargetHistory([a,opening,opening],{startedAt});
 assert.equal(partial.rows.length,1);assert.equal(partial.rows[0].dealType,'buy');assert.equal(partial.rows[0].commission,-0.61);assert.equal(partial.charges[0].commission,-0.50);
 const b=close(13,0.5,-50,'2026-11-13T11:00:00Z');
 const h=buildTargetHistory([b,a,opening],{startedAt});assert.deepEqual(buildTargetHistory([opening,a,b,b],{startedAt}),h);
 assert.equal(h.charges.length,0);assert.equal(h.rows[1].commission,-0.6);
 const expected=addMoney(...[opening,a,b].map(d=>addMoney(d.profit,d.swap,d.commission)));
 assert.equal(expected,44.79);assert.equal(buildHistory(h.rows,{period:'all'}).totals.balance,expected);
 assert.equal(h.rows[0].positionId,h.rows[1].positionId);
 assert.notEqual(h.rows[0].positionId,42);
});
test('missing entry, reversed side, unsupported netting and conflicting duplicates fail rather than losing money',()=>{
 assert.throws(()=>buildTargetHistory([close(12,1,10,'2026-11-13T10:00:00Z')],{startedAt}),/Incomplete/);
 assert.throws(()=>buildTargetHistory([opening,{...close(12,1,10,'2026-11-13T10:00:00Z'),type:'buy'}],{startedAt}),/side/);
 assert.throws(()=>buildTargetHistory([opening,{...opening,ticket:12,entry:'inout'}],{startedAt}),/hedge/);
 assert.throws(()=>buildTargetHistory([opening,{...opening,commission:-5}],{startedAt}),/Conflicting/);
});
