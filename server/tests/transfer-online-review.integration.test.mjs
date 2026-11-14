import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {hashPassword} from '../routes/auth.js';

test('actual hybrid preview process loads persisted baseline, serves PC/mobile and cannot trade',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const root=process.env.TEST_DATABASE_URL,database='terminal_migration_test_hybrid_http_'+Date.now();
 const admin=new pg.Client({connectionString:root});await admin.connect();await admin.query('CREATE DATABASE '+database);
 const url=new URL(root);url.pathname='/'+database;const db=new pg.Client({connectionString:url.href});await db.connect();
 const directory=await mkdtemp(join(tmpdir(),'mt5-hybrid-http-'));let child,bridge;
 try{
  for(const file of ['init.sql','migrations/017_transfer_staging.sql','migrations/018_transfer_target_baseline.sql'])await db.query(await readFile(new URL('../../database/'+file,import.meta.url),'utf8'));
  await db.query('INSERT INTO users(login,password_hash,role) VALUES($1,$2,$3)',['review-admin',hashPassword('test-only-password'),'admin']);
  const account={login:'branded',currency:'RUB',balance:10000,equity:9000,margin:100,freeMargin:8900,marginLevel:9000,floatingProfit:-1000};
  const view={id:123,symbol:'EURUSDrfd',type:'buy',volume:1,openPrice:1.12,currentPrice:1.11,profit:-1000,swap:-50,commission:0,openTime:'2026-11-01T00:00:00Z',stopLoss:0,takeProfit:0};
  const payload={referenceQuotes:{USDRUBrfd:{bid:80,ask:80}},settings:{position_overrides:[]},sitePositions:{positions:[view]},brokerAccount:{margin:100,equity:9000,margin_level:9000}};
  await db.query("INSERT INTO transfer_snapshots(snapshot_hash,source_login,target_login,captured_at,payload,account_view) VALUES('review','old','new',now(),$1,$2)",[payload,account]);
  await db.query('INSERT INTO transferred_positions(snapshot_id,original_ticket,model) VALUES(1,123,$1)',[{view,raw:{...view,profit:-80000},valuation:{profitCurrency:'USD',accountCurrency:'RUB',units:100000,direction:1,anchorGross:-80000,conversionSymbol:'USDRUBrfd'}}]);
  await db.query("INSERT INTO transfer_target_baselines VALUES(1,'new',now()-interval '1 minute','RUB',900100,'{}')");
  const client=join(directory,'preview-client'),desktop=join(directory,'preview-desktop');await mkdir(client);await mkdir(desktop);
  for(const [dir,file] of [[client,'index.html'],[desktop,'index.html'],[desktop,'login.html']])await writeFile(join(dir,file),'<html><body>review fixture</body></html>');
  const calls=[];let phase='empty';
  const openTime=new Date(Date.now()+10800000-30000).toISOString();
  const opening={ticket:500,position_id:123,order_ticket:501,type:'DEAL_TYPE_BUY',entry:'DEAL_ENTRY_IN',symbol:'EURUSDrfd',volume:1,price:1.11,profit:0,swap:0,commission:-5,time:openTime};
  const closing={...opening,ticket:502,order_ticket:503,type:'DEAL_TYPE_SELL',entry:'DEAL_ENTRY_OUT',price:1.112,profit:120,swap:-2,commission:-1,time:new Date(Date.now()+10800000-1000).toISOString()};
  const live={ticket:123,type:'POSITION_TYPE_BUY',symbol:'EURUSDrfd',volume:1,price_open:1.11,price_current:1.111,profit:110,swap:-2,time:openTime};
  bridge=http.createServer((req,res)=>{
   const request=new URL(req.url,'http://localhost');calls.push(request.pathname);let data;
   if(request.pathname==='/v1/account')data={login:'new',currency:'RUB',balance:phase==='empty'?900100:phase==='open'?900095:900212,margin:phase==='open'?10:0};
   else if(request.pathname==='/v1/order/list')data={opened:phase==='open'?[live]:[],pending:[]};
   else if(request.pathname==='/v1/history/orders')data={data:phase==='empty'?[]:phase==='open'?[opening]:[opening,closing]};
   else if(request.pathname==='/v1/quote')data={symbol:request.searchParams.get('symbol'),bid:request.searchParams.get('symbol')==='EURUSDrfd'?1.11:80,ask:request.searchParams.get('symbol')==='EURUSDrfd'?1.1102:80,time:new Date(Date.now()+10800000).toISOString()};
   else{res.writeHead(404).end();return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));
  });await new Promise((resolve,reject)=>{bridge.once('error',reject);bridge.listen(8890,'127.0.0.1',resolve);});
  child=spawn(process.execPath,[fileURLToPath(new URL('../transfer-preview.mjs',import.meta.url))],{env:{...process.env,DATABASE_URL:root,
   TRANSFER_PREVIEW_DATABASE:database,TRANSFER_PREVIEW_SNAPSHOT_ID:'1',TRANSFER_PREVIEW_PORT:'4004',TRANSFER_PREVIEW_HYBRID:'true',TRANSFER_PREVIEW_ALLOW_CLOSE:'false',
   TRANSFER_PREVIEW_LIVE:'true',TRANSFER_PREVIEW_QUOTE_URL:'http://127.0.0.1:8890/v1',TRANSFER_PREVIEW_CLIENT_DIR:client,TRANSFER_PREVIEW_DESKTOP_DIR:desktop},stdio:['ignore','pipe','pipe']});
  let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
  const base='http://127.0.0.1:4004';let ready=false;
  for(let i=0;i<80;i++){try{const r=await fetch(base+'/api/health');if(r.ok&&(await r.json()).source?.hybridPreview){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready,log);
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:'review-admin',password:'test-only-password'})});
  const auth=await login.json();assert.ok(login.ok&&auth.token);const headers={Authorization:'Bearer '+auth.token};
  const response=await fetch(base+'/api/account',{headers});assert.equal(response.status,200,await response.clone().text());
  assert.deepEqual((await response.json()).account,account);
  assert.equal((await(await fetch(base+'/api/positions',{headers})).json()).positions.length,1);
  for(const path of ['/pc/','/pc/login.html','/mobile/login'])assert.match(await(await fetch(base+path)).text(),/Только просмотр/);
  phase='open';await new Promise(r=>setTimeout(r,3100));
  const opened=await(await fetch(base+'/api/positions',{headers})).json();assert.ok(Array.isArray(opened.positions),JSON.stringify(opened));assert.equal(opened.positions.length,2);
  assert.equal(opened.positions[1].id,4000000000000123);assert.equal(opened.positions[0].id,123);
  const openAccount=(await(await fetch(base+'/api/account',{headers})).json()).account;
  assert.equal(openAccount.balance,9995);assert.equal(openAccount.equity,9103);
  const openHistory=await(await fetch(base+'/api/history/raw',{headers})).json();assert.equal(openHistory.deals.length,0);assert.equal(openHistory.dealLegs.length,1);assert.equal(openHistory.tradeCharges[0].commission,-5);
  assert.equal((await(await fetch(base+'/api/history/totals?period=all',{headers})).json()).totals.commission,-5);
  phase='closed';await new Promise(r=>setTimeout(r,3100));
  const closedAccount=(await(await fetch(base+'/api/account',{headers})).json()).account;assert.equal(closedAccount.balance,10112);assert.equal(closedAccount.equity,9112);
  const closedHistory=await(await fetch(base+'/api/history/raw',{headers})).json();assert.equal(closedHistory.deals.length,1);assert.equal(closedHistory.deals[0].commission,-6);assert.equal(closedHistory.dealLegs.length,2);assert.equal(closedHistory.tradeCharges.length,0);
  const pc=await(await fetch(base+'/api/history?tab=positions&period=all',{headers})).json();assert.equal(pc.rows.length,1);assert.equal(pc.rows[0].positionId,4000000000000123);assert.equal(pc.rows[0].profit,120);
  assert.equal((await(await fetch(base+'/api/history/totals?period=all',{headers})).json()).totals.commission,-6);
  assert.equal((await fetch(base+'/api/trading/close',{method:'POST',headers})).status,403);
  assert.ok(calls.includes('/v1/history/orders'));assert.ok(calls.every(p=>['/v1/account','/v1/quote','/v1/order/list','/v1/history/orders'].includes(p)));
  assert.equal((await db.query('SELECT broker_balance_excluded FROM transfer_target_baselines')).rows[0].broker_balance_excluded,'900100.00');
 }finally{
  if(child&&child.exitCode===null){const stopped=new Promise(r=>child.once('exit',r));child.kill();await stopped;}
  if(bridge?.listening)await new Promise(r=>bridge.close(r));await db.end();await admin.query('DROP DATABASE '+database);await admin.end();await rm(directory,{recursive:true,force:true});
 }
});
