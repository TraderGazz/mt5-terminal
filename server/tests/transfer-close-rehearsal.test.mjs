import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {normalizePosition} from '../services/mt5-bridge/normalize.js';
import {prepareTransfer,importPreparedTransfer} from '../services/transfer-staging.js';
import {createCloseUi} from '../services/transfer-close-ui.js';
import {createTransferPreviewApp} from '../services/transfer-preview-app.js';
import express from 'express';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
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
  const {rows:[stored]}=await pool.query('SELECT * FROM transfer_snapshots');
  const factory=async()=>createCloseUi({pool,saved:stored,positions:(await pool.query('SELECT * FROM transferred_positions')).rows,
   baseUrl:'http://127.0.0.1:8890/v1',now:()=>now,fetchImpl:async url=>({ok:true,json:async()=>url.pathname.endsWith('account')?{login:'new',currency:'RUB'}:url.pathname.endsWith('history/prices')?{data:[{time:'2026.11.09T17:00:00',open:1.1,high:1.12,low:1.09,close:1.11}]}:
    url.searchParams.get('symbol')==='EURUSDrfd'?{...quotes.EURUSDrfd,time:'2026.11.09T18:00:00Z'}:{...quotes.USDRUBrfd,time:'2026.11.09T18:00:00Z'}})});
  const closeUi=await factory();
  const directory=await mkdtemp(join(tmpdir(),'mt5-close-ui-'));await writeFile(join(directory,'index.html'),'<body>client</body>');
  const desktopDir=join(directory,'preview-desktop');await mkdir(desktopDir);
  await writeFile(join(desktopDir,'index.html'),'<body>desktop fixture</body>');await writeFile(join(desktopDir,'login.html'),'<body>pc login</body>');
  await writeFile(join(desktopDir,'live.js'),'window.pcFixture=true;');
  const authRequired=(req,res,next)=>{const token=req.headers.authorization;if(!token)return res.status(401).json({});req.user={role:token==='Bearer admin'?'admin':'viewer',sub:'1'};next();};
  const historyRouter=express.Router();historyRouter.get('/',authRequired,async(req,res)=>res.json((await pool.query('SELECT * FROM trades')).rows));
  const app=await createTransferPreviewApp({saved:stored,positions:[position],clientDir:directory,authRouter:express.Router(),historyRouter,authRequired,closeUi,readState:closeUi.readState,desktopDir,quoteCheck:closeUi.quoteCheck});
  const server=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});
  const base='http://127.0.0.1:'+server.address().port;
  const headers={Authorization:'Bearer admin','Content-Type':'application/json'};
  const post=(path,body,otherHeaders=headers)=>fetch(base+path,{method:'POST',headers:otherHeaders,body:JSON.stringify(body)});
  try{
   assert.equal((await fetch(base+'/api/positions')).status,401);
   assert.equal((await post('/api/trading/close',{ticket:123},{...headers,Authorization:'Bearer viewer'})).status,403);
   assert.equal((await post('/api/trading/close',{ticket:124})).status,409);
   assert.equal((await post('/api/trading/close',{ticket:123,volume:.5})).status,400);
   assert.equal((await post('/api/trading/open',{})).status,403);
   const html=await(await fetch(base+'/mobile/trade')).text();assert.match(html,/Вернуть позицию/);
   assert.match(await(await fetch(base+'/pc/')).text(),/desktop fixture/);
   assert.match(await(await fetch(base+'/pc/login.html')).text(),/pc login/);
   assert.match(await(await fetch(base+'/pc/live.js')).text(),/pcFixture/);
   assert.match(await(await fetch(base+'/pc/')).text(),/mt5pc-token/);
   assert.equal((await fetch(base+'/api/candles')).status,401);
   assert.equal((await fetch(base+'/api/candles?timeframe=BAD',{headers})).status,400);
   const candles=await(await fetch(base+'/api/candles?timeframe=H4&symbol=EURUSDrfd',{headers})).json();
   assert.equal(candles.bars.length,1);assert.equal(candles.bars[0].close,1.11);
   const response=await post('/api/trading/close',{ticket:123});assert.equal(response.status,200,await response.text());
   assert.equal((await(await fetch(base+'/api/positions',{headers})).json()).positions.length,0);
   assert.equal((await(await fetch(base+'/api/account',{headers})).json()).account.balance,927500);
   assert.equal((await(await fetch(base+'/api/history',{headers})).json()).length,initialHistory+1);
   assert.equal((await(await fetch(base+'/api/transfer/feed-status')).json()).rehearsalClosed,true);
   assert.equal((await(await post('/api/trading/close',{ticket:123})).json()).repeated,true);
   // A process restart may reconstruct frozen state and restore from DB alone.
   const restarted=await factory();assert.equal((await restarted.readState()).positions.length,0);
   assert.equal((await restarted.readState()).account.balance,927500);
   assert.equal((await post('/api/transfer/rehearsal/restore',{}, {...headers,Authorization:'Bearer viewer'})).status,403);
   assert.equal((await post('/api/transfer/rehearsal/restore',{})).status,200);
   assert.equal((await(await fetch(base+'/api/positions',{headers})).json()).positions.length,1);
   assert.equal((await(await fetch(base+'/api/account',{headers})).json()).account.balance,1000000);
   assert.equal((await(await fetch(base+'/api/history',{headers})).json()).length,initialHistory);
   assert.equal((await post('/api/transfer/rehearsal/restore',{})).status,200);
  }finally{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
  const night=Date.parse('2026-11-09T16:05:04Z');
  const nightQuotes={EURUSDrfd:{...quotes.EURUSDrfd,time:new Date(night).toISOString()},
    USDRUBrfd:{...quotes.USDRUBrfd,time:'2026-11-09T15:54:59Z'}};
  const nightClosed=await tx(c=>closeRehearsalPosition(c,position.id,nightQuotes,'night-test',{now:night}));
  assert.equal(Number(nightClosed.closure.total),-72500);
  assert.equal(nightClosed.account.equity,nightClosed.before.equity);
  await assert.rejects(closeRehearsalPosition(admin,position.id,quotes,'admin',{now}),/separate close-test clone/);
 }finally{await pool.end();await admin.query('DROP DATABASE '+database);await admin.end();}
});
