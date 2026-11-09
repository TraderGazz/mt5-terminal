import dotenv from 'dotenv';
import pg from 'pg';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createTransferQuoteCheck} from '../services/transfer-quote-check.js';
import {createHybridTransferReader} from '../services/transfer-hybrid-reader.js';
import {createHybridReviewState} from '../services/transfer-hybrid-review.js';
dotenv.config({path:fileURLToPath(new URL('../.env',import.meta.url)),quiet:true});
const [database,baseUrl]=process.argv.slice(2);
if(!/^terminal_migration_test_hybrid_[a-z0-9_]+$/.test(database||''))throw new Error('Use separate hybrid test database');
const configured=new URL(process.env.DATABASE_URL);if(configured.pathname!=='/terminal')throw new Error('Use first terminal configuration');
const target=new URL(configured);target.pathname='/'+database;
const db=new pg.Client({connectionString:target.href});await db.connect();let snapshotId;
try{
 await db.query('BEGIN READ ONLY');
 const {rows:[saved]}=await db.query('SELECT * FROM transfer_snapshots ORDER BY id DESC LIMIT 1');
 if(!saved)throw new Error('No snapshot');snapshotId=String(saved.id);
 const {rows:positions}=await db.query('SELECT * FROM transferred_positions WHERE snapshot_id=$1 ORDER BY original_ticket',[saved.id]);
 if(!positions.length||positions.length!==saved.payload.sitePositions.positions.length||positions.some(p=>p.status!=='open'))throw new Error('Complete open snapshot required');
 const {rows:[baseline]}=await db.query('SELECT * FROM transfer_target_baselines WHERE snapshot_id=$1',[saved.id]);
 if(!baseline)throw new Error('No target baseline');
 const quoteCheck=createTransferQuoteCheck({baseUrl,saved,positions});
 await createHybridReviewState(createHybridTransferReader({saved,positions,baseline,quoteCheck}))();
 await db.query('COMMIT');
}finally{await db.end();}
async function run(command,args,env=process.env){await new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:'inherit',env});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(command+' failed '+code)));});}
const directory='/root/mt5-account-test/online-review';
const client=directory+'/preview-client',desktop=directory+'/preview-desktop';
await mkdir(client,{recursive:true,mode:0o700});await mkdir(desktop,{recursive:true,mode:0o700});
await run('npm',['--workspace','client','run','build','--','--outDir',client,'--emptyOutDir'],{
 ...process.env,VITE_DATA_SOURCE:'api',VITE_API_URL:'/api',VITE_WS_URL:'wss://trader-mt5.online/ws',
 VITE_SYMBOL:'EURUSDrfd',VITE_VIEWER_CAN_CLOSE:'false',VITE_DEPOSIT_LEDGER_ENABLED:'true',
});
await run('npm',['--workspace','desktop','run','build','--','--outDir',desktop,'--emptyOutDir']);
const env={...process.env,TRANSFER_PREVIEW_DATABASE:database,TRANSFER_PREVIEW_SNAPSHOT_ID:snapshotId,
 TRANSFER_PREVIEW_PORT:'4004',TRANSFER_PREVIEW_HYBRID:'true',TRANSFER_PREVIEW_ALLOW_CLOSE:'false',TRANSFER_PREVIEW_LIVE:'true',
 TRANSFER_PREVIEW_QUOTE_URL:baseUrl,TRANSFER_PREVIEW_CLIENT_DIR:client,TRANSFER_PREVIEW_DESKTOP_DIR:desktop};
const exists=await new Promise(resolve=>{const child=spawn('pm2',['describe','mt5-transfer-online-review'],{stdio:'ignore'});child.once('error',()=>resolve(false));child.once('exit',code=>resolve(code===0));});
if(exists)await run('pm2',['restart','mt5-transfer-online-review','--update-env'],env);
else await run('pm2',['start',fileURLToPath(new URL('../transfer-preview.mjs',import.meta.url)),'--name','mt5-transfer-online-review'],env);
let ready=false;
for(let i=0;i<30;i++){
 try{const r=await fetch('http://127.0.0.1:4004/api/health',{signal:AbortSignal.timeout(1000)});const d=await r.json();if(r.ok&&d.source?.hybridPreview){ready=true;break;}}catch{}
 await new Promise(r=>setTimeout(r,500));
}
if(!ready)throw new Error('Review service unavailable; inspect pm2 logs mt5-transfer-online-review');
const feed=await fetch('http://127.0.0.1:4004/api/transfer/feed-status',{signal:AbortSignal.timeout(60000)});
if(!feed.ok)throw new Error('Review quotes unavailable; domain unchanged');
console.log('ONLINE_REVIEW_READY — localhost:4004; domain not switched; read-only transfer review');
