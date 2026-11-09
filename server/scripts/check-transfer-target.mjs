import dotenv from 'dotenv';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { createTransferQuoteCheck } from '../services/transfer-quote-check.js';
import { toIso, side } from '../services/mt5-bridge/normalize.js';

dotenv.config({path:fileURLToPath(new URL('../.env',import.meta.url)),quiet:true});
const [database,baseUrl]=process.argv.slice(2);
if(!/^terminal_migration_test_[a-z0-9_]+$/.test(database||''))throw new Error('Only migration test databases are allowed');
const url=new URL(process.env.DATABASE_URL);url.pathname='/'+database;
const db=new pg.Client({connectionString:url.href});await db.connect();
try {
  await db.query('BEGIN READ ONLY');
  const {rows:[saved]}=await db.query('SELECT * FROM transfer_snapshots ORDER BY id DESC LIMIT 1');
  if(!saved)throw new Error('No saved snapshot');
  const check=createTransferQuoteCheck({baseUrl,saved,positions:[]});
  const state=await check.targetState({from:new Date(saved.captured_at).toISOString()});
  const trading=state.deals.filter(d=>side(d.type));
  const types={};for(const d of state.deals)types[d.type]=(types[d.type]||0)+1;
  const invalid=state.deals.some(d=>!toIso(d.time)||!Number.isSafeInteger(Number(d.ticket))||Number(d.ticket)<=0||!['profit','swap','commission'].every(k=>Number.isFinite(Number(d[k]))));
  if(invalid)throw new Error('Invalid target deal data');
  console.log(JSON.stringify({targetLogin:state.account.login,currency:state.account.currency,
    brokerBalanceExcludedFromSite:state.account.balance,openPositions:state.opened.length,pendingOrders:state.pending.length,
    historyFrom:state.from,dealTypes:types,tradingDeals:trading.length,
    emptyTarget:state.opened.length===0&&state.pending.length===0&&trading.length===0,
    databaseWrites:0,brokerTradingRequests:0,scope:'Read-only inspection; no connection baseline saved and no cutover'},null,2));
  console.log('HYBRID_TARGET_INSPECTION_OK');
  await db.query('COMMIT');
}finally{await db.end();}
