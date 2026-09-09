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

export const getQuote = () =>
  api<{ quotes: ApiQuote[] }>('/quotes', { auth: false }).then((r) => r.quotes[0]);

export const getCandles = (timeframe: string, count = 300) =>
  api<{ bars: ApiCandle[] }>('/candles', { query: { timeframe, count } }).then((r) => r.bars);

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

export const patchTrade = (id: number, body: Record<string, unknown>) =>
  api<{ trade: unknown }>(`/trades/${id}`, { method: 'PATCH', body });
