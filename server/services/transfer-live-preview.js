import { addMoney, roundMoney } from './money.js';
import { WebSocketServer } from 'ws';

export function createLivePreviewState({saved,positions,quoteCheck,now=Date.now}) {
  const originalProfit=addMoney(...positions.map(p=>p.model.view.profit));
  let pending, cached, cachedAt=0;
  return async function read() {
    if(cached && now()-cachedAt<1000) return cached;
    if(pending) return pending;
    pending=(async()=>{
      const result=await quoteCheck();
      if(result.status!=='ready' || !result.valuation) {
        const error=new Error('Свежие котировки нового счёта недоступны');error.status=503;throw error;
      }
      const delta=addMoney(result.valuation.profit,-originalProfit);
      const anchor=saved.account_view;
      // Preserve every manual account offset, including margin-level offsets.
      // Broker starting balance and deposits are never part of this view.
      const account={...anchor,equity:addMoney(anchor.equity,delta),
        freeMargin:addMoney(anchor.freeMargin,delta),floatingProfit:addMoney(anchor.floatingProfit,delta),
        marginLevel:anchor.margin>0?roundMoney(anchor.marginLevel+delta/anchor.margin*100):anchor.marginLevel};
      cached={account,positions:result.valuation.positions,quotes:[],source:{
        mode:'transfer-preview',live:true,capturedAt:new Date(saved.captured_at).toISOString(),
        valuedAt:new Date(now()).toISOString(),targetLogin:result.targetLogin,quoteStatus:result.quotes,
      }};
      cachedAt=now();return cached;
    })().finally(()=>{pending=null;});
    return pending;
  };
}

// Separate read-only feed: no trading commands or production bridge lifecycle.
export function attachTransferPreviewFeed(server,{readState,authRequired,intervalMs=3000}) {
  const wss=new WebSocketServer({server,path:'/ws',maxPayload:8192});
  async function authorized(req) {
    let ok=false;
    const res={status(){return this;},json(){return this;}};
    await authRequired(req,res,()=>{ok=true;});return ok;
  }
  wss.on('connection',async(ws,req)=>{
    req.headers.authorization='Bearer '+new URL(req.url,'http://localhost').searchParams.get('token');
    const channels=new Set();let busy=false,timer;
    const send=(channel,data)=>{if(ws.readyState===1)ws.send(JSON.stringify({channel,data}));};
    async function push() {
      if(busy || ws.readyState!==1)return;busy=true;
      try {
        if(!await authorized(req)){ws.close(4401,'Unauthorized');return;}
        const state=await readState();
        if(channels.has('positions'))send('positions',state.positions);
        if(channels.has('account'))send('account',state.account);
        send('status',{connected:true,stale:false,mode:'transfer-preview'});
      }catch{send('status',{connected:false,stale:true,mode:'transfer-preview'});ws.close(1013,'Fresh quotes unavailable');}
      finally{busy=false;}
    }
    void authorized(req).then(ok=>{if(!ok)ws.close(4401,'Unauthorized');});
    ws.on('message',raw=>{
      let msg;try{msg=JSON.parse(raw);}catch{return;}
      if(msg.op==='subscribe'&&Array.isArray(msg.channels)){
        for(const c of msg.channels)if(['account','positions'].includes(c))channels.add(c);
        void push();
      }
      if(msg.op==='unsubscribe'&&Array.isArray(msg.channels))for(const c of msg.channels)channels.delete(c);
    });
    timer=setInterval(()=>{if(channels.size)void push();},intervalMs);
    ws.on('close',()=>clearInterval(timer));ws.on('error',()=>clearInterval(timer));
  });
  return ()=>{for(const ws of wss.clients)ws.terminate();wss.close();};
}
