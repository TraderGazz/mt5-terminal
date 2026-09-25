import { api } from './http';

export interface Account {
  login: string; holder: string; company: string; server: string; currency: string;
  balance: number; equity: number; margin: number; freeMargin: number;
  marginLevel: number; floatingProfit: number;
}
export interface Position {
  id: number; symbol: string; type: 'buy' | 'sell'; volume: number;
  openPrice: number; currentPrice: number; openTime: string | null;
  profit: number; swap: number; commission: number;
  stopLoss: number; takeProfit: number;
}
export interface HistoryRow {
  ticket: number; symbol: string; dealType: string; type?: string; volume: number;
  openPrice: number; closePrice: number; profit: number; swap: number; commission: number;
  openTime: string | null; closeTime: string | null; comment: string; isEdited?: boolean;
  price?: number; state?: string; stopLoss: number; takeProfit: number;
}
export interface HistoryTotals {
  deposit: number; withdrawal: number; profit: number; cfd: number;
  swap: number; commission: number; balance: number;
  showWithdrawal: boolean; showCfd: boolean;
}
export interface HistoryResponse {
  tab: string; rows: HistoryRow[]; totals: HistoryTotals;
  orderStats: { total: number; filled: number; canceled: number } | null;
  range: { from: string | null; to: string | null; period: string };
  origin: string;
}

export const getAccount = () => api<{ account: Account }>('/account').then((r) => r.account);
export const getPositions = () => api<{ positions: Position[] }>('/positions').then((r) => r.positions);
export const getHistory = (q: Record<string, string | undefined>) => api<HistoryResponse>('/history', { query: q });

export interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number }
export const getCandles = (timeframe: string, count = 300) =>
  api<{ symbol: string; timeframe: string; bars: Candle[] }>('/candles', { query: { timeframe, count } });
