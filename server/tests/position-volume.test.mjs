import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { applyPositionOverride, buildPositionOverride, hasPositionOverride } from '../services/position-view.js';

const position = { id:123, type:'buy', volume:1, openPrice:1, currentPrice:1.01, profit:100, swap:-2 };
test('lot size scales market profit and preserves accrued swap and absolute corrections', () => {
  const result = applyPositionOverride(position, {volumeOverride:2,profitOffset:50,swapOffset:-3});
  assert.equal(result.volume,2); assert.equal(result.profit,250); assert.equal(result.swap,-5);
  assert.equal(position.volume,1);
  assert.equal(applyPositionOverride({...position,type:'sell',profit:-100},{volumeOverride:.5}).profit,-50);
  assert.equal(hasPositionOverride({volumeOverride:2}),true);
});
test('simultaneous lot, opening price and profit edits respect explicit target profit', () => {
  const override = buildPositionOverride(position, {}, {volume:2,openPrice:1.005,profit:175,swap:-10});
  const result = applyPositionOverride(position,override);
  assert.equal(result.volume,2); assert.equal(result.profit,175); assert.equal(result.swap,-10);
  const later = applyPositionOverride({...position,currentPrice:1.02,profit:200},override);
  assert.equal(later.profit,375);
});
test('editing another field preserves saved volume; repeated lot save is idempotent', () => {
  const before = {volumeOverride:2,profitOffset:50,swapOffset:-3};
  const result = buildPositionOverride(position,before,{swap:-10});
  assert.equal(result.volumeOverride,2); assert.equal(result.profitOffset,50);
  assert.deepEqual(buildPositionOverride(position,result,{volume:2}),result);
  assert.equal(applyPositionOverride(position,{}).volume,1);
});
test('reject non-positive, non-finite, over-precision and oversized lots', () => {
  for (const volume of [0,-1,.001,NaN,Infinity,100000000,'',false]) {
    assert.throws(() => buildPositionOverride(position,{}, {volume}),RangeError);
  }
  assert.equal(buildPositionOverride(position,{}, {volume:.29}).volumeOverride,.29);
});

