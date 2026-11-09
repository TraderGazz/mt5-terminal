import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceCompatibleValuation } from '../services/transfer-source-valuation.js';
import { createLivePreviewState } from '../services/transfer-live-preview.js';
const time='2026-11-09T15:27:55Z';const now=Date.parse(time);
const reference={symbol:'USDRUBrfd',bid:81.8512,ask:82.0012,time};
const fx={...reference,bid:82.3358,ask:82.4858};
const quote={symbol:'EURUSDrfd',bid:1.11910,ask:1.11924,time};
function fixture(){
 const buy={id:1,symbol:'EURUSDrfd',type:'buy',volume:1,openPrice:1.20212,currentPrice:1.11369,profit:-725136.61,swap:-100,commission:0};
 const sell={id:2,symbol:'EURUSDrfd',type:'sell',volume:1,openPrice:1.13366,currentPrice:1.11369,profit:161737.97,swap:-20,commission:0};
 const models=[buy,sell].map(raw=>({originalTicket:raw.id,raw,view:{...raw,profit:raw.type==='buy'?raw.profit:(raw.openPrice-raw.currentPrice)*100000*(reference.bid+reference.ask)/2},valuation:{units:100000,direction:raw.type==='buy'?1:-1,referenceRate:(reference.bid+reference.ask)/2,anchorGross:0,accountCurrency:'RUB',profitCurrency:'USD',conversionSymbol:'USDRUBrfd'}}));
 const saved={captured_at:'2026-11-07T09:17:13Z',payload:{referenceQuotes:{USDRUBrfd:reference},settings:{position_overrides:[]}},account_view:{}};
 return {saved,positions:models.map(model=>({model}))};
}
test('broker regression: negative BUY uses FX Ask, positive SELL uses FX Bid and closes at Ask',()=>{
 const {saved,positions}=fixture();const value=createSourceCompatibleValuation(saved,positions)({EURUSDrfd:quote,USDRUBrfd:fx},{now});
 assert.equal(value.apiPositions[0].profit,-684797.11); // actual broker diagnostic
 assert.ok(Math.abs(value.apiPositions[1].profit-119990.1248)<.000001);
 assert.equal(value.positions[1].profit,118836.37); // original browser reprices Bid API to Ask
 assert.equal(value.positions[1].currentPrice,1.11924);
 assert.equal(value.brokerProfitDelta,-2670.25); // BUY +40339.50, SELL -43009.75
 assert.equal(value.accountDelta,-2670.25); // unedited positions never add source SELL fix to account
});
test('reference prices preserve original rows and account anchor; swap frozen',()=>{
 const {saved,positions}=fixture();const q={...quote,bid:1.11369,ask:1.11390};
 const value=createSourceCompatibleValuation(saved,positions)({EURUSDrfd:q,USDRUBrfd:reference},{now});
 assert.equal(value.accountDelta,0);assert.equal(value.brokerProfitDelta,0);
 assert.equal(value.apiPositions[0].profit,positions[0].model.view.profit);
 assert.equal(value.swap,-120);
});
test('manual price/profit offsets are preserved; displayed lot never becomes valuation lot',()=>{
 const {saved,positions}=fixture();saved.payload.settings.position_overrides=[{ticket:1,open_price_override:1.1342,profit_offset:11000,volume_override:5}];
 const m=positions[0].model;m.view={...m.view,openPrice:1.1342,volume:5,
  profit:Math.round((m.raw.profit/(m.raw.currentPrice-m.raw.openPrice)*(m.raw.currentPrice-1.1342)+11000)*100)/100};
 const value=createSourceCompatibleValuation(saved,positions)({EURUSDrfd:quote,USDRUBrfd:fx},{now});
 const expected=Math.round((-684797.11/(1.1191-1.20212)*(1.1191-1.1342)+11000)*100)/100;
 assert.equal(value.positions[0].profit,expected);assert.equal(value.positions[0].volume,5);
 assert.notEqual(value.accountDelta,value.brokerProfitDelta);
 const other={...quote,bid:1.1192,ask:1.11934};
 const moved=createSourceCompatibleValuation(saved,positions)({EURUSDrfd:other,USDRUBrfd:fx},{now});
 assert.ok(Math.abs(moved.positions[0].profit-value.positions[0].profit)<1000);
});
test('margin level uses raw broker equity delta and margin; site equity uses the separate override delta',async()=>{
 const {saved,positions}=fixture();saved.account_view={balance:70910502.15,equity:53672528.96,freeMargin:2690359.65,floatingProfit:-8057762.67,margin:48982623.97,marginLevel:159.62};
 saved.payload.brokerAccount={margin:24982623.97,equity:34809590.32,margin_level:139.34};
 const valuation={positions:[],profit:0,accountDelta:849530.70,brokerProfitDelta:723131.26};
 const state=await createLivePreviewState({saved,positions,quoteCheck:async()=>({status:'ready',valuation,quotes:[]})})();
 assert.equal(state.account.equity,54522059.66);assert.equal(state.account.marginLevel,162.51);
 assert.equal(state.account.freeMargin,3539890.35);assert.equal(state.account.balance,70910502.15);
});
test('source-compatible valuation still rejects stale quotes',()=>{
 const {saved,positions}=fixture();assert.throws(()=>createSourceCompatibleValuation(saved,positions)({EURUSDrfd:quote,USDRUBrfd:fx},{now:now+61000}),/quote/);
});

test('BUY becoming profitable switches conversion to FX Bid',()=>{
 const {saved,positions}=fixture();const q={...quote,bid:1.203,ask:1.20314};
 const value=createSourceCompatibleValuation(saved,positions)({EURUSDrfd:q,USDRUBrfd:fx},{now});
 assert.equal(value.apiPositions[0].profit,7245.55);
});
