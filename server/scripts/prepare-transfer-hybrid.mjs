import dotenv from 'dotenv';
import pg from 'pg';
import assert from 'node:assert/strict';
import { mkdir,open,writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createTransferQuoteCheck } from '../services/transfer-quote-check.js';
import { prepareTargetBaseline } from '../services/transfer-target-baseline.js';

dotenv.config({path:fileURLToPath(new URL('../.env',import.meta.url)),quiet:true});
const [sourceDatabase,baseUrl]=process.argv.slice(2);
if(!/^terminal_migration_test_\d[a-z0-9_]+$/.test(sourceDatabase||''))throw new Error('Use the original test preview database');
const configured=new URL(process.env.DATABASE_URL);
if(configured.pathname!=='/terminal')throw new Error('Use first terminal configuration');
const sourceUrl=new URL(configured);sourceUrl.pathname='/'+sourceDatabase;
const source=new pg.Client({connectionString:sourceUrl.href});await source.connect();
let clone;
const stamp=new Date().toISOString().replace(/[-:.TZ]/g,'')+'_'+randomBytes(3).toString('hex');
const database='terminal_migration_test_hybrid_'+stamp;
const directory='/root/mt5-backups/hybrid-'+stamp;
async function run(args,stdio){await new Promise((resolve,reject)=>{const child=spawn('docker',args,{stdio});child.once('error',reject);child.once('exit',c=>c===0?resolve():reject(new Error('Docker failed '+c)));});}
async function fingerprint(db){const result={};for(const table of ['trades','transfer_snapshots','transferred_positions','transferred_position_closures']){
 const {rows:[row]}=await db.query(`SELECT count(*)::int AS count,md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) AS hash FROM ${table} t`);result[table]=row;
}return result;}
try{
 const before=await fingerprint(source);
 const {rows:[saved]}=await source.query('SELECT * FROM transfer_snapshots ORDER BY id DESC LIMIT 1');
 if(!saved)throw new Error('No saved snapshot');
 const check=createTransferQuoteCheck({baseUrl,saved,positions:[]});
 const target=await check.targetState({from:new Date(saved.captured_at).toISOString()});
 await mkdir(directory,{mode:0o700});
 const output=await open(directory+'/preview.dump','wx',0o600);
 try{await run(['exec','mt5-terminal-db','pg_dump','-U','terminal','-d',sourceDatabase,'-Fc'],['ignore',output.fd,'inherit']);}finally{await output.close();}
 await source.query('CREATE DATABASE '+database+' TEMPLATE template0');
 const input=await open(directory+'/preview.dump','r');
 try{await run(['exec','-i','mt5-terminal-db','pg_restore','-U','terminal','-d',database,'--exit-on-error','--no-owner','--no-privileges'],[input.fd,'inherit','inherit']);}finally{await input.close();}
 const cloneUrl=new URL(configured);cloneUrl.pathname='/'+database;
 clone=new pg.Client({connectionString:cloneUrl.href});await clone.connect();
 assert.deepEqual(await fingerprint(clone),before);
 await clone.query('BEGIN');
 let result;
 try{
  result=await prepareTargetBaseline(clone,{saved,target,now:Date.parse(target.to)});
  const repeated=await prepareTargetBaseline(clone,{saved,target:{},now:Date.now()+86400000});
  assert.equal(repeated.created,false);assert.deepEqual(repeated.baseline,result.baseline);
  await clone.query('COMMIT');
 }catch(error){await clone.query('ROLLBACK');throw error;}
 assert.deepEqual(await fingerprint(clone),before);
 assert.deepEqual(await fingerprint(source),before);
 const report={database,backupDirectory:directory,targetLogin:result.baseline.target_login,
  startedAt:result.baseline.started_at,brokerBalanceExcluded:result.baseline.broker_balance_excluded,
  oldPositions:before.transferred_positions.count,historyRows:before.trades.count,
  baselineSurvivesRepeat:true,originalPreviewUnchanged:true,brokerTradingRequests:0,
  scope:'Isolated baseline preparation only; production unchanged; target account not yet monitored'};
 await writeFile(directory+'/result.json',JSON.stringify(report,null,2),{mode:0o600});
 console.log(JSON.stringify(report,null,2));console.log('HYBRID_BASELINE_READY');
}finally{await clone?.end();await source.end();}
