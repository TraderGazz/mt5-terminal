import test from 'node:test';
import assert from 'node:assert/strict';
import {buildHistory} from '../services/history.js';
const common={positionId:2027654472,symbol:'EURUSDrfd',dealType:'buy',openTime:'2026-01-28T00:01:07Z',openPrice:1.20212,commission:0};
const feb={...common,ticket:2024206862,volume:1.5,closeTime:'2026-02-27T20:30:22Z',closePrice:1.1823,profit:-228364.75,swap:-25742.33};
const mar={...common,ticket:2024803328,volume:2.5,closeTime:'2026-03-12T06:12:38Z',closePrice:1.15438,profit:-945882.17,swap:-60714.11};
const nov={...common,ticket:-8000000000000001,volume:1,openPrice:1.1342,closeTime:'2026-11-09T17:32:42.276Z',closePrice:1.12072,profit:-99904.9,swap:-13600.52};
test('position takes last actual close date and price regardless of database order',()=>{
 for(const deals of [[nov,mar,feb],[feb,mar,nov],[mar,nov,feb]]){
  const result=buildHistory(deals,{tab:'positions',period:'all'});const row=result.rows[0];
  assert.equal(row.ticket,2027654472);assert.equal(row.volume,5);
  assert.equal(row.closeTime,nov.closeTime);assert.equal(row.closePrice,nov.closePrice);
  assert.equal(Math.round(row.profit*100)/100,-1274151.82);
  assert.equal(Math.round(row.swap*100)/100,-100056.96);
 }
});
test('recent final close is visible at end of PC ascending history and balances are counted once',()=>{
 const other={...common,positionId:77,ticket:78,volume:1,closeTime:'2026-11-06T15:42:55Z',closePrice:1.11525,profit:166027.71,swap:0};
 const before=buildHistory([mar,feb,other],{tab:'positions',period:'all'});
 const after=buildHistory([nov,mar,feb,other],{tab:'positions',period:'all'});
 const pc=after.rows.toSorted((a,b)=>Date.parse(a.closeTime)-Date.parse(b.closeTime));
 assert.equal(pc.at(-1).ticket,2027654472);assert.equal(after.counts.positions,before.counts.positions);
 assert.equal(Math.round((after.totals.balance-before.totals.balance)*100)/100,-113505.42);
 const raw=buildHistory([nov,mar,feb],{tab:'deals',period:'all'});
 assert.equal(raw.rows.length,3);assert.equal(raw.rows[0].ticket,nov.ticket);
});
