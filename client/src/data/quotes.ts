/**
 * Провайдер котировок. Тот же интерфейс, что у @/mocks/quotes.
 *   mock — демо-тикер (без изменений)
 *   api  — поток из WebSocket-хаба backend
 */
import { IS_API } from '@/config';
import * as mock from '@/mocks/quotes';
import { wsClient } from '@/api/ws';
import { getQuote as fetchQuoteRest, type ApiQuote } from '@/api/rest';

export type { Quote, TickDirection } from '@/mocks/quotes';
import type { Quote } from '@/mocks/quotes';

/* ---------------- api-хранилище ---------------- */

const listeners = new Set<() => void>();
const state = new Map<string, Quote>();
const sessionOpen = new Map<string, number>();
let snapshot: Quote[] = [];
let lastUpdate = 0;
let wsUnsub: (() => void) | null = null;

function apply(q: ApiQuote) {
  if (!q || !q.symbol) return;
  const prev = state.get(q.symbol);
  if (!sessionOpen.has(q.symbol)) sessionOpen.set(q.symbol, q.bid);
  const open = sessionOpen.get(q.symbol) ?? q.bid;
  const dir: Quote['direction'] = !prev
    ? 'flat'
    : q.bid > prev.bid
      ? 'up'
      : q.bid < prev.bid
        ? 'down'
        : 'flat';
  state.set(q.symbol, {
    symbol: q.symbol,
    bid: q.bid,
    ask: q.ask,
    changePct: open ? (q.bid / open - 1) * 100 : 0,
    direction: dir,
    tick: (prev?.tick ?? 0) + 1,
    updatedAt: q.time ? new Date(q.time).getTime() : Date.now(),
  });
  snapshot = Array.from(state.values());
  lastUpdate = Date.now();
  listeners.forEach((l) => l());
}

function apiSubscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!wsUnsub) {
    wsUnsub = wsClient.on('quote', (d) => apply(d as ApiQuote));
    // первичное значение, пока не пришёл первый WS-кадр
    fetchQuoteRest().then(apply).catch(() => {});
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && wsUnsub) {
      wsUnsub();
      wsUnsub = null;
    }
  };
}

const apiRefresh = (): Promise<number> =>
  fetchQuoteRest()
    .then((q) => {
      apply(q);
      return lastUpdate;
    })
    .catch(() => lastUpdate);

/* ---------------- экспорт (переключение источника) ---------------- */

export const subscribeQuotes = IS_API ? apiSubscribe : mock.subscribeQuotes;
export const getQuotesSnapshot = IS_API ? () => snapshot : mock.getQuotesSnapshot;
export const getQuote = IS_API
  ? (symbol: string): Quote | undefined => state.get(symbol)
  : mock.getQuote;
export const getLastUpdate = IS_API ? () => lastUpdate : mock.getLastUpdate;
export const refreshQuotes = IS_API ? apiRefresh : mock.refreshQuotes;
export const ensureSymbols = IS_API ? (_codes: string[]): void => {} : mock.ensureSymbols;
