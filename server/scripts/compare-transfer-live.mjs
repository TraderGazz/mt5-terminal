import dotenv from 'dotenv';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'node:url';
import { createTransferQuoteCheck } from '../services/transfer-quote-check.js';
import { createLivePreviewState } from '../services/transfer-live-preview.js';
import { valueTransferredPosition } from '../services/transfer-staging.js';
import { normalizePosition,normalizeQuote } from '../services/mt5-bridge/normalize.js';
import { addMoney,roundMoney } from '../services/money.js';
dotenv.config({path:fileURLToPath(new URL('../.env',import.meta.url)),quiet:true});
const [database,baseUrl]=process.argv.slice(2);
if(!/^terminal_migration_test_[a-z0-9_]+$/.test(database||''))throw new Error('Only migration test databases');
const sourceUrl=new URL(process.env.DATABASE_URL);
if(sourceUrl.pathname!=='/terminal')throw new Error('Use first terminal configuration');
const sourceDb=new pg.Client({connectionString:sourceUrl.href});
const targetUrl=new URL(sourceUrl);targetUrl.pathname='/'+database;
const testDb=new pg.Client({connectionString:targetUrl.href});
await sourceDb.connect();await testDb.connect();
try{
 await sourceDb.query('BEGIN READ ONLY');await testDb.query('BEGIN READ ONLY');
 const {rows:[user]}=await sourceDb.query('SELECT id,login,role FROM users WHERE active=TRUE ORDER BY id LIMIT 1');
 if(!user||!process.env.JWT_SECRET)throw new Error('Source authorization unavailable');
 const token=jwt.sign({sub:String(user.id),login:user.login,role:user.role},process.env.JWT_SECRET,{expiresIn:'120s'});
 async function get(url,auth=false){const r=await fetch(url,{headers:auth?{Authorization:'Bearer '+token}:{},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}
 const api='http://127.0.0.1:'+(process.env.PORT||4000)+'/api';
 const bridge=process.env.MT5_BRIDGE_URL.replace(/\/$/,'');
 const {rows:[saved]}=await testDb.query('SELECT * FROM transfer_snapshots ORDER BY id DESC LIMIT 1');
 if(!saved)throw new Error('Snapshot absent');
 const {rows:positions}=await testDb.query("SELECT * FROM transferred_positions WHERE snapshot_id=$1 AND status='open' ORDER BY original_ticket",[saved.id]);
 const newCheck=createTransferQuoteCheck({baseUrl,saved,positions});
 const startedAt=new Date().toISOString();
 const brokerAccount=await get(bridge+'/account');
 if(String(brokerAccount.login)!==String(saved.source_login))throw new Error('Wrong source account');
 const currentRaw=await get(bridge+'/order/list');
 const sourceQuotes={};
 for(const symbol of ['EURUSDrfd','USDRUBrfd'])sourceQuotes[symbol]=normalizeQuote(await get(bridge+'/quote?symbol='+symbol));
 const sourceAccount=(await get(api+'/account',true)).account;
 const sourcePositions=(await get(api+'/positions',true)).positions;
 const target=await newCheck();
 const byId=new Map(sourcePositions.map(p=>[String(p.id),p]));
 const missing=positions.filter(p=>!byId.has(String(p.original_ticket))).map(p=>p.original_ticket);
 const testIds=new Set(positions.map(p=>String(p.original_ticket)));
 const added=sourcePositions.filter(p=>!testIds.has(String(p.id))).map(p=>p.id);
 const comparison=[];
 for(const p of positions){
  const original=byId.get(String(p.original_ticket));if(!original)continue;
  const sameQuotes=valueTransferredPosition(p.model,sourceQuotes);
  comparison.push({ticket:p.original_ticket,type:original.type,sourcePrice:original.currentPrice,
   controlPrice:sameQuotes.currentPrice,sourceProfit:original.profit,modelAtSourceQuotes:sameQuotes.profit,
   profitDifference:addMoney(sameQuotes.profit,-original.profit),
   swapDifference:addMoney(p.model.view.swap,-original.swap),
   openPriceChanged:p.model.view.openPrice!==original.openPrice});
 }
 const sourceTotal=addMoney(...sourcePositions.map(p=>p.profit));
 const snapshotTotal=addMoney(...positions.map(p=>p.model.view.profit));
 let liveAccount=null;
 if(target.status==='ready')liveAccount=(await createLivePreviewState({saved,positions,quoteCheck:async()=>target})()).account;
 function rawSummary(raw,fx){
  const list=(Array.isArray(raw)?raw:raw.opened||raw.positions||[]).map(normalizePosition);
  return {profit:addMoney(...list.map(p=>p.profit)),swap:addMoney(...list.map(p=>p.swap)),
   referenceFx:fx, sides:['buy','sell'].map(type=>{
    const side=list.filter(p=>p.type===type);
    return {type,count:side.length,profit:addMoney(...side.map(p=>p.profit)),
     samples:side.filter(p=>Math.abs(p.currentPrice-p.openPrice)>.001).slice(0,4).map(p=>({ticket:p.id,
      volume:p.volume,open:p.openPrice,current:p.currentPrice,profit:p.profit,
      impliedConversion:p.profit/((type==='buy'?1:-1)*(p.currentPrice-p.openPrice)*p.volume*100000)}))};
   })};
 }
 const fxSource=sourceQuotes.USDRUBrfd;
 const snapshotFx=saved.payload.referenceQuotes?.USDRUBrfd;
 console.log(JSON.stringify({startedAt,finishedAt:new Date().toISOString(),snapshotAt:saved.captured_at,
  counts:{snapshot:positions.length,source:sourcePositions.length,missing,added},
  sourceQuotes,targetQuotes:target.quotes,
  accounts:{snapshot:saved.account_view,source:sourceAccount,preview:liveAccount,
   equityDifference:liveAccount?addMoney(liveAccount.equity,-sourceAccount.equity):null},
  totals:{snapshotProfit:snapshotTotal,sourceProfit:sourceTotal,targetProfit:target.valuation?.profit,
   modelAtSourceQuotes:addMoney(...comparison.map(p=>p.modelAtSourceQuotes)),
   modelDifferenceAtSourceQuotes:addMoney(...comparison.map(p=>p.profitDifference)),
   swapDifference:addMoney(...comparison.map(p=>p.swapDifference)),
   brokerFloating:brokerAccount.profit,brokerEquity:brokerAccount.equity,
   snapshotBrokerFloating:saved.payload.brokerAccount.profit,snapshotBrokerEquity:saved.payload.brokerAccount.equity},
  largestDifferences:comparison.sort((a,b)=>Math.abs(b.profitDifference)-Math.abs(a.profitDifference)).slice(0,8),
  rawBroker:{snapshot:rawSummary(saved.payload.brokerPositions,snapshotFx),source:rawSummary(currentRaw,fxSource),
   snapshotAccount:{profit:saved.payload.brokerAccount.profit,margin:saved.payload.brokerAccount.margin,margin_level:saved.payload.brokerAccount.margin_level},
   sourceAccount:{profit:brokerAccount.profit,margin:brokerAccount.margin,margin_level:brokerAccount.margin_level}},
  changedOpenPrices:comparison.filter(p=>p.openPriceChanged).length,
  warning:'Sequential live reads: quotes may move between requests; no data changed'
 },null,2));
 await testDb.query('COMMIT');await sourceDb.query('COMMIT');
}finally{await testDb.end();await sourceDb.end();}
