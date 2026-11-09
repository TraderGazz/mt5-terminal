import dotenv from 'dotenv';
import pg from 'pg';
import {isDeepStrictEqual} from 'node:util';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';
import {createTransferQuoteCheck} from '../services/transfer-quote-check.js';
dotenv.config({path:fileURLToPath(new URL('../.env',import.meta.url)),quiet:true});
const [database,baseUrl]=process.argv.slice(2);
if(!/^terminal_migration_test_close_[a-z0-9_]+$/.test(database||''))throw new Error('Use the separate close-test database');
const original=new URL(process.env.DATABASE_URL);
if(original.pathname!=='/terminal')throw new Error('Run from first terminal configuration');
const target=new URL(original);target.pathname='/'+database;
const db=new pg.Client({connectionString:target.href});await db.connect();
let snapshotId;
try{
 await db.query('BEGIN READ ONLY');
 const {rows:[saved]}=await db.query('SELECT * FROM transfer_snapshots ORDER BY id DESC LIMIT 1');
 if(!saved)throw new Error('No snapshot');snapshotId=String(saved.id);
 const {rows:positions}=await db.query('SELECT * FROM transferred_positions WHERE snapshot_id=$1 ORDER BY original_ticket',[saved.id]);
 if(!positions.length||positions.length!==saved.payload.sitePositions.positions.length||positions.some(p=>p.status!=='open'))throw new Error('Start with a fully restored close-test clone');
 if(!isDeepStrictEqual(saved.account_view,saved.payload.siteAccount.account))throw new Error('Account anchor is not restored');
 if((await db.query('SELECT count(*)::int AS n FROM transferred_position_closures')).rows[0].n!==0)throw new Error('Clone has existing settlements');
 const check=createTransferQuoteCheck({baseUrl,saved,positions});
 const result=await check();if(result.status!=='ready')throw new Error('Quotes unavailable');
 await db.query('COMMIT');
}finally{await db.end();}
const directory='/root/mt5-account-test/close-ui/preview-client';
await mkdir(directory,{recursive:true,mode:0o700});
async function run(command,args,env){await new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:'inherit',env:env||process.env});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(command+' exited '+code)));});}
await run('npm',['--workspace','client','run','build','--','--outDir',directory,'--emptyOutDir'],{
 ...process.env,VITE_DATA_SOURCE:'api',VITE_API_URL:'/api',VITE_WS_URL:'ws://127.0.0.1:4003/ws',
 VITE_SYMBOL:'EURUSDrfd',VITE_VIEWER_CAN_CLOSE:'false',VITE_DEPOSIT_LEDGER_ENABLED:'true',
});
const desktopDirectory='/root/mt5-account-test/close-ui/preview-desktop';
await mkdir(desktopDirectory,{recursive:true,mode:0o700});
await run('npm',['--workspace','desktop','run','build','--','--outDir',desktopDirectory,'--emptyOutDir']);
const env={...process.env,TRANSFER_PREVIEW_DESKTOP_DIR:desktopDirectory,TRANSFER_PREVIEW_DATABASE:database,TRANSFER_PREVIEW_SNAPSHOT_ID:snapshotId,
 TRANSFER_PREVIEW_CLIENT_DIR:directory,TRANSFER_PREVIEW_PORT:'4003',TRANSFER_PREVIEW_QUOTE_URL:baseUrl,
 TRANSFER_PREVIEW_LIVE:'true',TRANSFER_PREVIEW_ALLOW_CLOSE:'true'};
// Use a new process name; never replace or restart either production API or 4002.
const exists=await new Promise(resolve=>{const child=spawn('pm2',['describe','mt5-transfer-close-ui'],{stdio:'ignore'});child.once('error',()=>resolve(false));child.once('exit',code=>resolve(code===0));});
if(exists)await run('pm2',['restart','mt5-transfer-close-ui','--update-env'],env);
else await run('pm2',['start',fileURLToPath(new URL('../transfer-preview.mjs',import.meta.url)),'--name','mt5-transfer-close-ui','--no-autorestart'],env);
let ready=false;
for(let attempt=0;attempt<20;attempt++){
 try{const response=await fetch('http://127.0.0.1:4003/api/health',{signal:AbortSignal.timeout(1000)});const data=await response.json();if(response.ok&&data.source?.closeRehearsal){ready=true;break;}}catch{}
 await new Promise(resolve=>setTimeout(resolve,500));
}
if(!ready)throw new Error('Close UI did not start; inspect pm2 logs mt5-transfer-close-ui');
console.log('CLOSE_UI_READY — http://127.0.0.1:4003/mobile/login; isolated close-test clone; PC: http://127.0.0.1:4003/pc/login.html');
