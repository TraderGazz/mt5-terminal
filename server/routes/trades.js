import { Router } from 'express';
import { query, requireDb } from '../db.js';
import { authRequired, requireRole } from './auth.js';

const router = Router();

router.use(authRequired, requireDb);

// Инвестор (role=viewer) — только просмотр, без права редактировать/удалять
// сделки и депозиты (заявка заказчика: торговый и инвесторский пароль).
const canEdit = requireRole('admin', 'trader');

// GET /api/trades — list with filters.
// Query params:
//   period: today | week | month | 3months | 6months | year | all
//   from, to: ISO dates (custom period, overrides `period`)
//   symbol: exact symbol or 'all'
//   limit, offset: pagination (defaults 200 / 0)
router.get('/', async (req, res) => {
  const { period, from, to, symbol } = req.query;
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const offset = Number(req.query.offset) || 0;

  const where = [];
  const params = [];

  if (symbol && symbol !== 'all') {
    params.push(symbol);
    where.push(`symbol = $${params.length}`);
  }

  if (from || to) {
    if (from) {
      params.push(new Date(from));
      where.push(`close_time >= $${params.length}`);
    }
    if (to) {
      params.push(new Date(to));
      where.push(`close_time <= $${params.length}`);
    }
  } else if (period && period !== 'all') {
    const intervals = {
      today: "date_trunc('day', now())",
      week: "now() - interval '7 days'",
      month: "now() - interval '1 month'",
      '3months': "now() - interval '3 months'",
      '6months': "now() - interval '6 months'",
      year: "now() - interval '1 year'",
    };
    const expr = intervals[period];
    if (expr) where.push(`close_time >= ${expr}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  try {
    const { rows } = await query(
      `SELECT * FROM trades ${whereSql} ORDER BY close_time DESC NULLS LAST, id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    // Не зависит от LIMIT выше — иначе на плотных периодах (много сделок)
    // видимые 1000 строк обрезают период по факту раньше запрошенного `from`,
    // и депозит/снятие, случившиеся до этой отсечки, тихо выпадают из суммы
    // (заявка/баг-репорт заказчика: "в админке снятие 0, хотя на сайте есть").
    // ВАЖНО: категория строки — deal_type, НЕ type (type — направление
    // buy/sell и для balance/withdrawal/cfd в БД всегда пусто, см. init.sql
    // и подтверждено напрямую: `SELECT type, deal_type FROM trades GROUP BY
    // ...` — balance-строки имели type='', deal_type='balance'). Раньше
    // здесь ошибочно фильтровали по type — для этих категорий не находило
    // вообще ничего.
    const totals = await query(
      `SELECT
         COALESCE(SUM(profit) FILTER (WHERE deal_type IN ('buy','sell')), 0) AS profit,
         COALESCE(SUM(swap) FILTER (WHERE deal_type IN ('buy','sell')), 0) AS swap,
         COALESCE(SUM(commission) FILTER (WHERE deal_type IN ('buy','sell')), 0) AS commission,
         COALESCE(SUM(profit) FILTER (WHERE deal_type = 'balance'), 0) AS deposit,
         COALESCE(SUM(-profit) FILTER (WHERE deal_type = 'withdrawal'), 0) AS withdrawal,
         COALESCE(SUM(profit) FILTER (WHERE deal_type = 'cfd'), 0) AS cfd,
         COUNT(*)::int AS count
       FROM trades ${whereSql}`,
      params
    );
    res.json({ trades: rows, totals: totals.rows[0] });
  } catch (err) {
    console.error('[trades] list error:', err.message);
    res.status(500).json({ error: 'Failed to load trades' });
  }
});

// GET /api/trades/:id — single trade detail.
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM trades WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Trade not found' });
    res.json({ trade: rows[0] });
  } catch (err) {
    console.error('[trades] detail error:', err.message);
    res.status(500).json({ error: 'Failed to load trade' });
  }
});

// PATCH /api/trades/:id — edit trade fields, sets is_edited = TRUE.
const EDITABLE_FIELDS = [
  'profit', 'swap', 'commission', 'comment',
  'open_time', 'close_time', 'open_price', 'close_price',
  'symbol', 'type', 'deal_type', 'volume',
];

router.patch('/:id', canEdit, async (req, res) => {
  const updates = [];
  const params = [];
  for (const field of EDITABLE_FIELDS) {
    if (req.body[field] !== undefined) {
      params.push(req.body[field]);
      updates.push(`${field} = $${params.length}`);
    }
  }
  if (!updates.length) {
    return res.status(400).json({ error: 'No editable fields provided' });
  }
  updates.push('is_edited = TRUE');
  params.push(req.params.id);
  try {
    const { rows } = await query(
      `UPDATE trades SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Trade not found' });
    res.json({ trade: rows[0] });
  } catch (err) {
    console.error('[trades] patch error:', err.message);
    res.status(500).json({ error: 'Failed to update trade' });
  }
});

// POST /api/trades — create a trade (used by mt5-sync.py and admin tools).
// Upserts by ticket to stay idempotent.
const CREATABLE_FIELDS = [
  'ticket', 'symbol', 'type', 'deal_type', 'volume', 'open_price', 'close_price',
  'profit', 'swap', 'commission', 'open_time', 'close_time',
  'comment', 'position_id', 'order_ticket',
];

router.post('/', canEdit, async (req, res) => {
  const body = req.body || {};
  if (body.ticket === undefined || body.ticket === null) {
    return res.status(400).json({ error: 'ticket is required' });
  }
  const fields = CREATABLE_FIELDS.filter((f) => body[f] !== undefined);
  const params = fields.map((f) => body[f]);
  const cols = fields.join(', ');
  const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
  // Do not overwrite manually edited rows on re-import.
  const updateSet = fields
    .filter((f) => f !== 'ticket')
    .map((f) => `${f} = EXCLUDED.${f}`)
    .join(', ');
  const conflictClause = updateSet
    ? `ON CONFLICT (ticket) DO UPDATE SET ${updateSet} WHERE trades.is_edited = FALSE`
    : 'ON CONFLICT (ticket) DO NOTHING';
  try {
    const { rows } = await query(
      `INSERT INTO trades (${cols}) VALUES (${placeholders})
       ${conflictClause}
       RETURNING *`,
      params
    );
    if (!rows[0]) {
      const existing = await query('SELECT * FROM trades WHERE ticket = $1', [body.ticket]);
      return res.json({ trade: existing.rows[0], skipped: true });
    }
    res.status(201).json({ trade: rows[0] });
  } catch (err) {
    console.error('[trades] create error:', err.message);
    res.status(500).json({ error: 'Failed to create trade' });
  }
});

// DELETE /api/trades/:id
router.delete('/:id', canEdit, async (req, res) => {
  try {
    const { rowCount } = await query('DELETE FROM trades WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Trade not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error('[trades] delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete trade' });
  }
});

export default router;
