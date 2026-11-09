import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {normalizePosition} from '../services/mt5-bridge/normalize.js';
import {prepareTransfer,importPreparedTransfer} from '../services/transfer-staging.js';
import {closeRehearsalPosition} from '../services/transfer-close-rehearsal.js';
test('separate close clone: atomic history/balance settlement, repeated close and exact restore',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const root=process.env.TEST_DATABASE_URL;const admin=new pg.Client({connectionString:root});await admin.connect();
 const database='terminal_migration_test_close_int_'+process.pid+'_'+Date.now();
 await admin.query('CREATE DATABASE '+database);const url=new URL(root);url.pathname='/'+database;
 const pool=new pg.Pool({connectionString:url.href,max:3});
 const now=Date.parse('2026-11-09T15:00:00Z');
 const raw={ticket:123,symbol:'EURUSDrfd',type:0,volume:1,price_open:1.12,price_current:1.11,profit:-80000,swap:-500,commission:0,time:1793700000,sl:0,tp:0};
 const view=normalizePosition(raw);
 const account={login:'branding',currency:'RUB',balance:1000000,equity:919500,margin:100000,freeMargin:819500,marginLevel:919.5,floatingProfit:-80500};
 const snapshot={version:1,completedAt:new Date(now).toISOString(),brokerAccount:{login:'old',currency:'RUB',profit:-80500,equity:919500,margin:100000,margin_level:919.5},
  brokerPositions:{opened:[raw]},sitePositions:{positions:[view]},siteAccount:{account},settings:{position_overrides:[]},
  referenceQuotes:{USDRUBrfd:{symbol:'USDRUBrfd',bid:79.9,ask:80,time:new Date(now).toISOString()}}};
 const specs={EURUSDrfd:{calculation:'forex',contractSize:100000,referenceRate:79.95,accountCurrency:'RUB',profitCurrency:'USD',conversionSymbol:'USDRUBrfd'}};
 const quotes={EURUSDrfd:{symbol:'EURUSDrfd',bid:1.111,ask:1.1112,time:new Date(now).toISOString()},USDRUBrfd:snapshot.referenceQuotes.USDRUBrfd};
 async function tx(work){const c=await pool.connect();try{await c.query('BEGIN');const result=await work(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 try{
  await pool.query(await readFile(new URL('../../database/init.sql',import.meta.url),'utf8'));
  await pool.query(await readFile(new URL('../../database/migrations/017_transfer_staging.sql',import.meta.url),'utf8'));
  await tx(c=>importPreparedTransfer(c,prepareTransfer(snapshot,'old','new',specs),snapshot));
  const {rows:[position]}=await pool.query('SELECT * FROM transferred_positions');
  const initialHistory=(await pool.query('SELECT count(*)::int AS n FROM trades')).rows[0].n;
  await assert.rejects(tx(c=>closeRehearsalPosition(c,position.id,quotes,'admin',{now:now+61000})),/quote/);
  await pool.query("ALTER TABLE trades ADD CONSTRAINT reject_rehearsal CHECK (source<>'transfer-rehearsal') NOT VALID");
  await assert.rejects(tx(c=>closeRehearsalPosition(c,position.id,quotes,'admin',{now})),/reject_rehearsal/);
  assert.equal((await pool.query('SELECT status FROM transferred_positions')).rows[0].status,'open');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM transferred_position_closures')).rows[0].n,0);
  assert.deepEqual((await pool.query('SELECT account_view FROM transfer_snapshots')).rows[0].account_view,account);
  await pool.query('ALTER TABLE trades DROP CONSTRAINT reject_rehearsal');
  const results=await Promise.all([1,2].map(()=>tx(c=>closeRehearsalPosition(c,position.id,quotes,'admin',{now}))));
  assert.equal(results.filter(r=>r.repeated).length,1);const closed=results.find(r=>!r.repeated);
  assert.equal(Number(closed.closure.total),-72500);assert.equal(closed.account.balance,927500);
  assert.equal(closed.account.equity,927500);assert.equal(closed.account.equity,closed.before.equity);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM trades')).rows[0].n,initialHistory+1);
  const repeated=await tx(c=>closeRehearsalPosition(c,position.id,{},'repeat',{now:now+999999}));
  assert.equal(repeated.history.id,closed.history.id);assert.equal(repeated.account.balance,927500);
  await tx(async c=>{await c.query('DELETE FROM trades WHERE id=$1',[closed.history.id]);await c.query('DELETE FROM transferred_position_closures WHERE position_id=$1',[position.id]);await c.query("UPDATE transferred_positions SET status='open' WHERE id=$1",[position.id]);await c.query('UPDATE transfer_snapshots SET account_view=$1',[account]);});
  assert.deepEqual((await pool.query('SELECT * FROM transferred_positions')).rows[0],position);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM trades')).rows[0].n,initialHistory);
  assert.deepEqual((await pool.query('SELECT account_view FROM transfer_snapshots')).rows[0].account_view,account);
  const night=Date.parse('2026-11-09T16:05:04Z');
  const nightQuotes={EURUSDrfd:{...quotes.EURUSDrfd,time:new Date(night).toISOString()},
    USDRUBrfd:{...quotes.USDRUBrfd,time:'2026-11-09T15:54:59Z'}};
  const nightClosed=await tx(c=>closeRehearsalPosition(c,position.id,nightQuotes,'night-test',{now:night}));
  assert.equal(Number(nightClosed.closure.total),-72500);
  assert.equal(nightClosed.account.equity,nightClosed.before.equity);
  await assert.rejects(closeRehearsalPosition(admin,position.id,quotes,'admin',{now}),/separate close-test clone/);
 }finally{await pool.end();await admin.query('DROP DATABASE '+database);await admin.end();}
});
