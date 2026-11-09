import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransferQuoteCheck } from '../services/transfer-quote-check.js';
const now=Date.parse('2026-11-09T09:00:00Z');
const saved={target_login:'2000138707',account_view:{currency:'RUB',balance:70910502.15}};
const model={raw:{symbol:'EURUSDrfd',type:'buy'},view:{openPrice:1.12,profit:-80000,swap:-500,commission:0},
 valuation:{units:100000,direction:1,anchorGross:-80000,conversionSymbol:'USDRUBrfd'}};
function setup({stale=false,login=2000138707,crossed=false,fail=false}={}) {
 const calls=[];
 const fetchImpl=async url=>{
  calls.push(url.pathname+url.search);
  if(fail) return {ok:false,status:500};
  const data=url.pathname.endsWith('account') ? {login,currency:'RUB',balance:900100} :
   {symbol:url.searchParams.get('symbol'),bid: url.searchParams.get('symbol')==='EURUSDrfd'?1.111:80,
    ask:url.searchParams.get('symbol')==='EURUSDrfd'?(crossed?1.10:1.1112):80,
    time:stale?'2026.11.06T23:54:59Z':'2026.11.09T12:00:00Z'};
  return {ok:true,json:async()=>data};
 };
 return {calls,check:createTransferQuoteCheck({baseUrl:'http://172.17.0.3:8890/v1',saved,positions:[{model}],fetchImpl,now:()=>now})};
}
test('reads only fixed quote endpoints, converts broker time, values real volume and preserves site balance',async()=>{
 const {check,calls}=setup();const result=await check();
 assert.equal(result.status,'ready'); assert.equal(result.valuation.profit,-72000);
 assert.equal(result.valuation.swap,-500);assert.equal(saved.account_view.balance,70910502.15);
 assert.equal(result.quotes[0].time,'2026-11-09T09:00:00.000Z');
 assert.deepEqual(calls,['/v1/account','/v1/quote?symbol=EURUSDrfd','/v1/quote?symbol=USDRUBrfd']);
});
test('weekend quotes are diagnostic only; no valuation returned',async()=>{
 const result=await setup({stale:true}).check();assert.equal(result.status,'stale');assert.equal(result.valuation,null);
});
test('wrong account stops before quotes; failed and crossed responses rejected',async()=>{
 const wrong=setup({login:1}); await assert.rejects(wrong.check,/account/);assert.equal(wrong.calls.length,1);
 await assert.rejects(setup({fail:true}).check,/500/);
 await assert.rejects(setup({crossed:true}).check,/quote/);
});
test('rejects public bridges and deduplicates concurrent readers',async()=>{
 assert.throws(()=>createTransferQuoteCheck({baseUrl:'http://example.com:8890/v1'}),/private/);
 const {check,calls}=setup();const [a,b]=await Promise.all([check(),check()]);assert.equal(a,b);assert.equal(calls.length,3);
});

test('fresh EURUSD and final RUB session rate allow valuation after RUB trading ends',async()=>{
 const check=createTransferQuoteCheck({baseUrl:'http://172.17.0.3:8890/v1',saved,positions:[{model}],
  now:()=>Date.parse('2026-11-09T16:05:04Z'),fetchImpl:async url=>({ok:true,json:async()=>
   url.pathname.endsWith('account')?{login:2000138707,currency:'RUB'}:
   url.searchParams.get('symbol')==='EURUSDrfd'?{symbol:'EURUSDrfd',bid:1.111,ask:1.1112,time:'2026.11.09T19:05:04Z'}:
   {symbol:'USDRUBrfd',bid:80,ask:80,time:'2026.11.09T18:54:59Z'}})});
 const result=await check();assert.equal(result.status,'ready');
 assert.equal(result.quotes[1].fresh,false);assert.equal(result.quotes[1].usable,true);
 assert.equal(result.quotes[1].reason,'conversion-session-close');assert.equal(result.valuation.profit,-72000);
});

test('desktop candles share the single-request bridge queue and reject invalid parameters',async()=>{
 let active=0,maximum=0;const paths=[];
 const fetchImpl=async url=>{active++;maximum=Math.max(maximum,active);paths.push(url.pathname);await new Promise(r=>setTimeout(r,2));active--;
  return{ok:true,json:async()=>url.pathname.endsWith('account')?{login:2000138707,currency:'RUB'}:
    url.pathname.endsWith('history/prices')?{data:[{time:'2026.11.09T12:00:00',open:1.1,high:1.12,low:1.09,close:1.11}]}:
    {symbol:url.searchParams.get('symbol'),bid:80,ask:80,time:'2026.11.09T12:00:00'}};};
 const check=createTransferQuoteCheck({baseUrl:'http://172.17.0.3:8890/v1',saved,positions:[{model}],fetchImpl,now:()=>now});
 const [,chart]=await Promise.all([check(),check.candles({timeframe:'H4'})]);
 assert.equal(maximum,1);assert.equal(chart.bars[0].time,now/1000);assert.ok(paths.every(p=>['/v1/account','/v1/quote','/v1/history/prices'].includes(p)));
 const count=paths.length;await assert.rejects(check.candles({timeframe:'constructor'}));await assert.rejects(check.candles({symbol:'../../order/open'}));
 assert.equal(paths.length,count);
});

test('EA receives literal ISO date colons rather than percent-encoded query values',async()=>{
 let historyUrl;
 const check=createTransferQuoteCheck({baseUrl:'http://172.17.0.3:8890/v1',saved,positions:[{model}],now:()=>now,
  fetchImpl:async url=>{
   if(url.pathname.endsWith('history/prices')){
    historyUrl=url.href;
    // Reproduce the EA parser: split raw query without URL decoding.
    const params=Object.fromEntries(url.search.slice(1).split('&').map(p=>p.split('=')));
    assert.match(params.from_date,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    assert.equal(params.to_date,'2026-11-09T12:00:00');
    return{ok:true,json:async()=>({data:[{time:'2026.11.09T12:00:00',open:1.1,high:1.12,low:1.09,close:1.11}]})};
   }
   return{ok:true,json:async()=>url.pathname.endsWith('account')?{login:2000138707,currency:'RUB'}:{symbol:'EURUSDrfd',bid:1.11,ask:1.1102,time:'2026.11.09T12:00:00'}};
  }});
 const result=await check.candles({timeframe:'H4'});assert.equal(result.bars.length,1);assert.equal(historyUrl.includes('%3A'),false);
});
