import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { spawnSync } from 'node:child_process';
import { editTrade, readClosedTradeEditDelta } from '../services/closed-trade-edits.js';

const url = process.env.TEST_DATABASE_URL;
test('closed trade edits: PostgreSQL integration', { skip: !url }, async (t) => {
  const schema = `closed_edit_test_${process.pid}_${Date.now()}`;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 4 });
  const query = (sql, params) => pool.query(sql, params);
  const transaction = async (work) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  };
  const patch = (id, fields) => transaction((client) => editTrade(client, id, fields, 'test-admin'));
  const delta = () => readClosedTradeEditDelta(query);
  const reset = async () => {
    await query('TRUNCATE trades, closed_trade_edits RESTART IDENTITY');
    await query(`INSERT INTO trades (ticket, position_id, symbol, deal_type, profit, swap, commission, close_time)
      VALUES (123, 456, 'EURUSD', 'buy', 1000, -100, 0, now())`);
  };
  try {
    const init = await readFile(new URL('../../database/init.sql', import.meta.url), 'utf8');
    const tradesDdl = init.slice(init.indexOf('CREATE TABLE IF NOT EXISTS trades ('), init.indexOf('CREATE INDEX IF NOT EXISTS idx_trades_close_time'));
    await query(tradesDdl);
    await query(await readFile(new URL('../../database/migrations/014_closed_trade_edits.sql', import.meta.url), 'utf8'));

    await t.test('existing history is not backfilled; migration is idempotent', async () => {
      await reset();
      await query(await readFile(new URL('../../database/migrations/014_closed_trade_edits.sql', import.meta.url), 'utf8'));
      assert.equal(await delta(), 0);
    });
    await t.test('swap change, repeated save, subsequent edit and reversal', async () => {
      await reset();
      await patch(1, { swap: -110100 });
      assert.equal(await delta(), -110000);
      await patch(1, { swap: -110100 });
      assert.equal(await delta(), -110000);
      assert.equal((await query('SELECT COUNT(*) FROM closed_trade_edits')).rows[0].count, '1');
      await patch(1, { swap: -120100 });
      assert.equal(await delta(), -120000);
      await patch(1, { swap: -100 });
      assert.equal(await delta(), 0);
    });
    await t.test('profit, swap and commission use exact decimal arithmetic', async () => {
      await reset();
      await patch(1, { profit: '1000.01', swap: '-99.99', commission: '-0.01' });
      assert.equal(await delta(), 0.01);
      const row = (await query('SELECT * FROM closed_trade_edits')).rows[0];
      assert.equal(row.actor, 'test-admin');
      assert.equal(Number(row.old_swap), -100);
      assert.equal(Number(row.new_swap), -99.99);
    });
    await t.test('concurrent edits to the same row do not double count', async () => {
      await reset();
      await Promise.all([patch(1, { swap: -110100 }), patch(1, { swap: -110100 })]);
      assert.equal(await delta(), -110000);
      assert.equal((await query('SELECT COUNT(*) FROM closed_trade_edits')).rows[0].count, '1');
    });
    await t.test('concurrent edits to different rows are both accounted', async () => {
      await reset();
      await query(`INSERT INTO trades (ticket, deal_type, profit, swap, commission, close_time)
        VALUES (124, 'sell', 1000, -100, 0, now())`);
      await Promise.all([patch(1, { swap: -110100 }), patch(2, { swap: -110100 })]);
      assert.equal(await delta(), -220000);
    });
    await t.test('ledger failure rolls back the trade change', async () => {
      await reset();
      await query(`ALTER TABLE closed_trade_edits ADD CONSTRAINT reject_edit CHECK (actor <> 'test-admin')`);
      await assert.rejects(patch(1, { swap: -110100 }), /reject_edit/);
      assert.equal(Number((await query('SELECT swap FROM trades WHERE id=1')).rows[0].swap), -100);
      assert.equal(await delta(), 0);
      await query('ALTER TABLE closed_trade_edits DROP CONSTRAINT reject_edit');
    });
    await t.test('manual negative-ticket trades are not counted twice', async () => {
      await reset();
      await query('UPDATE trades SET ticket=-123 WHERE id=1');
      await patch(1, { swap: -110100 });
      assert.equal(await delta(), 0);
    });
    await t.test('comment-only edits and missing trades have no financial effect', async () => {
      await reset();
      await patch(1, { comment: 'changed' });
      assert.equal(await delta(), 0);
      assert.equal(await patch(999, { swap: -110100 }), null);
    });
    await t.test('committed delta is visible through a fresh database connection', async () => {
      await reset();
      await patch(1, { swap: -110100 });
      const fresh = new pg.Client({ connectionString: url, options: `-c search_path=${schema}` });
      await fresh.connect();
      try {
        assert.equal(await readClosedTradeEditDelta((...args) => fresh.query(...args)), -110000);
      } finally { await fresh.end(); }
    });
    await t.test('real transaction helper and account snapshots apply delta without changing floating profit', async () => {
      await reset();
      const connection = new URL(url);
      connection.searchParams.set('options', `-c search_path=${schema}`);
      const code = `
        import assert from 'node:assert/strict';
        const { initDb, query, withTransaction } = await import(${JSON.stringify(new URL('../db.js', import.meta.url).href)});
        const { editTrade } = await import(${JSON.stringify(new URL('../services/closed-trade-edits.js', import.meta.url).href)});
        const { getBridge } = await import(${JSON.stringify(new URL('../services/mt5-bridge/index.js', import.meta.url).href)});
        const { buildAccountView } = await import(${JSON.stringify(new URL('../services/account-view.js', import.meta.url).href)});
        initDb();
        await query('SELECT 1');
        const bridge = getBridge();
        bridge.impl = { getAccount: async () => ({ balance: 1000000, equity: 900000, free_margin: 800000, margin: 100000, profit: -100000 }) };
        const before = await bridge.account();
        await withTransaction(client => editTrade(client, 1, {swap: -110100}, 'test-admin'));
        const after = await bridge.account();
        assert.equal(after.balance, before.balance - 110000);
        assert.equal(after.equity, before.equity - 110000);
        assert.equal(after.freeMargin, before.freeMargin - 110000);
        assert.equal(after.margin, before.margin);
        assert.equal(after.floatingProfit, before.floatingProfit);
        assert.equal(after.equity - after.balance, before.equity - before.balance);
        assert.equal((await buildAccountView(bridge)).balance, after.balance);
        await withTransaction(client => editTrade(client, 1, {swap: -110100}, 'test-admin'));
        assert.equal((await bridge.account()).balance, after.balance);
        process.exit(0);
      `;
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
        encoding: 'utf8', timeout: 15000,
        env: { ...process.env, DATABASE_URL: connection.href, MT5_BRIDGE: 'mock' },
      });
      assert.equal(result.status, 0, result.stdout + result.stderr);
    });
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
