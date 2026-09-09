// Нормализация ответов SocketBridgeEA → внутренние формы MT5 Terminal.
//
// Реальные имена полей EA будут выверены на Этапе 4 против живого моста.
// Функции написаны толерантно: проверяют несколько возможных ключей и
// не падают на отсутствующих.

const num = (v, d = 0) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : d;
};

const pick = (obj, ...keys) => {
  for (const k of keys) if (obj != null && obj[k] !== undefined && obj[k] !== null) return obj[k];
  return undefined;
};

// MT5 время бывает: unix-секунды, unix-мс, "YYYY.MM.DD HH:MM:SS" (серверное), ISO.
export function toIso(v) {
  if (v == null || v === '' || v === 0) return null;
  if (typeof v === 'number') {
    const ms = v > 1e12 ? v : v * 1000;
    return new Date(ms).toISOString();
  }
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return toIso(Number(s));
  // "2025.08.06 01:32:08" → "2025-08-06T01:32:08Z"
  const m = s.match(/^(\d{4})[.\-/](\d{2})[.\-/](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0))).toISOString();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// buy/sell из числа (0/1), enum-строки ("POSITION_TYPE_BUY", "DEAL_TYPE_SELL", "ORDER_TYPE_BUY_LIMIT") или "buy"/"sell".
export function side(v) {
  if (v === 0 || v === '0') return 'buy';
  if (v === 1 || v === '1') return 'sell';
  const s = String(v ?? '').toUpperCase();
  if (s.includes('SELL')) return 'sell';
  if (s.includes('BUY')) return 'buy';
  return null;
}

// Категория строки истории для итогов v2 (Депозит/Снятие/Прибыль/CFD/Своп/Комиссия/Баланс).
export function dealType(raw, profit) {
  const s = String(pick(raw, 'deal_type', 'type', 'entry') ?? '').toUpperCase();
  if (s.includes('BALANCE') || s.includes('DEPOSIT') || s.includes('WITHDRAW')) {
    return num(profit) < 0 ? 'withdrawal' : 'balance';
  }
  if (s.includes('CFD') || s.includes('DIVIDEND') || s.includes('CHARGE') || s.includes('CORRECTION')) return 'cfd';
  return side(pick(raw, 'side', 'type', 'deal_type')) ?? 'buy';
}

export function normalizeAccount(raw = {}) {
  return {
    login: String(pick(raw, 'login', 'account', 'number') ?? ''),
    name: pick(raw, 'name', 'holder', 'owner') ?? '',
    server: pick(raw, 'server', 'trade_server') ?? '',
    currency: pick(raw, 'currency', 'account_currency') ?? 'RUB',
    leverage: num(pick(raw, 'leverage')),
    balance: num(pick(raw, 'balance')),
    equity: num(pick(raw, 'equity')),
    margin: num(pick(raw, 'margin', 'margin_used')),
    freeMargin: num(pick(raw, 'free_margin', 'margin_free', 'freeMargin')),
    marginLevel: num(pick(raw, 'margin_level', 'marginLevel')),
    floatingProfit: num(pick(raw, 'profit', 'floating_profit', 'unrealized')),
  };
}

export function normalizePosition(raw = {}) {
  const openPrice = num(pick(raw, 'price_open', 'open_price', 'priceOpen'));
  return {
    id: Number(pick(raw, 'ticket', 'id', 'position') ?? 0),
    symbol: pick(raw, 'symbol') ?? '',
    type: side(pick(raw, 'type', 'position_type', 'side')) ?? 'buy',
    volume: num(pick(raw, 'volume', 'volume_current', 'volume_initial', 'lots')),
    openPrice,
    currentPrice: num(pick(raw, 'price_current', 'current_price', 'priceCurrent'), openPrice),
    openTime: toIso(pick(raw, 'time', 'open_time', 'time_setup', 'openTime')),
    stopLoss: num(pick(raw, 'sl', 'stop_loss')),
    takeProfit: num(pick(raw, 'tp', 'take_profit')),
    profit: num(pick(raw, 'profit')),
    swap: num(pick(raw, 'swap')),
    commission: num(pick(raw, 'commission')),
  };
}

// Одна строка истории (позиция/сделка/ордер из /v1/history/orders).
export function normalizeDeal(raw = {}) {
  const profit = num(pick(raw, 'profit'));
  return {
    ticket: Number(pick(raw, 'ticket', 'position', 'order', 'deal') ?? 0),
    positionId: Number(pick(raw, 'position_id', 'position', 'positionId') ?? 0) || null,
    orderTicket: Number(pick(raw, 'order', 'order_ticket', 'orderTicket') ?? 0) || null,
    symbol: pick(raw, 'symbol') ?? '',
    dealType: dealType(raw, profit),
    volume: num(pick(raw, 'volume', 'volume_initial', 'lots')),
    openPrice: num(pick(raw, 'price_open', 'open_price', 'entry_price')),
    closePrice: num(pick(raw, 'price_close', 'close_price', 'price', 'exit_price')),
    stopLoss: num(pick(raw, 'sl', 'stop_loss')),
    takeProfit: num(pick(raw, 'tp', 'take_profit')),
    profit,
    swap: num(pick(raw, 'swap')),
    commission: num(pick(raw, 'commission')),
    openTime: toIso(pick(raw, 'time_open', 'open_time', 'time_setup', 'openTime')),
    closeTime: toIso(pick(raw, 'time_close', 'close_time', 'time_done', 'time', 'closeTime')),
    comment: pick(raw, 'comment') ?? '',
  };
}

// Свеча из /v1/history/prices → { bars: [...] } или { data: [...] }.
export function normalizeCandle(raw = {}) {
  const t = pick(raw, 'time', 'timestamp', 'date');
  const iso = toIso(t);
  return {
    time: iso ? Math.floor(new Date(iso).getTime() / 1000) : 0, // unix-секунды для lightweight-charts
    open: num(pick(raw, 'open', 'o')),
    high: num(pick(raw, 'high', 'h')),
    low: num(pick(raw, 'low', 'l')),
    close: num(pick(raw, 'close', 'c')),
    volume: num(pick(raw, 'volume', 'tick_volume', 'real_volume', 'v')),
  };
}

export function normalizeQuote(raw = {}) {
  return {
    symbol: pick(raw, 'symbol') ?? '',
    bid: num(pick(raw, 'bid')),
    ask: num(pick(raw, 'ask')),
    spread: num(pick(raw, 'spread')),
    digits: num(pick(raw, 'digits'), 5),
    time: toIso(pick(raw, 'time', 'timestamp')) ?? new Date().toISOString(),
  };
}

// Событие открытия/закрытия сделки из WS (type: "trade_event").
export function normalizeTradeEvent(raw = {}) {
  return {
    symbol: pick(raw, 'symbol') ?? '',
    ticket: Number(pick(raw, 'ticket') ?? 0),
    side: side(pick(raw, 'side')),
    reason: pick(raw, 'reason') ?? 'Unknown', // TP | SL | Manual | Unknown
    profit: num(pick(raw, 'profit')),
    grossProfit: num(pick(raw, 'gross_profit')),
    swap: num(pick(raw, 'swap')),
    commission: num(pick(raw, 'commission')),
    at: new Date().toISOString(),
  };
}
