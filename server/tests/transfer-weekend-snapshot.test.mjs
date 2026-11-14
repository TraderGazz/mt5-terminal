import test from 'node:test';
import assert from 'node:assert/strict';
import {createTransferQuoteCheck} from '../services/transfer-quote-check.js';
const now=Date.parse('2026-11-14T12:00:00Z');
const saved={target_login:'new',account_view:{currency:'RUB'}};
const positions=[{model:{raw:{type:'buy',symbol:'EURUSDrfd'},view:{id:1,openPrice:1.12,profit:-1000,swap:-50,commission:0},valuation:{direction:1,units:100000,anchorGross:-80000,conversionSymbol:'USDRUBrfd'}}}];
function check({allow=false,eur='2026.11.13T23:54:59Z'}={}){return createTransferQuoteCheck({baseUrl:'http://127.0.0.1:8890/v1',saved,positions,now:()=>now,allowWeekendSnapshot:allow,fetchImpl:async url=>({ok:true,json:async()=>url.pathname.endsWith('account')?{login:'new',currency:'RUB'}:{symbol:url.searchParams.get('symbol'),bid:url.searchParams.get('symbol')==='EURUSDrfd'?1.11:80,ask:url.searchParams.get('symbol')==='EURUSDrfd'?1.1102:80,time:url.searchParams.get('symbol')==='EURUSDrfd'?eur:'2026.11.13T18:54:59Z'}})});}
test('weekend display uses Friday snapshot explicitly; default execution reader still blocks stale quotes',async()=>{
 assert.equal((await check()()).status,'stale');const snapshot=await check({allow:true})();
 assert.equal(snapshot.status,'ready');assert.equal(snapshot.marketClosed,true);assert.equal(snapshot.valuation.profit,-1000);
 const eur=snapshot.quotes.find(q=>q.symbol==='EURUSDrfd');assert.equal(eur.fresh,false);assert.equal(eur.reason,'weekend-snapshot');
 assert.equal((await check({allow:true,eur:'2026.11.12T23:54:59Z'})()).status,'stale');
});
