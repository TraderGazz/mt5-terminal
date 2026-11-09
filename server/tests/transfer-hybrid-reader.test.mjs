import test from 'node:test';
import assert from 'node:assert/strict';
import { createHybridTransferReader } from '../services/transfer-hybrid-reader.js';
const now=Date.parse('2026-11-09T19:00:00Z');
const saved={id:1,target_login:'2000138707',captured_at:new Date(now),account_view:{currency:'RUB',balance:70910502.15,equity:54000000,margin:48982623.97,freeMargin:3000000,floatingProfit:-16910502.15,marginLevel:163},payload:{brokerAccount:{margin:25000000,equity:34000000,margin_level:136}}};
const positions=[{model:{view:{profit:-100}}}];
const baseline={snapshot_id:1,target_login:'2000138707',currency:'RUB',started_at:'2026-11-09T18:57:58Z',broker_balance_excluded:'900100.00'};
function setup(target={account:{login:2000138707,currency:'RUB',balance:900100,margin:0},opened:[],pending:[],deals:[]}){
 const check=async()=>({status:'ready',targetLogin:'2000138707',quotes:[],valuation:{positions:[{id:42,profit:-100}],profit:-100,accountDelta:0,brokerProfitDelta:0}});
 check.targetState=async({from})=>{assert.equal(from,'2026-11-09T18:57:58.000Z');return target;};
 return createHybridTransferReader({saved,positions,baseline,quoteCheck:check,now:()=>now});
}
const raw={ticket:42,type:'POSITION_TYPE_BUY',symbol:'EURUSDrfd',volume:1,price_open:1.12,price_current:1.121,time:'2026.11.09T22:00:00Z',profit:100,swap:-2};
const opening={ticket:101,type:'DEAL_TYPE_BUY',entry:'DEAL_ENTRY_IN',time:'2026.11.09T22:00:00Z',profit:0,swap:0,commission:-5};
test('empty live target preserves account exactly, ignores broker balance, uses persisted UTC baseline',async()=>{
 const state=await setup()();assert.deepEqual(state.account,saved.account_view);assert.equal(state.positions.length,1);assert.equal(state.source.readOnly,true);
});
test('raw EA deals normalize once; new position/account and margin basis include one opening commission',async()=>{
 const target={account:{login:2000138707,currency:'RUB',balance:900095,margin:1000},opened:[raw],pending:[],deals:[opening]};
 const read=setup(target);const state=await read();assert.deepEqual(await read(),state);
 assert.equal(state.positions[1].openTime,'2026-11-09T19:00:00.000Z');assert.equal(state.positions[1].origin.ticket,42);
 assert.equal(state.account.balance,70910497.15);assert.equal(state.account.equity,54000093);assert.equal(state.account.freeMargin,2999093);
 assert.equal(state.accounting.marginLevelNeedsBasis,false);
 assert.equal(state.account.marginLevel,Math.round(((34000000+93)/(25000000+1000)*100+27)*100)/100);
});
test('fails closed on pending orders, unknown deal types, missing money and wrong account',async()=>{
 const base={account:{login:2000138707,currency:'RUB',margin:0},opened:[],pending:[],deals:[]};
 await assert.rejects(setup({...base,pending:[{}]}),/Pending/);
 await assert.rejects(setup({...base,deals:[{...opening,type:'DEAL_TYPE_CHARGE'}]}),/Unsupported/);
 await assert.rejects(setup({...base,opened:[{...raw,profit:null}]}),/profit/);
 await assert.rejects(setup({...base,account:{...base.account,login:1}}),/mismatch/);
});
