import dotenv from 'dotenv';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { createTransferQuoteCheck } from '../services/transfer-quote-check.js';
dotenv.config({path:fileURLToPath(new URL('../.env',import.meta.url)),quiet:true});
const [database,baseUrl] = process.argv.slice(2);
if (!/^terminal_migration_test_[a-z0-9_]+$/.test(database || '')) throw new Error('Only the migration test database is allowed');
const url = new URL(process.env.DATABASE_URL);
url.pathname = '/' + database;
const db = new pg.Client({connectionString:url.href});
await db.connect();
try {
  await db.query('BEGIN READ ONLY');
  const {rows:[saved]} = await db.query('SELECT * FROM transfer_snapshots ORDER BY id DESC LIMIT 1');
  if (!saved) throw new Error('No transfer snapshot');
  const {rows:positions} = await db.query("SELECT * FROM transferred_positions WHERE snapshot_id=$1 AND status='open' ORDER BY original_ticket",[saved.id]);
  const check=createTransferQuoteCheck({baseUrl,saved,positions});
  const result=await check();
  const {valuation,...status} = result;
  console.log(JSON.stringify({...status,positions:positions.length,sourceBalance:saved.account_view.balance,
    valuation:valuation ? {profit:valuation.profit,swap:valuation.swap,commission:valuation.commission} : null},null,2));
  console.log(result.status === 'ready' ? 'TEST_QUOTES_READY' : 'TEST_QUOTES_STALE — waiting for fresh market quotes; snapshot unchanged');
  if(process.argv.includes('--candles')){
    try{
      const chart=await check.candles({symbol:'EURUSDrfd',timeframe:'H4',count:360});
      console.log(JSON.stringify({chart:'EURUSDrfd H4',count:chart.bars.length,first:chart.bars[0],last:chart.bars.at(-1)},null,2));
    }catch(error){console.log('CHART_ERROR:',error.message);}
  }
  await db.query('COMMIT');
} finally { await db.end(); }
