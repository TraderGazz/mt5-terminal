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
const clientDir = resolve(process.env.TRANSFER_PREVIEW_CLIENT_DIR || '');
if (basename(clientDir) !== 'preview-client') throw new Error('Use a separate preview-client build directory');
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
  if (!saved || positions.length !== saved.payload.sitePositions.positions.length || positions.some(p=>p.status !== 'open')) {
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
let quoteCheck;
if (process.env.TRANSFER_PREVIEW_QUOTE_URL) {
  const { createTransferQuoteCheck } = await import('./services/transfer-quote-check.js');
  quoteCheck = createTransferQuoteCheck({baseUrl:process.env.TRANSFER_PREVIEW_QUOTE_URL,saved,positions});
}
const app = await createTransferPreviewApp({saved,positions,clientDir,authRouter,authRequired,historyRouter,quoteCheck});
const server = app.listen(port,'127.0.0.1',()=>console.log(`[transfer-preview] http://127.0.0.1:${port}/mobile/login; ${positions.length} saved positions`));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>process.exit(0)));
