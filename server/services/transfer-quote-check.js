import {weekendValuationTime} from './transfer-weekend-snapshot.js';
import { transferQuoteStatus } from './transfer-quote-policy.js';
import { normalizeQuote,normalizeCandle,toIso } from './mt5-bridge/normalize.js';
import { valueTransferredPosition } from './transfer-staging.js';
import { createSourceCompatibleValuation } from './transfer-source-valuation.js';
import { addMoney } from './money.js';

// Read-only transport: callers cannot supply an endpoint or place broker orders.
export function createTransferQuoteCheck({ baseUrl, saved, positions, fetchImpl = fetch, now = Date.now, allowWeekendSnapshot=false }) {
  const base = new URL(baseUrl);
  if (base.protocol !== 'http:' || base.port !== '8890' || base.username || base.password ||
      base.search || base.hash || !/^\/(v1\/?)?$/.test(base.pathname) ||
      !/^(127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(base.hostname)) {
    throw new Error('Use the private test bridge HTTP address on port 8890');
  }
  base.pathname = '/v1/';
  let queue=Promise.resolve();
  function read(path,timeout=10000){
    const task=queue.then(async()=>{
      const url=new URL(path,base);
      // SocketBridgeEA splits query strings without URL-decoding ISO dates.
      url.search=url.search.replace(/%3A/gi,':');
      const response=await fetchImpl(url,{signal:AbortSignal.timeout(timeout)});
      if(!response.ok){const error=new Error(`Test bridge HTTP ${response.status}`);error.status=response.status;throw error;}
      return response.json();
    });queue=task.catch(()=>{});return task;
  }
  const compatible=createSourceCompatibleValuation(saved,positions);
  let inFlight;
  function check() {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const account = await read('account');
      if (String(account.login) !== String(saved.target_login) || account.currency !== saved.account_view.currency) {
        throw new Error('Test bridge account/currency does not match transfer target');
      }
      const symbols = new Set(positions.flatMap(p => [p.model.raw.symbol, p.model.valuation.conversionSymbol]).filter(Boolean));
      const quotes = {};
      for (const symbol of symbols) {
        const raw = await read('quote?symbol=' + encodeURIComponent(symbol));
        if (!raw.time || !toIso(raw.time) || raw.symbol !== symbol) throw new Error('Invalid test bridge quote');
        quotes[symbol] = normalizeQuote(raw);
      }
      const checkedAt = now();
      const executionSymbols=new Set(positions.map(p=>p.model.raw.symbol));
      const snapshotTime=allowWeekendSnapshot?weekendValuationTime(quotes,executionSymbols,checkedAt):null;
      const valuationTime=snapshotTime??checkedAt;
      const quoteStatus = Object.values(quotes).map(q => ({
        symbol:q.symbol, time:q.time, bid:q.bid, ask:q.ask,
        ...transferQuoteStatus(q,{now:checkedAt,conversion:!executionSymbols.has(q.symbol)}),
      }));
      if(quoteStatus.some(q=>q.reason==='invalid'))throw new Error('Invalid test bridge quote');
      if(snapshotTime!==null)for(const q of quoteStatus){if(!q.usable&&transferQuoteStatus(quotes[q.symbol],{now:valuationTime,conversion:!executionSymbols.has(q.symbol)}).usable){q.usable=true;q.reason='weekend-snapshot';}}
      if (quoteStatus.some(q => !q.usable)) {
        return { status:'stale', targetLogin:String(account.login), quotes:quoteStatus, valuation:null };
      }
      const valued = positions.map(p => valueTransferredPosition(p.model, quotes, { now:valuationTime }));
      return {
        status:'ready', marketClosed:snapshotTime!==null,targetLogin:String(account.login), quotes:quoteStatus,
        valuation:compatible?compatible(quotes,{now:valuationTime}):{ positions:valued, profit:addMoney(...valued.map(p=>p.profit)),
          swap:addMoney(...valued.map(p=>p.swap)), commission:addMoney(...valued.map(p=>p.commission)) },
      };
    })().finally(() => { inFlight = null; });
    return inFlight;
  }
  check.candles=async({symbol='EURUSDrfd',timeframe='H4',count=360,to}={})=>{
    const minutes={M1:1,M5:5,M15:15,M30:30,H1:60,H4:240,D1:1440,W1:10080,MN1:44640};
    if(typeof symbol!=='string'||typeof timeframe!=='string'||!/^(EURUSD|USDRUB|GBPUSD|USDCHF|USDJPY|AUDUSD|NZDUSD|USDCNH)rfd$/.test(symbol)||!Object.hasOwn(minutes,timeframe)){
      const error=new Error('Unsupported chart symbol/timeframe');error.status=400;throw error;
    }
    count=Number(count);if(!Number.isInteger(count)||count<1||count>1000){const error=new Error('Invalid chart count');error.status=400;throw error;}
    const end=to?new Date(to):new Date(now());
    if(!Number.isFinite(end.getTime())){const error=new Error('Invalid chart end');error.status=400;throw error;}
    const account=await read('account');
    if(String(account.login)!==String(saved.target_login)||account.currency!==saved.account_view.currency)throw new Error('Wrong test chart account');
    const days=Math.min(Math.ceil(count*minutes[timeframe]/1440*1.5)+1,timeframe==='MN1'?20000:timeframe==='W1'?4000:550);
    const start=new Date(end.getTime()-days*86400000);
    const fmt=date=>new Date(date.getTime()+3*3600000).toISOString().slice(0,19);
    const params=new URLSearchParams({symbol,time_frame:timeframe,from_date:fmt(start),to_date:fmt(end)});
    let raw;
    try{raw=await read('history/prices?'+params,20000);}catch(error){
      if(error.status!==500)throw error;await new Promise(resolve=>setTimeout(resolve,1000));
      try{raw=await read('history/prices?'+params,20000);}catch(retry){
        if(timeframe!=='MN1'||retry.status!==500)throw retry;
        params.set('from_date',fmt(new Date(end.getTime()-20*366*86400000)));raw=await read('history/prices?'+params,20000);
      }
    }
    const list=Array.isArray(raw)?raw:raw.data||raw.bars;
    if(!Array.isArray(list))throw new Error('Invalid chart response');
    const bars=list.map(normalizeCandle);
    if(bars.some(b=>!Number.isFinite(b.time)||b.time<=0||!['open','high','low','close'].every(k=>Number.isFinite(b[k])&&b[k]>0)||b.high<Math.max(b.open,b.close,b.low)||b.low>Math.min(b.open,b.close,b.high)))throw new Error('Invalid chart OHLC');
    const rawQuote=await read('quote?symbol='+encodeURIComponent(symbol));
    if(rawQuote.symbol!==symbol||!rawQuote.time||!toIso(rawQuote.time))throw new Error('Invalid chart quote');
    const quote=normalizeQuote(rawQuote);
    if(!Number.isFinite(quote.bid)||!Number.isFinite(quote.ask)||quote.bid<=0||quote.ask<quote.bid)throw new Error('Invalid chart quote');
    return {symbol,timeframe,quote,bars:bars.sort((a,b)=>a.time-b.time).slice(-count)};
  };
  check.targetState=async({from,to=new Date(now()).toISOString()}={})=>{
    const start=new Date(from),end=new Date(to);
    if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||start>end||end.getTime()>now()+5000)throw new Error('Invalid target history interval');
    const account=await read('account');
    if(String(account.login)!==String(saved.target_login)||account.currency!==saved.account_view.currency)throw new Error('Wrong target account/currency');
    const orders=await read('order/list');
    if(!Array.isArray(orders.opened)||!Array.isArray(orders.pending))throw new Error('Invalid target orders response');
    const fmt=date=>new Date(date.getTime()+3*3600000).toISOString().slice(0,19);
    const params=new URLSearchParams({mode:'deals',from_date:fmt(start),to_date:fmt(end)});
    const history=await read('history/orders?'+params,45000);
    const deals=Array.isArray(history)?history:history.data;
    if(!Array.isArray(deals))throw new Error('Invalid target deals response');
    return {account,opened:orders.opened,pending:orders.pending,deals,from:start.toISOString(),to:end.toISOString()};
  };
  return check;
}
