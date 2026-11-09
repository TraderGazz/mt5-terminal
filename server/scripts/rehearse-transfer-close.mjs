import dotenv from 'dotenv';
import pg from 'pg';
import assert from 'node:assert/strict';
import { mkdir,open,writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createTransferQuoteCheck } from '../services/transfer-quote-check.js';
import { closeRehearsalPosition } from '../services/transfer-close-rehearsal.js';
import { addMoney } from '../services/money.js';
dotenv.config({path:fileURLToPath(new URL('../.env',import.meta.url)),quiet:true});
const [sourceDatabase,bridgeUrl]=process.argv.slice(2);
if(!/^terminal_migration_test_[a-z0-9_]+$/.test(sourceDatabase||'')||sourceDatabase.startsWith('terminal_migration_test_close_'))throw new Error('Use the original migration preview database');
const configured=new URL(process.env.DATABASE_URL);
if(configured.pathname!=='/terminal')throw new Error('Use first terminal configuration');
const sourceUrl=new URL(configured);sourceUrl.pathname='/'+sourceDatabase;
const source=new pg.Client({connectionString:sourceUrl.href});await source.connect();
const stamp=new Date().toISOString().replace(/[-:.TZ]/g,'')+'_'+randomBytes(3).toString('hex');
const database='terminal_migration_test_close_'+stamp;
const directory='/root/mt5-backups/close-rehearsal-'+stamp;
let clone;
const tables=['trades','transfer_snapshots','transferred_positions','transferred_position_closures'];
async function fingerprint(db){const result={};for(const table of tables){
 const {rows:[row]}=await db.query(`SELECT count(*)::int AS count,md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) AS hash FROM ${table} t`);result[table]=row;
}return result;}
async function run(args,stdio){await new Promise((resolve,reject)=>{
 const child=spawn('docker',args,{stdio});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Docker operation failed: '+code)));
});}
async function transaction(work){await clone.query('BEGIN');try{const result=await work();await clone.query('COMMIT');return result;}catch(e){await clone.query('ROLLBACK');throw e;}}
try{
 const sourceBefore=await fingerprint(source);
 await mkdir(directory,{mode:0o700});
 const output=await open(directory+'/preview.dump','wx',0o600);
 try{await run(['exec','mt5-terminal-db','pg_dump','-U','terminal','-d',sourceDatabase,'-Fc'],['ignore',output.fd,'inherit']);}finally{await output.close();}
 await source.query('CREATE DATABASE '+database+' TEMPLATE template0');
 const input=await open(directory+'/preview.dump','r');
 try{await run(['exec','-i','mt5-terminal-db','pg_restore','-U','terminal','-d',database,'--exit-on-error','--no-owner','--no-privileges'],[input.fd,'inherit','inherit']);}finally{await input.close();}
 const cloneUrl=new URL(configured);cloneUrl.pathname='/'+database;
 clone=new pg.Client({connectionString:cloneUrl.href});await clone.connect();
 const before=await fingerprint(clone);assert.deepEqual(before,sourceBefore);
 const {rows:[saved]}=await clone.query('SELECT * FROM transfer_snapshots ORDER BY id DESC LIMIT 1');
 const {rows:positions}=await clone.query("SELECT * FROM transferred_positions WHERE snapshot_id=$1 AND status='open' ORDER BY original_ticket",[saved.id]);
 if(!positions.length)throw new Error('No positions');
 const result=await createTransferQuoteCheck({baseUrl:bridgeUrl,saved,positions})();
 if(result.status!=='ready')throw new Error('Fresh quotes required; no position closed');
 const quotes=Object.fromEntries(result.quotes.map(q=>[q.symbol,q]));
 const chosen=positions[0];const now=Date.now();
 const closed=await transaction(()=>closeRehearsalPosition(clone,chosen.id,quotes,'close-rehearsal',{now}));
 assert.equal(Number(closed.account.balance),addMoney(saved.account_view.balance,closed.closure.total));
 assert.equal(closed.account.equity,closed.before.equity);
 assert.equal(closed.account.freeMargin,closed.before.freeMargin);
 assert.equal(Number(closed.history.profit),Number(closed.closure.profit));
 assert.equal(Number(closed.history.swap),Number(closed.closure.swap));
 const afterClose=await fingerprint(clone);
 assert.equal(afterClose.trades.count,before.trades.count+1);
 assert.equal((await clone.query("SELECT count(*)::int AS n FROM transferred_positions WHERE status='open'")).rows[0].n,positions.length-1);
 // Retry with no quotes: committed settlement is returned, never charged again.
 const repeat=await transaction(()=>closeRehearsalPosition(clone,chosen.id,{},'repeat-rehearsal',{now:now+999999}));
 assert.equal(repeat.repeated,true);assert.equal(repeat.history.id,closed.history.id);
 assert.deepEqual(await fingerprint(clone),afterClose);
 // Restore the throwaway clone too. The ordinary preview was never switched.
 await transaction(async()=>{
  await clone.query('DELETE FROM trades WHERE id=$1 AND source=$2',[closed.history.id,'transfer-rehearsal']);
  await clone.query('DELETE FROM transferred_position_closures WHERE position_id=$1',[chosen.id]);
  await clone.query("UPDATE transferred_positions SET status='open' WHERE id=$1",[chosen.id]);
  await clone.query('UPDATE transfer_snapshots SET account_view=$1 WHERE id=$2',[saved.account_view,saved.id]);
 });
 assert.deepEqual(await fingerprint(clone),before,'Close-test clone was not restored exactly');
 assert.deepEqual(await fingerprint(source),sourceBefore,'Original preview changed');
 const report={sourceDatabase,closeTestDatabase:database,backupDirectory:directory,
  testedTicket:chosen.original_ticket,openPositions:{before:positions.length,afterClose:positions.length-1,afterRestore:positions.length},
  historyRows:{before:before.trades.count,afterClose:afterClose.trades.count,afterRestore:before.trades.count},
  settlement:{profit:closed.closure.profit,swap:closed.closure.swap,commission:closed.closure.commission,total:closed.closure.total},
  balance:{before:saved.account_view.balance,afterClose:closed.account.balance,afterRestore:saved.account_view.balance},
  equityUnchangedAtFrozenQuotes:true,repeatDidNotChargeAgain:true,cloneRestored:true,originalPreviewUnchanged:true,
  brokerTradingRequests:0,scope:'Storage rehearsal only; browser close route is not enabled'};
 await writeFile(directory+'/result.json',JSON.stringify(report,null,2),{mode:0o600,flag:'wx'});
 console.log(JSON.stringify(report,null,2));console.log('CLOSE_REHEARSAL_OK — position restored; original preview unchanged');
}catch(error){console.error('Rehearsal stopped:',error.message,'; isolated database:',database);process.exitCode=1;}
finally{if(clone)await clone.end();await source.end();}
