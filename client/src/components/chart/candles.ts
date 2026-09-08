/**
 * Seeded mock candle generator for the chart page (design: chart.md).
 * Each (symbol, timeframe) pair gets a stable, realistic random walk that
 * always ends at the current bid, so live ticks continue the series naturally.
 */

export const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const TF_SECONDS: Record<Timeframe, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  M30: 1800,
  H1: 3600,
  H4: 14400,
  D1: 86400,
};

export interface MockCandle {
  /** UNIX seconds (UTC), aligned to the timeframe boundary. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundTo(value: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(value * f) / f;
}

/**
 * 120 seeded candles for `symbol` on `tf`: random walk with mild mean
 * reversion toward the bid, volatility scaled by sqrt(timeframe), then the
 * whole series is shifted so the last close equals the current bid exactly.
 */
export function generateCandles(
  symbol: string,
  tf: Timeframe,
  digits: number,
  bid: number,
  count = 120,
): MockCandle[] {
  const tfSec = TF_SECONDS[tf];
  const nowSec = Math.floor(Date.now() / 1000);
  const lastTime = Math.floor(nowSec / tfSec) * tfSec;
  const rng = mulberry32(hashSeed(`${symbol}:${tf}`));
  // ~0.06% per M1 candle, scaled with the timeframe length.
  const sigma = bid * 0.0006 * Math.sqrt(tfSec / 60);

  const out: MockCandle[] = [];
  let price = bid * (1 + (rng() - 0.5) * 0.01);
  for (let i = count - 1; i >= 0; i--) {
    const open = price;
    const drift = (bid - price) * 0.015;
    const close = open + drift + (rng() - 0.5) * 2 * sigma;
    const high = Math.max(open, close) + rng() * sigma * 0.7;
    const low = Math.min(open, close) - rng() * sigma * 0.7;
    out.push({ time: lastTime - i * tfSec, open, high, low, close });
    price = close;
  }

  const offset = bid - out[out.length - 1].close;
  return out.map((c) => ({
    time: c.time,
    open: roundTo(c.open + offset, digits),
    high: roundTo(c.high + offset, digits),
    low: roundTo(c.low + offset, digits),
    close: roundTo(c.close + offset, digits),
  }));
}
