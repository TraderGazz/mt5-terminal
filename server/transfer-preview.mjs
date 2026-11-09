import dotenv from 'dotenv';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, basename } from 'node:path';
import pg from 'pg';
import { createTransferPreviewApp } from './services/transfer-preview-app.js';

dotenv.config({path:fileURLToPath(new URL('./.env',import.meta.url)),quiet:true});
const database = process.env.TRANSFER_PREVIEW_DATABASE;
const snapshotId = process.env.TRANSFER_PREVIEW_SNAPSHOT_ID;
const port = Number(process.env.TRANSFER_PREVIEW_PORT || 4002);
if (!/^terminal_migration_test_[a-z0-9_]+$/.test(database || '') || !/^[1-9]\d*$/.test(snapshotId || '')) {
  throw new Error('TRANSFER_PREVIEW_DATABASE must be terminal_migration_test_*; set TRANSFER_PREVIEW_SNAPSHOT_ID');
}
if (!Number.isInteger(port) || port < 1024 || port > 65535 || [4000,4001].includes(port)) throw new Error('Invalid preview port');
const allowClose=process.env.TRANSFER_PREVIEW_ALLOW_CLOSE==='true';
if(allowClose&&(!/^terminal_migration_test_close_[a-z0-9_]+$/.test(database)||port!==4003))throw new Error('Close UI requires separate close clone and port 4003');
const clientDir = resolve(process.env.TRANSFER_PREVIEW_CLIENT_DIR || '');
if (basename(clientDir) !== 'preview-client') throw new Error('Use a separate preview-client build directory');
const desktopDir=process.env.TRANSFER_PREVIEW_DESKTOP_DIR?resolve(process.env.TRANSFER_PREVIEW_DESKTOP_DIR):undefined;
if(desktopDir&&(!allowClose||basename(desktopDir)!=='preview-desktop'))throw new Error('Use separate preview-desktop only for close rehearsal');
const databaseUrl = new URL(process.env.DATABASE_URL);
databaseUrl.pathname = '/' + database;
process.env.DATABASE_URL = databaseUrl.href;
// Loaded dynamically below. Any history fallback stays isolated from a broker.
process.env.MT5_BRIDGE = 'real';
process.env.MT5_BRIDGE_URL = 'http://127.0.0.1:9/v1';
process.env.MT5_BRIDGE_WS = 'ws://127.0.0.1:9';
process.env.JWT_SECRET = randomBytes(32).toString('hex');

const client = new pg.Client({connectionString:databaseUrl.href});
await client.connect();
let saved, positions;
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  ({rows:[saved]} = await client.query('SELECT * FROM transfer_snapshots WHERE id = $1',[snapshotId]));
  ({rows:positions} = await client.query('SELECT * FROM transferred_positions WHERE snapshot_id = $1 ORDER BY original_ticket',[snapshotId]));
  if (!saved || positions.length !== saved.payload.sitePositions.positions.length || (!allowClose&&positions.some(p=>p.status !== 'open'))) {
    throw new Error('Preview requires a complete open snapshot');
  }
  const sourceOrder = new Map(saved.payload.sitePositions.positions.map((p, i) => [String(p.id), i]));
  positions.sort((a, b) => sourceOrder.get(String(a.original_ticket)) - sourceOrder.get(String(b.original_ticket)));
  await client.query('COMMIT');
} finally {
  await client.end();
}

const {initDb,isDbReady} = await import('./db.js');
const {default:authRouter,authRequired} = await import('./routes/auth.js');
const {default:historyRouter} = await import('./routes/history.js');
initDb();
for (let attempt=0; attempt<50 && !isDbReady(); attempt++) await new Promise(r=>setTimeout(r,100));
if (!isDbReady()) throw new Error('Test database unavailable');
let quoteCheck,readState;
const {createLivePreviewState,attachTransferPreviewFeed}=await import('./services/transfer-live-preview.js');
if (process.env.TRANSFER_PREVIEW_QUOTE_URL) {
  const { createTransferQuoteCheck } = await import('./services/transfer-quote-check.js');
  quoteCheck = createTransferQuoteCheck({baseUrl:process.env.TRANSFER_PREVIEW_QUOTE_URL,saved,positions});
}
if(process.env.TRANSFER_PREVIEW_LIVE==='true') {
  if(!quoteCheck)throw new Error('Live preview requires TRANSFER_PREVIEW_QUOTE_URL');
  readState=createLivePreviewState({saved,positions,quoteCheck});
}
let closeUi,closePool;
if(allowClose){
  if(!process.env.TRANSFER_PREVIEW_QUOTE_URL)throw new Error('Quote URL missing');
  closePool=new pg.Pool({connectionString:databaseUrl.href,max:4});
  const {createCloseUi}=await import('./services/transfer-close-ui.js');
  closeUi=await createCloseUi({pool:closePool,saved,positions,baseUrl:process.env.TRANSFER_PREVIEW_QUOTE_URL});
  readState=closeUi.readState;quoteCheck=closeUi.quoteCheck;
}
const app = await createTransferPreviewApp({saved,positions,clientDir,authRouter,authRequired,historyRouter,quoteCheck,readState,closeUi,desktopDir});
const server = app.listen(port,'127.0.0.1',()=>console.log(`[transfer-preview] http://127.0.0.1:${port}/mobile/login; ${positions.length} saved positions`));
const closeFeed=readState?attachTransferPreviewFeed(server,{readState,authRequired}):()=>{};
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{closeFeed();server.close(async()=>{if(closePool)await closePool.end();process.exit(0);});});
