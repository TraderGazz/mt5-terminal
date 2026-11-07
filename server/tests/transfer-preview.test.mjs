import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { createTransferPreviewApp } from '../services/transfer-preview-app.js';

test('preview normal HTTP entry points preserve snapshot and reject trading writes',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'mt5-preview-'));
  await writeFile(join(directory,'index.html'),'<html><body>client</body></html>');
  const saved={captured_at:'2026-11-03T21:01:57Z',account_view:{login:'branded',balance:70245308.7,equity:52604986.17,company:'Test'}};
  const view={id:123,symbol:'EURUSDrfd',type:'buy',volume:1,profit:2.675,swap:-10,commission:0};
  const authRouter=express.Router();
  authRouter.post('/login',(req,res)=>res.json({token:'test'}));
  const authRequired=(req,res,next)=>req.headers.authorization==='Bearer test'?next():res.sendStatus(401);
  const historyRouter=express.Router();
  historyRouter.get('/',authRequired,(req,res)=>res.json({history:true}));
  const app=await createTransferPreviewApp({saved,positions:[{model:{view}}],clientDir:directory,authRouter,authRequired,historyRouter});
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base='http://127.0.0.1:'+server.address().port;
  const headers={Authorization:'Bearer test'};
  try {
    assert.equal((await fetch(base+'/api/account')).status,401);
    assert.deepEqual((await (await fetch(base+'/api/account',{headers})).json()).account,saved.account_view);
    assert.equal((await (await fetch(base+'/api/positions',{headers})).json()).positions[0].profit,2.68);
    assert.deepEqual((await (await fetch(base+'/api/quotes')).json()).quotes,[]);
    assert.equal((await fetch(base+'/api/history',{headers})).status,200);
    assert.equal((await fetch(base+'/api/auth/login',{method:'POST'})).status,200);
    for(const [method,path] of [['POST','/api/trading/close'],['PATCH','/api/trading/position/123'],['DELETE','/api/trades/1'],['POST','/api/admin/users']]) {
      assert.equal((await fetch(base+path,{method,headers})).status,403);
    }
    for(const path of ['/mobile/login','/mobile/trade','/mobile/index.html']) {
      const response=await fetch(base+path);
      assert.match(await response.text(),/ТЕСТОВАЯ КОПИЯ/);
      assert.equal(response.headers.get('cache-control'),'no-store');
    }
  } finally {
    await new Promise(resolve=>server.close(resolve));
    await rm(directory,{recursive:true,force:true});
  }
});
