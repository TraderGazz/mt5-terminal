import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import { cents, addMoney } from '../services/money.js';
import { valueTransferredPosition } from '../services/transfer-staging.js';

const database = process.argv[2];
const snapshotId = process.argv[3];
if (!/^terminal_migration_test_[a-z0-9_]+$/.test(database || '') || !/^[1-9]\d*$/.test(snapshotId || '')) {
  throw new Error('Usage: node server/scripts/verify-transfer.mjs terminal_migration_test_NAME SNAPSHOT_ID');
}
dotenv.config({path:fileURLToPath(new URL('../.env',import.meta.url)),quiet:true});
const url = new URL(process.env.DATABASE_URL);
url.pathname = '/' + database;
const client = new pg.Client({connectionString:url.href});
await client.connect();
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const {rows:[saved]} = await client.query('SELECT * FROM transfer_snapshots WHERE id = $1',[snapshotId]);
  if (!saved) throw new Error('Snapshot not found');
  const {rows:positions} = await client.query('SELECT * FROM transferred_positions WHERE snapshot_id = $1 ORDER BY original_ticket',[snapshotId]);
  const original = new Map(saved.payload.sitePositions.positions.map(p=>[String(p.id),p]));
  if (positions.length !== original.size) throw new Error('Stored position count differs from original snapshot');
  const seen = new Set();
  const failures = [];
  const totals = {profit:0,swap:0,commission:0};
  let manualVolumeChanges = 0;
  let directionalChecks = 0;
  const now = Date.now();
  for (const position of positions) {
    const model = position.model;
    const key = String(position.original_ticket);
    const view = original.get(key);
    if (!view || seen.has(key)) throw new Error('Stored position identity mismatch');
    seen.add(key);
    if (!model.view) throw new Error('Missing model view');
    // JSONB reorders keys, so compare values rather than serialized objects.
    for (const field of Object.keys(view)) {
      if (JSON.stringify(model.view[field]) !== JSON.stringify(view[field])) failures.push({ticket:key,field});
    }
    const time = new Date(now).toISOString();
    const quote = {symbol:view.symbol,bid:view.currentPrice,ask:view.currentPrice,time};
    const quotes = {[view.symbol]:quote};
    if (model.valuation.conversionSymbol) {
      const symbol = model.valuation.conversionSymbol;
      quotes[symbol] = {symbol,bid:model.valuation.referenceRate,ask:model.valuation.referenceRate,time};
    }
    const valued = valueTransferredPosition(model,quotes,{now});
    for (const field of ['profit','swap','commission']) {
      if (cents(valued[field]) !== cents(view[field])) failures.push({ticket:key,field:field+' at anchor'});
      totals[field] = addMoney(totals[field],valued[field]);
    }
    if (valued.volume !== view.volume || valued.openPrice !== view.openPrice) failures.push({ticket:key,field:'display metadata'});
    if (model.raw.volume !== view.volume) manualVolumeChanges++;
    const step = 0.0001;
    quotes[view.symbol] = {...quote,bid:quote.bid+step,ask:quote.ask+step};
    const moved = valueTransferredPosition(model,quotes,{now});
    const difference = cents(moved.profit)-cents(valued.profit);
    if ((view.type === 'buy' && difference <= 0) || (view.type === 'sell' && difference >= 0)) {
      failures.push({ticket:key,field:'price direction'});
    }
    directionalChecks++;
  }
  const {rows:[history]} = await client.query('SELECT COUNT(*) AS count FROM trades');
  await client.query('COMMIT');
  console.log(JSON.stringify({
    database,snapshotId,positions:positions.length,controlQuotes:'synthetic snapshot prices; no broker requests',
    anchorMismatches:failures.length,directionalChecks,manualVolumeChanges,
    storedOverrides:saved.payload.settings?.position_overrides?.length ?? null,
    totals:{...totals,includingSwapAndCommission:addMoney(totals.profit,totals.swap,totals.commission)},
    historyRows:Number(history.count),
    failures:failures.slice(0,10),
  },null,2));
  if (failures.length) process.exitCode=1;
  else console.log('TRANSFER_CONTROL_CHECK_OK');
} finally {
  await client.end();
}
