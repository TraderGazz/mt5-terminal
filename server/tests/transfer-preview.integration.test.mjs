import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import net from 'node:net';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {join,resolve,sep} from 'node:path';
import {hashPassword} from '../routes/auth.js';

test('isolated preview process: login and history use the test database', {skip:!process.env.TEST_DATABASE_URL},async()=>{
  const rootUrl=process.env.TEST_DATABASE_URL;
  const name='terminal_migration_test_http_'+process.pid+'_'+Date.now();
  const admin=new pg.Client({connectionString:rootUrl});
  await admin.connect();await admin.query('CREATE DATABASE '+name);
  const target=new URL(rootUrl);target.pathname='/'+name;
  const db=new pg.Client({connectionString:target.href});await db.connect();
  const temp=await mkdtemp(join(tmpdir(),'mt5-http-'));
  let child;
  try {
    await db.query(await readFile(new URL('../../database/init.sql',import.meta.url),'utf8'));
    await db.query(await readFile(new URL('../../database/migrations/017_transfer_staging.sql',import.meta.url),'utf8'));
    await db.query('INSERT INTO users(login,password_hash,role) VALUES($1,$2,$3)',['test-admin',hashPassword('local-test-password'),'admin']);
    const account={login:'branding',currency:'RUB',balance:10000,equity:9000,margin:100,freeMargin:8900,marginLevel:9000,floatingProfit:-1000};
    const view={id:123,symbol:'EURUSDrfd',type:'buy',volume:1,openPrice:1.12,currentPrice:1.11,profit:-1000,swap:-500,commission:0,openTime:'2026-11-01T00:00:00Z',stopLoss:0,takeProfit:0};
    await db.query("INSERT INTO transfer_snapshots(snapshot_hash,source_login,target_login,captured_at,payload,account_view) VALUES('test','old','new',now(),$1,$2)",[{sitePositions:{positions:[view]}},account]);
    await db.query('INSERT INTO transferred_positions(snapshot_id,original_ticket,model) VALUES(1,123,$1)',[{view}]);
    const directory=join(temp,'preview-client');await mkdir(directory);
    await writeFile(join(directory,'index.html'),'<html><body>preview fixture</body></html>');
    const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));
    const port=probe.address().port;await new Promise(r=>probe.close(r));
    child=spawn(process.execPath,[fileURLToPath(new URL('../transfer-preview.mjs',import.meta.url))],{
      env:{...process.env,DATABASE_URL:rootUrl,TRANSFER_PREVIEW_DATABASE:name,TRANSFER_PREVIEW_SNAPSHOT_ID:'1',TRANSFER_PREVIEW_CLIENT_DIR:directory,TRANSFER_PREVIEW_PORT:String(port)},
      stdio:['ignore','pipe','pipe'],
    });
    let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
    const base='http://127.0.0.1:'+port;
    let ready=false;
    for(let i=0;i<80;i++){
      try { if((await fetch(base+'/api/health')).ok){ready=true;break;} }catch {}
      await new Promise(r=>setTimeout(r,100));
    }
    assert.ok(ready,log);
    const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:'test-admin',password:'local-test-password'})});
    const user=await login.json();assert.ok(login.ok&&user.token);
    const headers={Authorization:'Bearer '+user.token};
    const a=await (await fetch(base+'/api/account',{headers})).json();assert.deepEqual(a.account,account);
    for(const route of ['positions','auth/me','history?tab=positions&period=all','history/totals?period=all','history/raw']){
      const r=await fetch(base+'/api/'+route,{headers});assert.equal(r.status,200,route+' '+await r.text());
    }
    assert.equal((await fetch(base+'/api/trading/close',{method:'POST',headers})).status,403);
    const html=await (await fetch(base+'/mobile/trade')).text();assert.match(html,/ТЕСТОВАЯ КОПИЯ/);
    assert.equal((await db.query('SELECT COUNT(*) AS n FROM sessions')).rows[0].n,'1');
  }finally{
    if(child&&child.exitCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill();await exited;}
    await db.end();await admin.query('DROP DATABASE '+name);await admin.end();
    assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep));
    await rm(temp,{recursive:true,force:true});
  }
});
