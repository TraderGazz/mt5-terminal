import { useSyncExternalStore } from 'react';
import {
  getQuote,
  getQuotesSnapshot,
  subscribeQuotes,
  type Quote,
} from './quotes';

/** Live quotes for every registered symbol. Re-renders on each ~3s demo tick. */
export function useQuotes(): Quote[] {
  return useSyncExternalStore(subscribeQuotes, getQuotesSnapshot);
}

/** Live quote for a single symbol. */
export function useQuote(symbol: string): Quote | undefined {
  return useSyncExternalStore(subscribeQuotes, () => getQuote(symbol));
}
