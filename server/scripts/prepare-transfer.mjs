import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import { inspectTransferSnapshot, prepareTransfer, importPreparedTransfer } from '../services/transfer-staging.js';

async function main() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--commit') options.commit = true;
    else if (['--snapshot', '--source', '--target', '--specifications'].includes(args[i]) && args[i + 1]) {
      options[args[i].slice(2)] = args[++i];
    } else throw new Error('Invalid arguments');
  }
  if (!options.snapshot || !options.source || !options.target) {
    throw new Error('Required: --snapshot FILE --source LOGIN --target LOGIN [--specifications FILE] [--commit]');
  }
  const snapshot = JSON.parse(await readFile(options.snapshot, 'utf8'));
  const inspected = inspectTransferSnapshot(snapshot, options.source, options.target);
  console.log(JSON.stringify({
    capturedAt: snapshot.completedAt, source: options.source, target: options.target,
    positions: inspected.broker.size, symbols: inspected.symbols,
    currency: inspected.account.currency,
    overrides: snapshot.settings?.position_overrides?.length ?? null,
  }, null, 2));
  if (!options.specifications) {
    if (options.commit) throw new Error('Import requires explicit valuation specifications');
    console.log('INSPECTION_OK — no database changes');
    return;
  }
  const specifications = JSON.parse(await readFile(options.specifications, 'utf8'));
  const prepared = prepareTransfer(snapshot, options.source, options.target, specifications);
  if (!options.commit) {
    console.log('VALUATION_PLAN_OK — no database changes');
    return;
  }
  dotenv.config({path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true});
  if (process.env.MT5_TRANSFER_TEST_ONLY !== 'true') throw new Error('Set MT5_TRANSFER_TEST_ONLY=true for test imports');
  const client = new pg.Client({connectionString: process.env.DATABASE_URL});
  await client.connect();
  try {
    const {rows: [database]} = await client.query('SELECT current_database() AS name');
    if (!/^terminal_migration_test_[a-z0-9_]+$/.test(database.name)) {
      throw new Error('Import is restricted to a terminal_migration_test_* database');
    }
    await client.query('BEGIN');
    try {
      const result = await importPreparedTransfer(client, prepared, snapshot);
      await client.query('COMMIT');
      console.log(JSON.stringify({snapshotId: result.id, imported: result.imported}));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
