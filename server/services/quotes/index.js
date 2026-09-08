// QuoteProvider abstraction.
// Modes (env QUOTE_PROVIDER):
//   mock     — local random-walk generator (development, no network)
//   external — Yahoo Finance public HTTP API (no API key required)
//   mt5      — via server/services/mt5-api.js (mock until MT5 credentials exist)
//
// Refresh interval: env QUOTE_REFRESH_SEC (seconds, default 10, configurable).
import { MockQuoteProvider } from './mock.js';
import { ExternalQuoteProvider } from './external.js';
import { Mt5QuoteProvider } from './mt5.js';

const REFRESH_SEC = Math.max(1, Number(process.env.QUOTE_REFRESH_SEC) || 10);

function createProvider() {
  const mode = (process.env.QUOTE_PROVIDER || 'mock').toLowerCase();
  switch (mode) {
    case 'external':
      console.log('[quotes] provider = external (Yahoo Finance)');
      return new ExternalQuoteProvider();
    case 'mt5':
      console.log('[quotes] provider = mt5');
      return new Mt5QuoteProvider();
    case 'mock':
    default:
      console.log('[quotes] provider = mock');
      return new MockQuoteProvider();
  }
}

const provider = createProvider();

let cache = { quotes: [], updatedAt: null };
let refreshing = null;

async function refresh() {
  try {
    const quotes = await provider.getQuotes();
    if (Array.isArray(quotes) && quotes.length) {
      cache = { quotes, updatedAt: new Date().toISOString() };
    }
  } catch (err) {
    console.error('[quotes] refresh failed:', err.message);
  } finally {
    refreshing = null;
  }
}

// Initial fill, then periodic refresh. Never throws.
refresh();
setInterval(() => {
  if (!refreshing) refreshing = refresh();
}, REFRESH_SEC * 1000).unref();

export function getCachedQuotes() {
  return {
    quotes: cache.quotes,
    updatedAt: cache.updatedAt,
    refreshSec: REFRESH_SEC,
    provider: (process.env.QUOTE_PROVIDER || 'mock').toLowerCase(),
  };
}

export { provider };
