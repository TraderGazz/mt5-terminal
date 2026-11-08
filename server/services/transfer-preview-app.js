import express from 'express';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { roundMoney } from './money.js';

export async function createTransferPreviewApp({ saved, positions, clientDir, authRouter, authRequired, historyRouter, quoteCheck }) {
  const capturedAt = new Date(saved.captured_at).toISOString();
  const source = {mode:'transfer-preview', capturedAt, live:false};
  const account = saved.account_view;
  const index = await readFile(join(clientDir,'index.html'),'utf8');
  const banner = `<div role="status" style="position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#704800;color:white;padding:7px;text-align:center;font:13px Arial;pointer-events:none">ТЕСТОВАЯ КОПИЯ · Снимок ${capturedAt} · Только просмотр</div>`;
  const html = index.replace('</body>',banner+'</body>');
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({limit:'32kb'}));
  app.use((req,res,next)=>{
    res.set('Cache-Control','no-store');
    next();
  });
  app.use('/api',(req,res,next)=>{
    if (['GET','HEAD'].includes(req.method) || (req.method === 'POST' && req.path === '/auth/login')) return next();
    res.status(403).json({error:'Тестовая копия доступна только для просмотра'});
  });
  app.get('/api/health',(req,res)=>res.json({status:'ok',source,positions:positions.length}));
  app.use('/api/auth',authRouter);
  app.get('/api/account/public-branding',(req,res)=>res.json({
    company:account.company,server:account.server,accessServer:account.accessServer,accountNumber:account.login,
  }));
  app.get('/api/transfer/quote-check',authRequired,async(req,res,next)=>{
    if (req.user?.role !== 'admin') return res.status(403).json({error:'Только для администратора'});
    if (!quoteCheck) return res.status(503).json({error:'Тестовый мост ещё не настроен'});
    try { res.json(await quoteCheck()); } catch(error) { next(error); }
  });
  app.get('/api/account',authRequired,(req,res)=>res.json({account,source}));
  app.get('/api/positions',authRequired,(req,res)=>res.json({
    positions:positions.map(p=>({
      ...p.model.view,
      profit:roundMoney(p.model.view.profit),swap:roundMoney(p.model.view.swap),commission:roundMoney(p.model.view.commission),
    })),count:positions.length,source,
  }));
  // New captures include the same frozen quote snapshot used by the source UI.
  // Older archives keep their individual position prices when quotes are absent.
  app.get('/api/quotes',(req,res)=>res.json({quotes:saved.payload?.siteQuotes || [],source}));
  app.use('/api/history',(req,res,next)=>{ res.locals.historyDbOnly = true; next(); },historyRouter);
  app.use('/api',(req,res)=>res.status(404).json({error:'Раздел недоступен в тестовом просмотре'}));
  const sendIndex = (req,res)=>res.type('html').send(html);
  app.get('/',(req,res)=>res.redirect('/mobile/login'));
  app.get(['/mobile','/mobile/','/mobile/index.html'],sendIndex);
  app.use('/mobile',express.static(clientDir,{index:false,etag:false,maxAge:0}));
  app.get(/^\/mobile\/.*$/,sendIndex);
  app.use((error,req,res,next)=>res.status(500).json({error:'Ошибка тестового просмотра'}));
  return app;
}
