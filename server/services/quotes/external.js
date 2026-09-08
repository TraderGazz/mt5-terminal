// External quote provider — Yahoo Finance public chart API (no API key).
// This is a working scaffold: it fetches real quotes over HTTP using the
// built-in fetch (Node 20). If the request fails it throws and the caller
// keeps serving the previous cache.

// Terminal symbol -> Yahoo Finance ticker
const SYMBOL_MAP = {
  EURUSD: 'EURUSD=X',
  USDRUB: 'USDRUB=X',
  GBPUSD: 'GBPUSD=X',
  USDJPY: 'USDJPY=X',
  XAUUSD: 'GC=F',
  XAGUSD: 'SI=F',
};

export class ExternalQuoteProvider {
  async getQuotes() {
    const entries = Object.entries(SYMBOL_MAP);
    const results = await Promise.allSettled(
      entries.map(async ([symbol, ticker]) => {
        const url =
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
          '?interval=1m&range=1d';
        const resp = await fetch(url, {
          headers: { 'User-Agent': 'mt5-terminal/1.0' },
          signal: AbortSignal.timeout(8000),
        });
        if (!resp.ok) throw new Error(`Yahoo ${ticker}: HTTP ${resp.status}`);
        const data = await resp.json();
        const meta = data?.chart?.result?.[0]?.meta;
        if (!meta || meta.regularMarketPrice == null) {
          throw new Error(`Yahoo ${ticker}: no price data`);
        }
        const price = meta.regularMarketPrice;
        const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
        const spread = price * 0.00015;
        return {
          symbol,
          bid: Number(price.toFixed(5)),
          ask: Number((price + spread).toFixed(5)),
          changePct: Number((((price - prevClose) / prevClose) * 100).toFixed(2)),
          time: new Date().toISOString(),
        };
      })
    );
    // Keep successes, log failures, so one bad symbol does not kill the feed.
    const quotes = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') quotes.push(r.value);
      else console.error(`[quotes/external] ${entries[i][0]}:`, r.reason?.message);
    });
    return quotes;
  }
}
