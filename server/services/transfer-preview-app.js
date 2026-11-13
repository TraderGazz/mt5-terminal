import express from 'express';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { roundMoney } from './money.js';

export async function createTransferPreviewApp({ saved, positions, clientDir, authRouter, authRequired, historyRouter, quoteCheck, readState, closeUi, desktopDir, hybrid=false }) {
  const capturedAt = new Date(saved.captured_at).toISOString();
  const source = {mode:hybrid?'transfer-hybrid-review':'transfer-preview', capturedAt, live:false,hybridPreview:hybrid};
  const account = saved.account_view;
  const index = await readFile(join(clientDir,'index.html'),'utf8');
  const reviewStyle='<style>:root{--transfer-review-bar:34px}body{padding-top:var(--transfer-review-bar)}#terminal{height:calc(100dvh - var(--transfer-review-bar));max-height:calc(100dvh - var(--transfer-review-bar));min-height:0}</style>';
  const banner = `<div id="transfer-preview-status" role="status" style="position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#704800;color:white;padding:7px;text-align:center;font:13px Arial;pointer-events:none">ТЕСТОВАЯ КОПИЯ · ${readState ? "Котировки нового счёта" : "Снимок " + capturedAt} · Только просмотр</div>`;
  const liveStatusScript=readState?`<script>
  (function(){const el=document.getElementById('transfer-preview-status');
    async function check(){try{const r=await fetch('/api/transfer/feed-status',{cache:'no-store',signal:AbortSignal.timeout(5000)});if(!r.ok){const d=await r.json();if(d.reason==='TARGET_TRADES_NOT_ENABLED'){el.textContent='ТЕСТОВАЯ КОПИЯ · На новом счёте появились сделки — их отображение ещё не подключено';el.style.background='#a32222';return;}throw new Error();}
      el.textContent='ТЕСТОВАЯ КОПИЯ · Котировки нового счёта · Только просмотр';el.style.background='#285c32';
    }catch{el.textContent='ТЕСТОВАЯ КОПИЯ · Нет свежих котировок — значения не обновляются';el.style.background='#a32222';}}
    el.textContent='ТЕСТОВАЯ КОПИЯ · Проверяем котировки';check();setInterval(check,5000);
  })();</script>`:'';
  const rehearsalPanel=closeUi?`<style>:root{--transfer-test-bar:54px}body{padding-top:var(--transfer-test-bar)}#terminal{height:calc(100dvh - var(--transfer-test-bar));max-height:calc(100dvh - var(--transfer-test-bar));min-height:0}</style><div id="transfer-rehearsal-bar" style="position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#704800;color:white;padding:8px;text-align:center;font:13px Arial">
    ТЕСТ ЗАКРЫТИЯ · Только позиция #${closeUi.targetTicket} · <span id="close-test-state">проверяем состояние</span>
    <button id="close-test-restore" style="margin-left:8px">Вернуть позицию</button></div>
    <script>(function(){const button=document.getElementById('close-test-restore'),label=document.getElementById('close-test-state');
      const bar=document.getElementById('transfer-rehearsal-bar');
      const fit=()=>document.documentElement.style.setProperty('--transfer-test-bar',Math.ceil(bar.getBoundingClientRect().height)+'px');
      fit();new ResizeObserver(fit).observe(bar);
      async function status(){try{const r=await fetch('/api/transfer/feed-status',{cache:'no-store'});if(!r.ok)throw new Error();const d=await r.json();label.textContent=d.rehearsalClosed?'Позиция закрыта · цены зафиксированы':'Живые котировки · позиция открыта';}catch{label.textContent='Нет доступных котировок';}}
      status();setInterval(status,3000);button.onclick=async()=>{if(!confirm('Восстановить тестовую позицию, баланс и историю?'))return;
       button.disabled=true;try{const token=localStorage.getItem(location.pathname.startsWith('/pc')?'mt5pc-token':'terminal-auth-token');const r=await fetch('/api/transfer/rehearsal/restore',{method:'POST',headers:{Authorization:'Bearer '+token}});const d=await r.json();if(!r.ok)throw new Error(d.error||'Ошибка восстановления');location.reload();}catch(e){alert(e.message);button.disabled=false;}};
    })();</script>`:'';
  const reviewBanner=reviewStyle+banner+liveStatusScript+`<script>(function(){const el=document.getElementById('transfer-preview-status');const fit=()=>document.documentElement.style.setProperty('--transfer-review-bar',Math.ceil(el.getBoundingClientRect().height)+'px');fit();new ResizeObserver(fit).observe(el);})();</script>`;
  const html = index.replace('</body>',(closeUi?rehearsalPanel:reviewBanner)+'</body>');
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({limit:'32kb'}));
  app.use((req,res,next)=>{
    res.set('Cache-Control','no-store');
    next();
  });
  app.use('/api',(req,res,next)=>{
    if (closeUi&&req.method==='POST'&&['/trading/close','/transfer/rehearsal/restore'].includes(req.path)) return next();
    if (['GET','HEAD'].includes(req.method) || (req.method === 'POST' && req.path === '/auth/login')) return next();
    res.status(403).json({error:'Тестовая копия доступна только для просмотра'});
  });
  app.get('/api/health',(req,res)=>res.json({status:'ok',source:{...source,liveConfigured:!!readState,closeRehearsal:!!closeUi},positions:positions.length}));
  app.get('/api/transfer/feed-status',async(req,res)=>{
    if(!readState)return res.json({live:false});
    try{const state=await readState();res.json({live:state.source.live,rehearsalClosed:!!state.source.rehearsalClosed,valuedAt:state.source.valuedAt});}
    catch(error){res.status(503).json({live:false,stale:error.code!=='TARGET_TRADES_NOT_ENABLED',reason:error.code==='TARGET_TRADES_NOT_ENABLED'?error.code:'FEED_UNAVAILABLE'});}
  });
  app.use('/api/auth',authRouter);
  app.get('/api/account/public-branding',(req,res)=>res.json({
    company:account.company,server:account.server,accessServer:account.accessServer,accountNumber:account.login,
  }));
  app.get('/api/transfer/quote-check',authRequired,async(req,res,next)=>{
    if (req.user?.role !== 'admin') return res.status(403).json({error:'Только для администратора'});
    if (!quoteCheck) return res.status(503).json({error:'Тестовый мост ещё не настроен'});
    try { res.json(await quoteCheck()); } catch(error) { next(error); }
  });
  if(closeUi){
    const admin=(req,res,next)=>req.user?.role==='admin'?next():res.status(403).json({error:'Только для администратора'});
    app.post('/api/trading/close',authRequired,admin,async(req,res,next)=>{
      try{res.json(await closeUi.close(req.body,String(req.user.sub)));}catch(error){next(error);}
    });
    app.post('/api/transfer/rehearsal/restore',authRequired,admin,async(req,res,next)=>{
      try{res.json(await closeUi.restore());}catch(error){next(error);}
    });
  }
  app.get('/api/account',authRequired,async(req,res,next)=>{
    try { const state=readState?await readState():{account,source};res.json({account:state.account,source:state.source}); }catch(error){next(error);}
  });
  app.get('/api/positions',authRequired,async(req,res,next)=>{
    if(readState){try{const state=await readState();return res.json({positions:state.positions,count:state.positions.length,source:state.source});}catch(error){return next(error);}}
    return res.json({
    positions:positions.map(p=>({
      ...p.model.view,
      profit:roundMoney(p.model.view.profit),swap:roundMoney(p.model.view.swap),commission:roundMoney(p.model.view.commission),
    })),count:positions.length,source,
  });});
  // Live positions are already valued at bid/ask on the server. An independent
  // quote stream would cause the client to reprice them a second time.
  // New captures include the same frozen quote snapshot used by the source UI.
  // Older archives keep their individual position prices when quotes are absent.
  app.get('/api/quotes',(req,res)=>res.json({quotes:readState ? [] : saved.payload?.siteQuotes || [],source}));
  if(desktopDir&&quoteCheck?.candles){
    app.get('/api/candles',authRequired,async(req,res,next)=>{
      try{
        const state=closeUi?await readState():null;
        const end=state?.source.rehearsalClosed?state.source.valuedAt:undefined;
        const to=end&&(!req.query.to||Date.parse(req.query.to)>Date.parse(end))?end:req.query.to;
        const result=await quoteCheck.candles({symbol:req.query.symbol,timeframe:req.query.timeframe,count:req.query.count?Number(req.query.count):360,to});
        if(end)result.quote=state.source.quoteStatus?.find(q=>q.symbol===result.symbol);
        res.json(result);
      }
      catch(error){next(error);}
    });
  }
  app.use('/api/history',(req,res,next)=>{ res.locals.historyDbOnly = true; next(); },historyRouter);
  app.use('/api',(req,res)=>res.status(404).json({error:'Раздел недоступен в тестовом просмотре'}));
  const sendIndex = (req,res)=>res.type('html').send(html);
  app.get('/',(req,res)=>res.redirect('/mobile/login'));
  app.get(['/mobile','/mobile/','/mobile/index.html'],sendIndex);
  app.use('/mobile',express.static(clientDir,{index:false,etag:false,maxAge:0}));
  app.get(/^\/mobile\/.*$/,sendIndex);
  if(desktopDir){
    const inject=async file=>(await readFile(join(desktopDir,file),'utf8')).replace('</body>',(closeUi?rehearsalPanel:reviewBanner)+'</body>');
    const pcIndex=await inject('index.html'),pcLogin=await inject('login.html');
    app.get(/^\/pc$/,(req,res)=>res.redirect('/pc/'));
    app.get(['/pc/','/pc/index.html'],(req,res)=>res.type('html').send(pcIndex));
    app.get('/pc/login.html',(req,res)=>res.type('html').send(pcLogin));
    app.use('/pc',express.static(desktopDir,{index:false,etag:false,maxAge:0}));
  }
  app.use((error,req,res,next)=>res.status([400,409,503].includes(error.status)?error.status:500).json({error:[400,409,503].includes(error.status)?error.message:'Ошибка тестового просмотра'}));
  return app;
}
