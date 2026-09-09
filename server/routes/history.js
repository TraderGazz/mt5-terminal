import { Router } from 'express';
import { authRequired } from './auth.js';
import { getBridge } from '../services/mt5-bridge/index.js';
import { buildHistory, SORT_KEYS } from '../services/history.js';
import { query, isDbReady } from '../db.js';

const router = Router();

// Разрешение периода → [from, to] ISO (зеркало client/.../historyFilter.ts).
function resolveRange({ period, from, to }) {
  if (from || to) return { from: from || null, to: to || null, period: period || 'custom' };
  const now = Date.now();
  const back = (fn) => {
    const d = new Date(now);
    fn(d);
    return d.toISOString();
  };
  switch (period) {
    case 'today': return { from: new Date(new Date().setHours(0, 0, 0, 0)).toISOString(), to: null, period };
    case 'week': return { from: new Date(now - 7 * 86400e3).toISOString(), to: null, period };
    case 'month': return { from: back((d) => d.setMonth(d.getMonth() - 1)), to: null, period };
    case '3m': return { from: back((d) => d.setMonth(d.getMonth() - 3)), to: null, period };
    case 'year': return { from: back((d) => d.setFullYear(d.getFullYear() - 1)), to: null, period };
    case 'all': return { from: null, to: null, period: 'all' };
    case '6m':
    default: return { from: back((d) => d.setMonth(d.getMonth() - 6)), to: null, period: '6m' };
  }
}

const dbRowToDeal = (r) => ({
  id: Number(r.id),
  ticket: Number(r.ticket),
  positionId: r.position_id ? Number(r.position_id) : null,
  orderTicket: r.order_ticket ? Number(r.order_ticket) : null,
  symbol: r.symbol || '',
  dealType: r.deal_type || r.type || 'buy',
  volume: Number(r.volume) || 0,
  openPrice: Number(r.open_price) || 0,
  closePrice: Number(r.close_price) || 0,
  stopLoss: Number(r.stop_loss) || 0,
  takeProfit: Number(r.take_profit) || 0,
  profit: Number(r.profit) || 0,
  swap: Number(r.swap) || 0,
  commission: Number(r.commission) || 0,
  openTime: r.open_time ? new Date(r.open_time).toISOString() : null,
  closeTime: r.close_time ? new Date(r.close_time).toISOString() : null,
  comment: r.comment || '',
  isEdited: !!r.is_edited,
});

async function loadDeals(range) {
  // Источник правды — БД (с правками). Если пусто/недоступна — берём из моста.
  if (isDbReady()) {
    try {
      const { rows } = await query('SELECT * FROM trades ORDER BY close_time DESC NULLS LAST, id DESC LIMIT 5000');
      if (rows.length) return { deals: rows.map(dbRowToDeal), from: 'db' };
    } catch { /* fall through */ }
  }
  const deals = await getBridge().history({ from: range.from, to: range.to });
  return { deals, from: 'bridge' };
}

// GET /api/history/raw — все строки за всё время, разбитые по категориям.
// Мобильный фронт фильтрует/агрегирует/считает итоги на клиенте (дизайн заморожен).
router.get('/raw', authRequired, async (req, res) => {
  try {
    const { deals } = await loadDeals({ from: null, to: null });
    const trade = deals.filter((d) => d.dealType === 'buy' || d.dealType === 'sell');
    const balanceOps = deals.filter((d) => d.dealType === 'balance' || d.dealType === 'withdrawal');
    const cfdOps = deals.filter((d) => d.dealType === 'cfd');
    res.json({ deals: trade, balanceOps, cfdOps, source: getBridge().status() });
  } catch (err) {
    console.error('[history/raw] error:', err.message);
    res.status(502).json({ error: 'Не удалось получить историю', detail: err.message });
  }
});

// GET /api/history?tab=deals|positions|orders&symbol=&from=&to=&period=&sort=
router.get('/', authRequired, async (req, res) => {
  const tab = ['deals', 'positions', 'orders'].includes(req.query.tab) ? req.query.tab : 'deals';
  const sort = SORT_KEYS.includes(req.query.sort) ? req.query.sort : 'default';
  const symbol = req.query.symbol || null;
  const range = resolveRange({ period: req.query.period, from: req.query.from, to: req.query.to });

  try {
    const { deals, from: origin } = await loadDeals(range);
    const result = buildHistory(deals, { tab, symbol, from: range.from, to: range.to, sort, period: range.period });
    res.json({
      ...result,
      range: { from: range.from, to: range.to, period: range.period },
      origin,
      source: getBridge().status(),
    });
  } catch (err) {
    console.error('[history] error:', err.message);
    res.status(502).json({ error: 'Не удалось получить историю', detail: err.message });
  }
});

export default router;
