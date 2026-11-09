import dotenv from 'dotenv';
import pg from 'pg';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createTransferQuoteCheck } from '../services/transfer-quote-check.js';
import { createHybridTransferReader } from '../services/transfer-hybrid-reader.js';

dotenv.config({path:fileURLToPath(new URL('../.env',import.meta.url)),quiet:true});
const [database,baseUrl]=process.argv.slice(2);
if(!/^terminal_migration_test_hybrid_[a-z0-9_]+$/.test(database||''))throw new Error('Only hybrid test database allowed');
const url=new URL(process.env.DATABASE_URL);url.pathname='/'+database;
const db=new pg.Client({connectionString:url.href});await db.connect();
try{
 await db.query('BEGIN READ ONLY');
 const {rows:[saved]}=await db.query('SELECT * FROM transfer_snapshots ORDER BY id DESC LIMIT 1');
 if(!saved)throw new Error('No snapshot');
 const {rows:[baseline]}=await db.query('SELECT * FROM transfer_target_baselines WHERE snapshot_id=$1',[saved.id]);
 if(!baseline)throw new Error('No persisted target baseline');
 const {rows:positions}=await db.query('SELECT * FROM transferred_positions WHERE snapshot_id=$1 ORDER BY original_ticket',[saved.id]);
 if(positions.some(p=>p.status!=='open'))throw new Error('This rehearsal requires restored old positions');
 const check=createTransferQuoteCheck({baseUrl,saved,positions});
 const state=await createHybridTransferReader({saved,positions,baseline,quoteCheck:check})();
 assert.equal(state.accounting.marginLevelNeedsBasis,false);
 console.log(JSON.stringify({database,targetLogin:baseline.target_login,startedAt:baseline.started_at,
  brokerBalanceExcluded:baseline.broker_balance_excluded,oldPositions:positions.length,newPositions:state.source.targetPositions,
  totalPositions:state.positions.length,newDeals:state.source.targetDeals,accounting:state.accounting,account:state.account,
  databaseWrites:0,brokerTradingRequests:0,scope:'Read-only combined calculation; browser feed and trading routes unchanged'},null,2));
 await db.query('COMMIT');console.log('HYBRID_READER_OK');
}finally{await db.end();}
