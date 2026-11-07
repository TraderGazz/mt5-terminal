import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { normalizePosition } from '../services/mt5-bridge/normalize.js';
import { inspectTransferSnapshot, prepareTransfer, valueTransferredPosition,
  importPreparedTransfer, closeTransferredPosition, transferCaptureSignature } from '../services/transfer-staging.js';

const now = Date.parse('2026-11-07T10:00:00Z');
const specs = {EURUSDrfd: {calculation:'forex', contractSize:100000, referenceRate:80,
  profitCurrency:'USD', accountCurrency:'RUB', conversionSymbol:'USDRUBrfd'}};
function snapshot() {
  const raw = {ticket:123, symbol:'EURUSDrfd', type:0, volume:1, price_open:1.12,
    price_current:1.11, time:1793700000, profit:-80000, swap:-500, commission:-2, sl:0, tp:0};
  const view = {...normalizePosition(raw), volume:5, openPrice:1.13, profit:-140000, swap:-1500};
  return {version:1, completedAt:new Date(now).toISOString(),
    brokerAccount:{login:'2000108452', currency:'RUB'}, brokerPositions:{opened:[raw]},
    sitePositions:{positions:[view]}, siteAccount:{account:{currency:'RUB',balance:1000000,
      equity:858498,margin:10000,freeMargin:848498,marginLevel:8584.98,floatingProfit:-141502}}};
}
function quotes(bid=1.11, ask=1.1102, rate=80) {
  return {EURUSDrfd:{symbol:'EURUSDrfd',bid,ask,time:new Date(now).toISOString()},
    USDRUBrfd:{symbol:'USDRUBrfd',bid:rate-.01,ask:rate+.01,time:new Date(now).toISOString()}};
}
function plan(s=snapshot()) { return prepareTransfer(s,'2000108452','2000138707',specs); }

test('snapshot rejects wrong account, unequal ticket sets and duplicates',()=>{
  assert.throws(()=>inspectTransferSnapshot(snapshot(),'wrong','new'));
  const s=snapshot(); s.sitePositions.positions[0].id=456;
  assert.throws(()=>plan(s));
  const d=snapshot(); d.brokerPositions.opened.push(d.brokerPositions.opened[0]);
  assert.throws(()=>plan(d));
});
test('valuation preserves anchor, cosmetic lot and accumulated swap',()=>{
  const model=plan().positions[0];
  const value=valueTransferredPosition(model,quotes(),{now});
  assert.equal(value.profit,-140000);
  assert.equal(value.volume,5);
  assert.equal(value.swap,-1500);
  assert.equal(value.commission,-2);
  const moved=valueTransferredPosition(model,quotes(1.111,1.1112),{now});
  assert.equal(moved.profit,-132000); // actual one lot, not display five lots
});
test('sell closes at ask and currency conversion continues to change P/L',()=>{
  const s=snapshot(); s.brokerPositions.opened[0].type=1;
  s.sitePositions.positions[0].type='sell';
  const model=plan(s).positions[0];
  const value=valueTransferredPosition(model,quotes(1.1098,1.11),{now});
  assert.equal(value.profit,-140000);
  assert.equal(valueTransferredPosition(model,quotes(1.1098,1.11,81),{now}).profit,-138000);
});
test('missing, stale, crossed and future quotes cannot execute a close',()=>{
  const model=plan().positions[0];
  assert.throws(()=>valueTransferredPosition(model,{}, {now}));
  assert.throws(()=>valueTransferredPosition(model,quotes(),{now:now+60001}));
  assert.throws(()=>valueTransferredPosition(model,quotes(1.2,1.1),{now}));
  assert.throws(()=>valueTransferredPosition(model,quotes(),{now:now-10000}));
  assert.throws(()=>prepareTransfer(snapshot(),'2000108452','2000138707',{}));
});

test('PostgreSQL staging import and concurrent close', {skip:!process.env.TEST_DATABASE_URL}, async t=>{
  const schema=`transfer_test_${process.pid}_${Date.now()}`;
  const admin=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL, options:`-c search_path=${schema}`,max:4});
  const transaction=async work=>{
    const client=await pool.connect();
    try { await client.query('BEGIN'); const r=await work(client); await client.query('COMMIT'); return r; }
    catch(e) { await client.query('ROLLBACK'); throw e; }
    finally {client.release();}
  };
  try {
    const ddl=await readFile(new URL('../../database/migrations/017_transfer_staging.sql',import.meta.url),'utf8');
    await pool.query(ddl); await pool.query(ddl);
    const s=snapshot(), prepared=plan(s);
    const results=await Promise.all([1,2].map(()=>transaction(c=>importPreparedTransfer(c,prepared,s))));
    assert.equal(results.filter(r=>r.imported).length,1);
    assert.equal(results[0].id,results[1].id);
    const {rows:[position]}=await pool.query('SELECT * FROM transferred_positions');
    await assert.rejects(transaction(c=>closeTransferredPosition(c,position.id,{},'admin',{now})));
    assert.equal((await pool.query('SELECT status FROM transferred_positions')).rows[0].status,'open');
    const closes=await Promise.all([1,2].map(()=>transaction(c=>closeTransferredPosition(c,position.id,quotes(),'admin',{now}))));
    assert.equal(closes[0].total,closes[1].total);
    assert.equal(Number(closes[0].total),-141502);
    assert.equal((await pool.query('SELECT COUNT(*) AS n FROM transferred_position_closures')).rows[0].n,'1');
    const retry=await transaction(c=>closeTransferredPosition(c,position.id,{},'admin',{now:now+999999}));
    assert.equal(retry.total,closes[0].total);
    // The original full source data and branded account are retained exactly.
    assert.deepEqual((await pool.query('SELECT payload FROM transfer_snapshots')).rows[0].payload,s);
    await t.test('partial failed import is fully rolled back',async()=>{
      const other=plan(s); other.snapshotHash='different'; other.positions.push(other.positions[0]);
      await assert.rejects(transaction(c=>importPreparedTransfer(c,other,s)));
      assert.equal((await pool.query('SELECT COUNT(*) AS n FROM transfer_snapshots')).rows[0].n,'1');
    });
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});

test('anchor preserves displayed half-kopeck values despite floating-point cancellation',()=>{
  const model=plan().positions[0];
  model.view.profit=2.675;
  assert.equal(valueTransferredPosition(model,quotes(),{now}).profit,2.68);
});


test('capture stability ignores sync timestamps and order, but detects price and setting changes', () => {
  const state = {account:{balance:100},positions:[{id:2,profit:10},{id:1,profit:20}]};
  const settings = {accounts:[{id:1,balance:'100',updated_at:'old'}],position_overrides:[{ticket:'2',profit_offset:'10',updated_at:'old'}]};
  const hash = transferCaptureSignature(state,settings);
  const later = structuredClone(settings);
  later.accounts[0].updated_at = 'new';
  assert.equal(hash,transferCaptureSignature({...state,positions:[...state.positions].reverse()},later));
  assert.deepEqual(state.positions.map(p=>p.id),[2,1]);
  later.position_overrides[0].profit_offset = '11';
  assert.notEqual(hash,transferCaptureSignature(state,later));
  const moved = structuredClone(state);
  moved.positions[0].profit = 9;
  assert.notEqual(hash,transferCaptureSignature(moved,settings));
});
