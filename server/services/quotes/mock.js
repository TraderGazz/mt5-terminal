// Mock quote provider — random walk around base prices.
const BASE = [
  { symbol: 'EURUSD', bid: 1.08523, digits: 5 },
  { symbol: 'USDRUB', bid: 89.412, digits: 3 },
  { symbol: 'XAUUSD', bid: 2389.15, digits: 2 },
  { symbol: 'XAGUSD', bid: 28.42, digits: 3 },
  { symbol: 'GBPUSD', bid: 1.27118, digits: 5 },
  { symbol: 'USDJPY', bid: 155.832, digits: 3 },
];

const state = new Map(BASE.map((s) => [s.symbol, { ...s, open: s.bid }]));

export class MockQuoteProvider {
  async getQuotes() {
    const now = new Date().toISOString();
    return [...state.values()].map((s) => {
      const step = s.bid * 0.0004;
      const bid = s.bid + (Math.random() - 0.5) * 2 * step;
      const spread = bid * 0.00015;
      const ask = bid + spread;
      const changePct = ((bid - s.open) / s.open) * 100;
      const entry = state.get(s.symbol);
      entry.bid = bid;
      return {
        symbol: s.symbol,
        bid: Number(bid.toFixed(s.digits)),
        ask: Number(ask.toFixed(s.digits)),
        changePct: Number(changePct.toFixed(2)),
        time: now,
      };
    });
  }
}
