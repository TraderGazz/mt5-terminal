import { normalizeQuote } from './mt5-bridge/normalize.js';
import { valueTransferredPosition } from './transfer-staging.js';
import { createSourceCompatibleValuation } from './transfer-source-valuation.js';
import { addMoney } from './money.js';

// Read-only transport: callers cannot supply an endpoint or place broker orders.
export function createTransferQuoteCheck({ baseUrl, saved, positions, fetchImpl = fetch, now = Date.now }) {
  const base = new URL(baseUrl);
  if (base.protocol !== 'http:' || base.port !== '8890' || base.username || base.password ||
      base.search || base.hash || !/^\/(v1\/?)?$/.test(base.pathname) ||
      !/^(127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(base.hostname)) {
    throw new Error('Use the private test bridge HTTP address on port 8890');
  }
  base.pathname = '/v1/';
  async function read(path) {
    const response = await fetchImpl(new URL(path, base), { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Test bridge HTTP ${response.status}`);
    return response.json();
  }
  const compatible=createSourceCompatibleValuation(saved,positions);
  let inFlight;
  return function check() {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const account = await read('account');
      if (String(account.login) !== String(saved.target_login) || account.currency !== saved.account_view.currency) {
        throw new Error('Test bridge account/currency does not match transfer target');
      }
      const symbols = new Set(positions.flatMap(p => [p.model.raw.symbol, p.model.valuation.conversionSymbol]).filter(Boolean));
      const quotes = {};
      for (const symbol of symbols) {
        const raw = await read('quote?symbol=' + encodeURIComponent(symbol));
        if (!raw.time || raw.symbol !== symbol) throw new Error('Invalid test bridge quote');
        quotes[symbol] = normalizeQuote(raw);
      }
      const checkedAt = now();
      const quoteStatus = Object.values(quotes).map(q => ({
        symbol:q.symbol, time:q.time, bid:q.bid, ask:q.ask,
        fresh: Number.isFinite(Date.parse(q.time)) && checkedAt-Date.parse(q.time) >= -5000 && checkedAt-Date.parse(q.time) <= 60000,
      }));
      if (quoteStatus.some(q => !q.fresh)) {
        return { status:'stale', targetLogin:String(account.login), quotes:quoteStatus, valuation:null };
      }
      const valued = positions.map(p => valueTransferredPosition(p.model, quotes, { now:checkedAt }));
      return {
        status:'ready', targetLogin:String(account.login), quotes:quoteStatus,
        valuation:compatible?compatible(quotes,{now:checkedAt}):{ positions:valued, profit:addMoney(...valued.map(p=>p.profit)),
          swap:addMoney(...valued.map(p=>p.swap)), commission:addMoney(...valued.map(p=>p.commission)) },
      };
    })().finally(() => { inFlight = null; });
    return inFlight;
  };
}
