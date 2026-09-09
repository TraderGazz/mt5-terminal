// Обработка истории под ТЗ v2: вкладки Позиции/Ордера/Сделки, сортировка,
// блок итогов Депозит / Снятие / Прибыль / CFD / Своп / Комиссия / Баланс.
//
// Правила видимости строк «Снятие» и «CFD» (ТЗ v2 §3, стр.5; клиент History.tsx):
//   за самый широкий период («Последний год» / «all») — всегда;
//   иначе — только если в периоде есть ненулевые операции этого типа.

const TRADE_TYPES = new Set(['buy', 'sell']);

export const SORT_KEYS = ['default', 'symbol', 'ticket', 'type', 'volume', 'openTime', 'closeTime', 'profit'];

const ms = (v) => (v ? new Date(v).getTime() : 0);

function comparator(key) {
  const byClose = (a, b) => ms(b.closeTime) - ms(a.closeTime);
  switch (key) {
    case 'symbol': return (a, b) => String(a.symbol).localeCompare(b.symbol) || byClose(a, b);
    case 'ticket': return (a, b) => b.ticket - a.ticket;
    case 'type': return (a, b) => String(a.type || a.dealType).localeCompare(String(b.type || b.dealType)) || byClose(a, b);
    case 'volume': return (a, b) => (a.volume - b.volume) || byClose(a, b);
    case 'openTime': return (a, b) => ms(b.openTime) - ms(a.openTime);
    case 'profit': return (a, b) => b.profit - a.profit;
    case 'closeTime':
    case 'default':
    default: return byClose;
  }
}

// Группировка сделок в закрытые позиции (клиент: aggregatePositions).
function aggregatePositions(deals) {
  const groups = new Map();
  for (const d of deals) {
    const key = d.positionId || d.ticket;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }
  const out = [];
  for (const [positionId, group] of groups) {
    group.sort((a, b) => ms(a.openTime) - ms(b.openTime));
    const first = group[0];
    const last = group[group.length - 1];
    out.push({
      ticket: positionId,
      positionId,
      symbol: first.symbol,
      type: first.dealType,
      volume: group.reduce((s, d) => s + d.volume, 0),
      openPrice: first.openPrice,
      closePrice: last.closePrice,
      openTime: first.openTime,
      closeTime: last.closeTime,
      profit: group.reduce((s, d) => s + d.profit, 0),
      swap: group.reduce((s, d) => s + d.swap, 0),
      commission: group.reduce((s, d) => s + d.commission, 0),
    });
  }
  return out;
}

/**
 * @param {object[]} deals — нормализованные строки истории (см. mt5-bridge/normalize.js)
 * @param {object} opts { tab, symbol, from, to, sort, period, canceledOrders }
 */
export function buildHistory(deals, opts = {}) {
  const { tab = 'deals', symbol = null, from = null, to = null, sort = 'default', period = null } = opts;
  const fromMs = from ? new Date(from).getTime() : -Infinity;
  const toMs = to ? new Date(to).getTime() : Infinity;

  const inRange = (d) => {
    const t = ms(d.closeTime) || ms(d.openTime);
    return t >= fromMs && t <= toMs;
  };
  const symOk = (d) => symbol == null || symbol === 'all' || d.symbol === symbol;

  const scoped = deals.filter((d) => inRange(d) && (d.dealType === 'balance' || d.dealType === 'withdrawal' || symOk(d)));

  const tradeDeals = scoped.filter((d) => TRADE_TYPES.has(d.dealType));
  const balanceOps = scoped.filter((d) => d.dealType === 'balance' || d.dealType === 'withdrawal');
  const cfdOps = scoped.filter((d) => d.dealType === 'cfd');

  // ---- итоги ----
  const sum = (arr, pick) => arr.reduce((s, x) => s + (Number(pick(x)) || 0), 0);
  const deposit = sum(balanceOps.filter((d) => d.profit > 0), (d) => d.profit);
  const withdrawal = sum(balanceOps.filter((d) => d.profit < 0), (d) => d.profit);
  const profit = sum(tradeDeals, (d) => d.profit);
  const swap = sum(tradeDeals, (d) => d.swap);
  const commission = sum(tradeDeals, (d) => d.commission);
  const cfd = sum(cfdOps, (d) => d.profit);
  const balance = deposit + withdrawal + profit + swap + commission + cfd;

  const widest = period === 'year' || period === 'all' || from == null;
  const round2 = (n) => Math.round(n * 100) / 100;

  const totals = {
    deposit: round2(deposit),
    withdrawal: round2(withdrawal),
    profit: round2(profit),
    cfd: round2(cfd),
    swap: round2(swap),
    commission: round2(commission),
    balance: round2(balance),
    showWithdrawal: widest || withdrawal !== 0,
    showCfd: widest || cfd !== 0,
  };

  // ---- строки активной вкладки ----
  let rows = [];
  let orderStats = null;
  if (tab === 'positions') {
    rows = aggregatePositions(tradeDeals);
    if (sort !== 'default') rows.sort(comparator(sort));
    else rows.sort(comparator('closeTime'));
  } else if (tab === 'orders') {
    const filled = tradeDeals.map((d) => ({
      ticket: d.orderTicket || d.ticket,
      symbol: d.symbol,
      type: d.dealType,
      volume: d.volume,
      openTime: d.openTime,
      closeTime: d.closeTime,
      price: d.openPrice,
      profit: d.profit,
      state: 'filled',
    }));
    const canceled = (opts.canceledOrders || []).filter(
      (o) => symOk(o) && ms(o.time || o.closeTime) >= fromMs && ms(o.time || o.closeTime) <= toMs,
    );
    rows = [...filled, ...canceled].sort(comparator(sort === 'default' ? 'closeTime' : sort));
    orderStats = {
      total: rows.length,
      filled: filled.length,
      canceled: canceled.length,
    };
  } else {
    rows = [...tradeDeals].sort(comparator(sort));
  }

  return {
    tab,
    rows,
    totals,
    orderStats,
    counts: { deals: tradeDeals.length, positions: new Set(tradeDeals.map((d) => d.positionId || d.ticket)).size, balanceOps: balanceOps.length, cfdOps: cfdOps.length },
  };
}
