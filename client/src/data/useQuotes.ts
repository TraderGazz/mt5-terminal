import { useSyncExternalStore } from 'react';
import { getQuote, getQuotesSnapshot, subscribeQuotes, type Quote } from './quotes';

/** Live-котировки всех символов. Источник — mock-тикер или WS backend. */
export function useQuotes(): Quote[] {
  return useSyncExternalStore(subscribeQuotes, getQuotesSnapshot);
}

/** Live-котировка одного символа. */
export function useQuote(symbol: string): Quote | undefined {
  return useSyncExternalStore(subscribeQuotes, () => getQuote(symbol));
}
