import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHybridReviewState} from '../services/transfer-hybrid-review.js';
import {onlineReviewConfig} from '../services/transfer-online-nginx.js';
import {createTransferPreviewApp} from '../services/transfer-preview-app.js';

test('review readers share one broker poll, expire cache, and stop on new trading data',async()=>{
 let calls=0,clock=0,newTrade=false;
 const read=createHybridReviewState(async()=>{calls++;await new Promise(r=>setTimeout(r,2));return{source:{targetPositions:0,targetTradingDeals:newTrade?1:0},account:{balance:100}};},{now:()=>clock});
 const [a,b]=await Promise.all([read(),read()]);assert.equal(a,b);assert.equal(calls,1);
 await read();assert.equal(calls,1);clock=3001;newTrade=true;
 await assert.rejects(read,error=>error.status===503);assert.equal(calls,2);
 await assert.rejects(read,error=>error.status===503);assert.equal(calls,3);
});
test('domain replacement retains TLS and HTTP redirect; removes all old static routes and touches only online',()=>{
 const tail=`listen 443 ssl;\nssl_certificate /etc/letsencrypt/live/trader-mt5.online/fullchain.pem;\n}\nserver {\nserver_name trader-mt5.online www.trader-mt5.online;\nlisten 80;\nreturn 301 https://$host$request_uri;\n}`;
 const source='server {\nserver_name trader-mt5.online www.trader-mt5.online;\nlocation /mobile/ { alias /var/www/terminal2/client/dist/; }\nlocation /api/ { proxy_pass http://127.0.0.1:4001/api/; }\n'+tail;
 const updated=onlineReviewConfig(source);assert.ok(updated.endsWith(tail));assert.match(updated,/4004\/ws/);assert.match(updated,/proxy_set_header Upgrade \$http_upgrade/);
 assert.doesNotMatch(updated,/4001|terminal2\/client/);assert.equal(onlineReviewConfig(updated),updated);
 assert.throws(()=>onlineReviewConfig(source.replace('server_name trader-mt5.online','server_name mt-trader.ru')),/header/);
 assert.throws(()=>onlineReviewConfig(source.replace('4001','9999')),/upstream/);
});
test('public hybrid mobile and PC show test banner, use auth, expose candles and reject every trade mutation',async()=>{
 const root=await mkdtemp(join(tmpdir(),'mt5-online-review-'));
 const client=join(root,'preview-client'),desktop=join(root,'preview-desktop');await mkdir(client);await mkdir(desktop);
 for(const [dir,file] of [[client,'index.html'],[desktop,'index.html'],[desktop,'login.html']])await writeFile(join(dir,file),'<html><body>fixture</body></html>');
 const authRequired=(req,res,next)=>{if(req.headers.authorization==='Bearer test'){req.user={role:'admin'};next();}else res.sendStatus(401);};
 const state={account:{currency:'RUB',balance:70910502.15},positions:[{id:42,profit:-100}],source:{live:true,targetPositions:0,targetTradingDeals:0}};
 const quoteCheck=()=>{};quoteCheck.candles=async()=>({bars:[]});
 const app=await createTransferPreviewApp({saved:{captured_at:new Date(),account_view:state.account},positions:[],clientDir:client,desktopDir:desktop,
  authRouter:express.Router(),authRequired,historyRouter:express.Router(),hybrid:true,readState:async()=>state,quoteCheck});
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const base='http://127.0.0.1:'+server.address().port,headers={Authorization:'Bearer test'};
 try{
  assert.equal((await(await fetch(base+'/api/health')).json()).source.hybridPreview,true);
  assert.equal((await fetch(base+'/api/account')).status,401);
  assert.deepEqual((await(await fetch(base+'/api/account',{headers})).json()).account,state.account);
  for(const path of ['/mobile/login','/mobile/trade','/pc/','/pc/login.html']){const response=await fetch(base+path);const html=await response.text();assert.equal(response.status,200);assert.match(html,/ТЕСТОВАЯ КОПИЯ/);assert.match(html,/Только просмотр/);assert.match(html,/--transfer-review-bar/);}
  assert.equal((await fetch(base+'/api/candles',{headers})).status,200);
  for(const [method,path] of [['POST','/api/trading/open'],['POST','/api/trading/close'],['PATCH','/api/trades/1'],['POST','/api/transfer/rehearsal/restore']])assert.equal((await fetch(base+path,{method,headers})).status,403);
 }finally{await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});}
});
