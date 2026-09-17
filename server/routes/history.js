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
    case 'week': {
      // Понедельник 00:00 текущей недели, не скользящие 7 суток назад.
      const d = new Date(now);
      const day = d.getDay(); // 0=вс..6=сб
      d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
      d.setHours(0, 0, 0, 0);
      return { from: d.toISOString(), to: null, period };
    }
    // MT5 считает «месяц» фиксированными 29 днями, не календарным — сверено
    // напрямую с оригиналом (см. historyFilter.ts:periodRange).
    case 'month': return { from: new Date(now - 29 * 86400_000).toISOString(), to: null, period };
    case '3m': return { from: new Date(now - 3 * 29 * 86400_000).toISOString(), to: null, period };
    case 'year': return { from: back((d) => d.setFullYear(d.getFullYear() - 1)), to: null, period };
    case 'all': return { from: null, to: null, period: 'all' };
    case '6m':
    default: return { from: new Date(now - 6 * 29 * 86400_000).toISOString(), to: null, period: '6m' };
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
      const { rows } = await query('SELECT * FROM trades ORDER BY close_time DESC NULLS LAST, id DESC');
      if (rows.length) return { deals: rows.map(dbRowToDeal), from: 'db' };
    } catch { /* fall through */ }
  }
  const deals = await getBridge().history({ from: range.from, to: range.to });
  return { deals, from: 'bridge' };
}

// deal_legs — сырые сделки (открытие/закрытие раздельно), см. init.sql:
// нужны, чтобы вкладка «Сделки» на сайте совпадала с оригинальным MT5
// (там это ДВЕ строки на позицию, а не слитая запись из `trades`).
const dbRowToLeg = (r) => ({
  id: Number(r.id),
  ticket: Number(r.ticket),
  positionId: r.position_id ? Number(r.position_id) : null,
  orderTicket: r.order_ticket ? Number(r.order_ticket) : null,
  symbol: r.symbol || '',
  type: r.type || null,
  entry: r.entry || '',
  dealType: r.deal_type || 'buy',
  volume: Number(r.volume) || 0,
  price: Number(r.price) || 0,
  stopLoss: Number(r.stop_loss) || 0,
  takeProfit: Number(r.take_profit) || 0,
  profit: Number(r.profit) || 0,
  swap: Number(r.swap) || 0,
  commission: Number(r.commission) || 0,
  time: r.time ? new Date(r.time).toISOString() : null,
  comment: r.comment || '',
  isEdited: !!r.is_edited,
});

async function loadDealLegs() {
  if (!isDbReady()) return [];
  try {
    const { rows } = await query('SELECT * FROM deal_legs ORDER BY time DESC NULLS LAST, id DESC');
    return rows.map(dbRowToLeg);
  } catch {
    return [];
  }
}

// GET /api/history/raw — все строки за всё время, разбитые по категориям.
// Мобильный фронт фильтрует/агрегирует/считает итоги на клиенте (дизайн заморожен).
router.get('/raw', authRequired, async (req, res) => {
  try {
    const { deals } = await loadDeals({ from: null, to: null });
    const trade = deals.filter((d) => d.dealType === 'buy' || d.dealType === 'sell');
    const balanceOps = deals.filter((d) => d.dealType === 'balance' || d.dealType === 'withdrawal');
    const cfdOps = deals.filter((d) => d.dealType === 'cfd');
    const dealLegs = await loadDealLegs();
    res.json({ deals: trade, balanceOps, cfdOps, dealLegs, source: getBridge().status() });
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
