import { Router } from 'express';
import { query, requireDb } from '../db.js';

const router = Router();

// Shared-secret auth for site-to-site exchange (TZ 5.4).
function syncAuth(req, res, next) {
  const expected = process.env.SYNC_API_KEY;
  if (!expected) {
    return res.status(503).json({ error: 'SYNC_API_KEY is not configured' });
  }
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token !== expected) {
    return res.status(401).json({ error: 'Invalid sync key' });
  }
  next();
}

router.use(syncAuth, requireDb);

// POST /api/sync/balance — receive balance from a peer site.
router.post('/balance', async (req, res) => {
  const {
    account_number = '50214896',
    balance, equity, margin, free_margin, margin_level,
  } = req.body || {};
  if (balance === undefined) {
    return res.status(400).json({ error: 'balance is required' });
  }
  try {
    const { rows } = await query(
      `INSERT INTO accounts (account_number, balance, equity, margin, free_margin, margin_level)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (account_number) DO UPDATE SET
         balance = EXCLUDED.balance,
         equity = EXCLUDED.equity,
         margin = EXCLUDED.margin,
         free_margin = EXCLUDED.free_margin,
         margin_level = EXCLUDED.margin_level,
         updated_at = now()
       RETURNING *`,
      [account_number, balance, equity ?? balance, margin ?? 0, free_margin ?? 0, margin_level ?? 0]
    );
    await query(
      "INSERT INTO sync_log (direction, peer, status, detail) VALUES ('in:balance', $1, 'ok', $2)",
      [req.ip, `balance=${balance}`]
    );
    res.json({ ok: true, account: rows[0] });
  } catch (err) {
    console.error('[sync] balance error:', err.message);
    res.status(500).json({ error: 'Failed to save balance' });
  }
});

// GET /api/sync/balance — let a peer read our balance.
router.get('/balance', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM accounts ORDER BY id LIMIT 1');
    if (!rows[0]) return res.status(404).json({ error: 'No account data' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[sync] balance read error:', err.message);
    res.status(500).json({ error: 'Failed to load balance' });
  }
});

// GET /api/sync/trades — export closed trades to a peer site.
// Optional ?since=ISO to get only newer trades.
router.get('/trades', async (req, res) => {
  const params = [];
  let where = '';
  if (req.query.since) {
    params.push(new Date(req.query.since));
    where = 'WHERE close_time >= $1';
  }
  try {
    const { rows } = await query(
      `SELECT * FROM trades ${where} ORDER BY close_time DESC NULLS LAST LIMIT 1000`,
      params
    );
    res.json({ trades: rows });
  } catch (err) {
    console.error('[sync] trades error:', err.message);
    res.status(500).json({ error: 'Failed to load trades' });
  }
});

// POST /api/sync/positions — receive positions/trades from a peer site.
// Body: { trades: [...] } — upserted by ticket, edited rows are untouched.
router.post('/positions', async (req, res) => {
  const trades = Array.isArray(req.body?.trades) ? req.body.trades : [];
  let saved = 0;
  try {
    for (const t of trades) {
      if (t.ticket == null) continue;
      const { rowCount } = await query(
        `INSERT INTO trades
           (ticket, symbol, type, volume, open_price, close_price, profit, swap,
            commission, open_time, close_time, comment, position_id, order_ticket)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (ticket) DO UPDATE SET
           close_price = EXCLUDED.close_price,
           close_time = EXCLUDED.close_time,
           profit = EXCLUDED.profit,
           swap = EXCLUDED.swap,
           commission = EXCLUDED.commission
         WHERE trades.is_edited = FALSE`,
        [
          t.ticket, t.symbol, t.type, t.volume, t.open_price, t.close_price,
          t.profit, t.swap, t.commission, t.open_time, t.close_time,
          t.comment, t.position_id, t.order_ticket,
        ]
      );
      saved += rowCount;
    }
    await query(
      "INSERT INTO sync_log (direction, peer, status, detail) VALUES ('in:positions', $1, 'ok', $2)",
      [req.ip, `${saved}/${trades.length} positions`]
    );
    res.json({ ok: true, saved, received: trades.length });
  } catch (err) {
    console.error('[sync] positions error:', err.message);
    res.status(500).json({ error: 'Failed to save positions' });
  }
});

export default router;