test('PostgreSQL and HTTP integration: persistence, access control, both close paths', {skip:!process.env.TEST_DATABASE_URL}, async () => {
  const schema=`volume_test_${process.pid}_${Date.now()}`;
  const connection=new URL(process.env.TEST_DATABASE_URL);
  const admin=new pg.Client({connectionString:connection.href});
  await admin.connect(); await admin.query(`CREATE SCHEMA ${schema}`);
  connection.searchParams.set('options',`-c search_path=${schema}`);
  try {
    const setup=new pg.Client({connectionString:connection.href}); await setup.connect();
    try {
      await setup.query(await readFile(new URL('../../database/init.sql',import.meta.url),'utf8'));
      // Exercise an actual upgrade, including preservation of existing edits.
      await setup.query('ALTER TABLE position_overrides DROP COLUMN volume_override');
      await setup.query('INSERT INTO position_overrides (ticket, profit_offset) VALUES (999, 50)');
      const migration=await readFile(new URL('../../database/migrations/015_position_override_volume.sql',import.meta.url),'utf8');
      await setup.query(migration); await setup.query(migration);
      assert.equal(Number((await setup.query('SELECT profit_offset FROM position_overrides WHERE ticket=999')).rows[0].profit_offset),50);
      await setup.query(`INSERT INTO users (id,login,password_hash,role) VALUES (1,'admin','unused','admin'),(2,'viewer','unused','viewer')`);
    } finally { await setup.end(); }
    const code=`
      import assert from 'node:assert/strict';
      import express from 'express';
      import jwt from 'jsonwebtoken';
      const {initDb,query}=await import(${JSON.stringify(new URL('../db.js',import.meta.url).href)});
      const {getBridge}=await import(${JSON.stringify(new URL('../services/mt5-bridge/index.js',import.meta.url).href)});
      const {default:router}=await import(${JSON.stringify(new URL('../routes/trading.js',import.meta.url).href)});
      const {saveDeals}=await import(${JSON.stringify(new URL('../services/mt5-sync.js',import.meta.url).href)});
      initDb(); await query('SELECT 1');
      const bridge=getBridge(); let closed=false; const brokerCommands=[];
      bridge.impl={
        start(){}, stop(){},
        getPositions:async()=>closed?[]:[{ticket:123,symbol:'EURUSD',type:0,volume:1,price_open:1,price_current:1.01,profit:100,swap:-2}],
        getAccount:async()=>({login:'test',balance:closed?100098:100000,equity:100098,free_margin:99098,margin:1000,profit:closed?0:98}),
        closeOrder:async(order)=>{
          brokerCommands.push(order); closed=true;
          await query("INSERT INTO trades (ticket,position_id,symbol,type,deal_type,volume,open_price,close_price,profit,swap,commission,close_time) VALUES (9001,123,'EURUSD','buy','buy',1,1,1.01,100,-2,0,now())");
          return {done:true};
        }
      };
      const app=express(); app.use(express.json()); app.use('/trading',router);
      const server=app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
      const base='http://127.0.0.1:'+server.address().port+'/trading';
      const request=async(method,path,body,sub=1)=>fetch(base+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+jwt.sign({sub:String(sub),login:sub===1?'admin':'viewer',role:sub===1?'admin':'viewer'},process.env.JWT_SECRET)},body:body===undefined?undefined:JSON.stringify(body)});
      assert.equal((await request('PATCH','/position/123',{volume:2},2)).status,403);
      for(const volume of [0,-1,.001,100000000]) assert.equal((await request('PATCH','/position/123',{volume})).status,400);
      assert.equal((await request('PATCH','/position/123',{volume:2})).status,200);
      assert.equal((await bridge.positions())[0].volume,2);
      assert.equal((await bridge.positions())[0].profit,200);
      const account=await bridge.account();
      assert.equal(account.balance,100000); assert.equal(account.equity,100198); assert.equal(account.freeMargin,99198);
      assert.equal(brokerCommands.length,0);
      bridge.overrides.clear(); bridge.start();
      for(let i=0;i<100&&!bridge.getPositionOverride(123).volumeOverride;i++) await new Promise(resolve=>setTimeout(resolve,10));
      assert.equal(bridge.getPositionOverride(123).volumeOverride,2);
      assert.equal((await request('PATCH','/position/123',{profit:250,swap:-5})).status,200);
      assert.equal((await bridge.positions())[0].volume,2);
      assert.equal((await bridge.positions())[0].profit,250);
      assert.equal((await request('DELETE','/position/123')).status,200);
      assert.equal((await bridge.positions())[0].volume,1);
      await request('PATCH','/position/123',{volume:2});
      await query('ALTER TABLE position_overrides ADD CONSTRAINT test_reject_large CHECK (volume_override <= 3)');
      await assert.rejects(bridge.setPositionOverride(123,{volumeOverride:4}));
      assert.equal(bridge.getPositionOverride(123).volumeOverride,2);
      await query('ALTER TABLE position_overrides DROP CONSTRAINT test_reject_large');
      assert.equal((await request('POST','/close',{ticket:123})).status,200);
      for(let i=0;i<100;i++){
        if((await query('SELECT is_edited FROM trades WHERE ticket=9001')).rows[0]?.is_edited)break;
        await new Promise(resolve=>setTimeout(resolve,50));
      }
      const trade=(await query('SELECT * FROM trades WHERE ticket=9001')).rows[0];
      assert.equal(Number(trade.volume),2); assert.equal(Number(trade.profit),200);
      assert.equal(brokerCommands.length,1); assert.equal(brokerCommands[0].volume,undefined);
      assert.equal((await bridge.account()).balance,100198);
      assert.equal(bridge.getPositionOverride(123).volumeOverride,null);
      // Closing directly at broker uses the sync path, including edited lots.
      await bridge.setPositionOverride(124,{volumeOverride:3});
      const deal={ticket:9002,positionId:124,symbol:'EURUSD',dealType:'buy',volume:1,openPrice:1,closePrice:1.01,profit:100,swap:-2,commission:0,openTime:Date.now()-60000,closeTime:Date.now()};
      await saveDeals([deal]);
      let synced=(await query('SELECT * FROM trades WHERE ticket=9002')).rows[0];
      assert.equal(Number(synced.volume),3); assert.equal(Number(synced.profit),300);
      const offset=bridge.getAccountOffset().balance;
      await saveDeals([deal]);
      assert.equal(bridge.getAccountOffset().balance,offset);
      synced=(await query('SELECT * FROM trades WHERE ticket=9002')).rows[0];
      assert.equal(Number(synced.volume),3);
      assert.equal(bridge.getPositionOverride(124).volumeOverride,null);
      await new Promise(resolve=>server.close(resolve));
      console.log('HTTP, persistence, reset, broker safety and both history paths: OK');
      process.exit(0);
    `;
    // Resolve bare express/jwt imports from the repository's server folder.
    const result=spawnSync(process.execPath,['--input-type=module','-e',code],{
      cwd:new URL('../',import.meta.url),encoding:'utf8',timeout:20000,
      env:{...process.env,DATABASE_URL:connection.href,MT5_BRIDGE:'mock',JWT_SECRET:'volume-test-secret'},
    });
    assert.equal(result.status,0,result.stdout+result.stderr);
  } finally {await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();}
});
