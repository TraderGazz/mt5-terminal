import { Router } from 'express';
import { authRequired } from './auth.js';
import { getBridge } from '../services/mt5-bridge/index.js';
import { buildHistory, SORT_KEYS } from '../services/history.js';
import { ledgerReportRows } from '../services/deposit-ledger.js';
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
  // При фильтре по периоду пустой результат — законный ответ, мост не трогаем.
  if (isDbReady()) {
    try {
      if (range.from) {
        const { rows } = await query(
          'SELECT * FROM trades WHERE COALESCE(close_time, open_time) >= $1 ORDER BY close_time DESC NULLS LAST, id DESC',
          [range.from],
        );
        return { deals: rows.map(dbRowToDeal), from: 'db' };
      }
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

async function loadDealLegs(from = null) {
  if (!isDbReady()) return [];
  try {
    const { rows } = from
      ? await query('SELECT * FROM deal_legs WHERE time >= $1 ORDER BY time DESC NULLS LAST, id DESC', [from])
      : await query('SELECT * FROM deal_legs ORDER BY time DESC NULLS LAST, id DESC');
    return rows.map(dbRowToLeg);
  } catch {
    return [];
  }
}

// GET /api/history/raw[?from=ISO] — строки, разбитые по категориям. ?from
// отдаёт только строки начиная с даты; клиент сам отфильтровывает по своему
// периоду, поэтому на экране результат тот же.
router.get('/raw', authRequired, async (req, res) => {
  const fromDate = req.query.from ? new Date(req.query.from) : null;
  const from = fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate.toISOString() : null;
  try {
    const { deals } = await loadDeals({ from, to: null });
    const trade = deals.filter((d) => d.dealType === 'buy' || d.dealType === 'sell');
    const balanceOps = deals.filter((d) => d.dealType === 'balance' || d.dealType === 'withdrawal');
    const cfdOps = deals.filter((d) => d.dealType === 'cfd');
    const dealLegs = await loadDealLegs(from);
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

// GET /api/history/totals?period=|from=&to= — тот же набор итогов (Депозит/
// Снятие/Прибыль/CFD/Своп/Комиссия/Баланс), что заказчик видит на сайте:
// официальная выписка брокера + ручные записи из админки вместо мусорных
// EA-синхронизированных balance/withdrawal (см. server/routes/admin.js
// toHtml() — тот же фильтр и тот же источник, см. deposit-ledger.js).
router.get('/totals', authRequired, async (req, res) => {
  const range = resolveRange({ period: req.query.period, from: req.query.from, to: req.query.to });
  const where = [`NOT (deal_type IN ('balance', 'withdrawal') AND ticket > 0)`];
  const params = [];
  if (range.from) {
    params.push(range.from);
    where.push(`COALESCE(close_time, open_time) >= $${params.length}`);
  }
  try {
    const { rows } = await query(
      `SELECT deal_type, ticket, profit, swap, commission FROM trades WHERE ${where.join(' AND ')}`,
      params,
    );
    const fromMs = range.from ? new Date(range.from).getTime() : -Infinity;
    const ledgerRows = ledgerReportRows(fromMs, Infinity);

    const sum = (arr, pred, pick) => arr.reduce((s, x) => (pred(x) ? s + (Number(pick(x)) || 0) : s), 0);
    const tradeRows = rows.filter((r) => r.deal_type === 'buy' || r.deal_type === 'sell');
    const cfdRows = rows.filter((r) => r.deal_type === 'cfd');
    const manualBalanceRows = rows.filter((r) => r.deal_type === 'balance' || r.deal_type === 'withdrawal');

    const deposit =
      sum(manualBalanceRows, (r) => Number(r.profit) > 0, (r) => r.profit) +
      sum(ledgerRows, (r) => r.deal_type === 'balance', (r) => r.profit);
    const withdrawal =
      sum(manualBalanceRows, (r) => Number(r.profit) < 0, (r) => r.profit) +
      sum(ledgerRows, (r) => r.deal_type === 'withdrawal', (r) => r.profit);
    const profit = sum(tradeRows, () => true, (r) => r.profit);
    const swap = sum(tradeRows, () => true, (r) => r.swap);
    const commission = sum(tradeRows, () => true, (r) => r.commission);
    const cfd = sum(cfdRows, () => true, (r) => r.profit);
    const balance = deposit + withdrawal + profit + swap + commission + cfd;
    const round2 = (n) => Math.round(n * 100) / 100;

    res.json({
      totals: {
        deposit: round2(deposit),
        withdrawal: round2(withdrawal),
        profit: round2(profit),
        swap: round2(swap),
        commission: round2(commission),
        cfd: round2(cfd),
        balance: round2(balance),
      },
      range: { from: range.from, to: range.to, period: range.period },
    });
  } catch (err) {
    console.error('[history/totals] error:', err.message);
    res.status(502).json({ error: 'Не удалось посчитать итоги', detail: err.message });
  }
});

export default router;
