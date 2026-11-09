import test from 'node:test';
import assert from 'node:assert/strict';
import { composeTransferHybrid, targetPositionId } from '../services/transfer-hybrid-rehearsal.js';
const startedAt='2026-11-09T09:00:00Z';
const oldState={account:{currency:'RUB',balance:70910502.15,equity:54000000,freeMargin:3000000,margin:48982623.97,floatingProfit:-16910502.15,marginLevel:163},positions:[{id:42,profit:-100}]};
const account={login:2000138707,currency:'RUB',balance:900100,equity:900100,margin:0};
const position={id:42,type:'buy',symbol:'EURUSDrfd',volume:1,openPrice:1.12,currentPrice:1.121,openTime:startedAt,profit:8234.3,swap:-12,commission:-5};
const deal=(ticket,type='buy',profit=0,commission=0,entry='in')=>({ticket,type,profit,swap:0,commission,entry,time:startedAt});
const run=(extra={})=>composeTransferHybrid({oldState,targetLogin:'2000138707',currency:'RUB',startedAt,account,positions:[],deals:[],...extra});

test('empty target preserves site account despite starting balance, deposits, withdrawals and credit',()=>{
 const initial=run();assert.deepEqual(initial.account,oldState.account);
 const changed=run({account:{...account,balance:9900100,equity:9900100},deals:[deal(1,'balance',900100),deal(2,'deposit',8000000),deal(3,'withdrawal',-200),deal(4,'credit',1000)]});
 assert.deepEqual(changed,initial);
});
test('same broker ticket stays separate; floating and opening commission enter account once',()=>{
 const result=run({positions:[position],account:{...account,margin:1000},deals:[deal(1,'buy',0,-5)]});
 assert.equal(result.positions.length,2);assert.equal(result.positions[0].id,42);assert.equal(result.positions[1].id,targetPositionId(42));
 assert.equal(result.positions[1].commission,0);assert.equal(result.account.balance,70910497.15);
 assert.equal(result.account.equity,54008217.3);assert.equal(result.account.freeMargin,3007217.3);
 assert.equal(result.account.margin,48983623.97);assert.equal(result.accounting.marginLevelNeedsBasis,true);
 assert.equal(oldState.positions.length,1);
});
test('closing transfers floating into realized without moving equity at identical prices; repeated full polls are idempotent',()=>{
 const opening=deal(1,'buy',0,-5);const open=run({positions:[position],deals:[opening]});
 const closing={...deal(2,'sell',8234.3,0,'out'),swap:-12};
 const closed=run({deals:[opening,closing]});assert.equal(closed.account.equity,open.account.equity);
 assert.equal(closed.account.balance,70918719.45);assert.equal(closed.positions.length,1);
 assert.deepEqual(run({deals:[opening,closing,closing]}),closed);
 assert.deepEqual(run({deals:JSON.parse(JSON.stringify([opening,closing]))}),closed);
});
test('partial closes, buy/sell legs and cent amounts reconcile independently of broker balance',()=>{
 const result=run({deals:[deal(1,'buy',0,-0.01),deal(2,'sell',1.02,-0.01,'out'),deal(3,'sell',-2.01,0,'out_by')]});
 assert.equal(result.accounting.realized,-1.01);assert.equal(result.account.balance,70910501.14);
 const before={...deal(4,'buy',999999),time:'2026-11-09T08:59:59Z'};
 assert.deepEqual(run({deals:[before]}),run());
});
test('rejects wrong account, conflicting history, invalid money, duplicate positions and unsupported financial types',()=>{
 assert.throws(()=>run({account:{...account,login:1}}),/mismatch/);
 assert.throws(()=>run({deals:[deal(1),deal(1,'buy',1)]}),/Conflicting/);
 assert.throws(()=>run({deals:[deal(1,'charge',-1)]}),/Unsupported/);
 assert.throws(()=>run({positions:[position,position]}),/collision/);
 assert.throws(()=>run({positions:[{...position,profit:NaN}]}),/profit/);
 assert.throws(()=>run({positions:[{...position,openTime:'2026-11-08T09:00:00Z'}]}),/predates/);
 assert.throws(()=>targetPositionId(Number.MAX_SAFE_INTEGER),/ticket/);
});
