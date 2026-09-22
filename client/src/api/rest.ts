import { api } from './http';

// Формы ответов backend (server/routes/*). camelCase, нормализованные.

export interface ApiAccount {
  login: string;
  holder: string;
  company: string;
  server: string;
  accessServer: string;
  currency: string;
  leverage: number;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  floatingProfit: number;
}

export interface ApiPosition {
  id: number;
  symbol: string;
  type: 'buy' | 'sell';
  volume: number;
  openPrice: number;
  currentPrice: number;
  openTime: string | null;
  stopLoss: number;
  takeProfit: number;
  profit: number;
  swap: number;
  commission: number;
}

export interface ApiQuote {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  digits: number;
  time: string;
}

export interface ApiCandle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ApiHistoryRow {
  id?: number;
  ticket: number;
  positionId: number | null;
  orderTicket: number | null;
  symbol: string;
  dealType: 'buy' | 'sell' | 'balance' | 'withdrawal' | 'cfd';
  type?: string;
  volume: number;
  openPrice: number;
  closePrice: number;
  stopLoss: number;
  takeProfit: number;
  profit: number;
  swap: number;
  commission: number;
  openTime: string | null;
  closeTime: string | null;
  comment: string;
  isEdited?: boolean;
  price?: number;
  state?: 'filled' | 'canceled';
}

export interface ApiHistoryTotals {
  deposit: number;
  withdrawal: number;
  profit: number;
  cfd: number;
  swap: number;
  commission: number;
  balance: number;
  showWithdrawal: boolean;
  showCfd: boolean;
}

export interface ApiHistoryResponse {
  tab: 'deals' | 'positions' | 'orders';
  rows: ApiHistoryRow[];
  totals: ApiHistoryTotals;
  orderStats: { total: number; filled: number; canceled: number } | null;
  range: { from: string | null; to: string | null; period: string };
  origin: 'db' | 'bridge';
}

export const getAccount = () => api<{ account: ApiAccount }>('/account').then((r) => r.account);

export const getPositions = () => api<{ positions: ApiPosition[] }>('/positions').then((r) => r.positions);

export const getQuotes = () =>
  api<{ quotes: ApiQuote[] }>('/quotes', { auth: false }).then((r) => r.quotes);

export const getCandles = (symbol: string, timeframe: string, count = 300) =>
  api<{ bars: ApiCandle[] }>('/candles', { query: { symbol, timeframe, count } }).then(
    (r) => r.bars,
  );

export interface HistoryQuery {
  tab?: 'deals' | 'positions' | 'orders';
  symbol?: string | null;
  period?: string;
  from?: string;
  to?: string;
  sort?: string;
}

export const getHistory = (q: HistoryQuery) =>
  api<ApiHistoryResponse>('/history', { query: q as Record<string, string | undefined> });

// Сырая сделка (открытие/закрытие раздельно) — 1-в-1 с оригинальной вкладкой
// «Сделки» MT5, в отличие от ApiHistoryRow (уже слитая open+close позиция).
export interface ApiDealLeg {
  id: number;
  ticket: number;
  positionId: number | null;
  orderTicket: number | null;
  symbol: string;
  type: 'buy' | 'sell' | null;
  entry: 'in' | 'out' | 'inout' | '';
  dealType: 'buy' | 'sell' | 'balance' | 'withdrawal' | 'cfd';
  volume: number;
  price: number;
  stopLoss: number;
  takeProfit: number;
  profit: number;
  swap: number;
  commission: number;
  time: string | null;
  comment: string;
  isEdited?: boolean;
}

export interface ApiHistoryRaw {
  deals: ApiHistoryRow[];
  balanceOps: ApiHistoryRow[];
  cfdOps: ApiHistoryRow[];
  dealLegs: ApiDealLeg[];
}

export const getHistoryRaw = () => api<ApiHistoryRaw>('/history/raw');

export const patchTrade = (id: number, body: Record<string, unknown>) =>
  api<{ trade: unknown }>(`/trades/${id}`, { method: 'PATCH', body });

// ---------- Admin: raw trades/deposits browser (server/routes/trades.js) ----------

export interface ApiTradeRow {
  id: number;
  ticket: number;
  // Позиция может закрываться НЕСКОЛЬКИМИ строками (частичные закрытия) —
  // все они делят один position_id. Сайт агрегирует «Позиции» по этому
  // полю (aggregatePositions), поэтому правка ОДНОЙ строки не обязательно
  // меняет то, что видно на сайте, если у позиции есть соседи с тем же id.
  position_id: number | null;
  symbol: string;
  // Направление buy/sell — ПУСТО для balance/withdrawal/cfd (см. deal_type).
  type: string;
  // Категория строки: buy/sell/balance/withdrawal/cfd — используй это, не
  // type, для отображения/фильтрации типа (type для этих категорий пуст).
  deal_type: string;
  volume: number;
  open_price: number;
  close_price: number;
  profit: number;
  swap: number;
  commission: number;
  open_time: string | null;
  close_time: string | null;
  comment: string;
  is_edited: boolean;
}

export interface ApiTradesTotals {
  profit: number;
  swap: number;
  commission: number;
  deposit: number;
  withdrawal: number;
  cfd: number;
  count: number;
}

export const getTrades = (q: {
  period?: string;
  symbol?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
  position_id?: number;
}) =>
  api<{ trades: ApiTradeRow[]; totals: ApiTradesTotals }>('/trades', {
    query: q as Record<string, string | number | undefined>,
  });

export const deleteTrade = (id: number) => api<{ deleted: true }>(`/trades/${id}`, { method: 'DELETE' });

// Ручное добавление депозита/снятия/CFD-корректировки (заявка заказчика:
// "если снятие, должна быть возможность добавить"). ticket — синтетический,
// отрицательный (реальные тикеты MT5 всегда положительные), чтобы никогда
// не столкнуться с настоящими.
export const createTrade = (body: Record<string, unknown>) =>
  api<{ trade: ApiTradeRow }>('/trades', { method: 'POST', body });

// ---------- Admin: реальная торговля (server/routes/trading.js) ----------
// В отличие от patchTrade/deleteTrade выше (правка ЗАПИСЕЙ в БД — витрина),
// это настоящая заявка брокеру через MT5-мост: реальные деньги, необратимо.

export interface ApiTradeResult {
  order?: number;
  deal?: number;
  ticket?: number;
  volume?: number;
  price?: number;
  bid?: number;
  ask?: number;
}

export const openTrade = (body: { type: 'buy' | 'sell'; volume: number; comment?: string }) =>
  api<ApiTradeResult>('/trading/open', { method: 'POST', body });

export const closeTrade = (body: { ticket: number; volume?: number }) =>
  api<ApiTradeResult>('/trading/close', { method: 'POST', body });

// Косметическая правка ОТКРЫТОЙ позиции (не запись в БД — позиция живая):
// заявка заказчика, цена открытия и/или прибыль/убыток "как будто". Реальная
// позиция у брокера не трогается.
export const updatePositionOverride = (ticket: number, body: { openPrice?: number; profit?: number }) =>
  api<{ ticket: number }>(`/trading/position/${ticket}`, { method: 'PATCH', body });

export const clearPositionOverride = (ticket: number) =>
  api<{ cleared: true }>(`/trading/position/${ticket}`, { method: 'DELETE' });
