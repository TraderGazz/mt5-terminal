/** Static symbol metadata (design.md §8 mock snapshot). */

export interface SymbolMeta {
  symbol: string;
  description: string;
  /** Decimal digits of the price. */
  digits: number;
  /** Typical spread in points (1 point = 10^-digits). */
  spreadPoints: number;
  baseBid: number;
  baseAsk: number;
  /** Day change % of the snapshot. */
  baseChangePct: number;
  contractSize: number;
  /** Trading session string shown in symbol details. */
  session: string;
}

/** The 6 default Market Watch rows (broker «rfd» suffixes, MT5 iOS ref). */
export const SYMBOLS: SymbolMeta[] = [
  {
    symbol: 'EURUSDrfd',
    description: 'Euro vs US Dollar',
    digits: 5,
    spreadPoints: 21,
    baseBid: 1.15811,
    baseAsk: 1.15832,
    baseChangePct: -0.6,
    contractSize: 100000,
    session: '00:05–23:55',
  },
  {
    symbol: 'USDRUBrfd',
    description: 'US Dollar vs Russian Ruble',
    digits: 4,
    spreadPoints: 1500,
    baseBid: 86.789,
    baseAsk: 86.939,
    baseChangePct: 0.94,
    contractSize: 100000,
    session: '10:00–23:50',
  },
  {
    symbol: '#LCO',
    description: 'Brent Crude Oil',
    digits: 2,
    spreadPoints: 10,
    baseBid: 87.92,
    baseAsk: 88.02,
    baseChangePct: -0.36,
    contractSize: 1000,
    session: '03:00–23:59',
  },
  {
    symbol: 'XAUUSDrfd',
    description: 'Gold vs US Dollar',
    digits: 2,
    spreadPoints: 47,
    baseBid: 4453.88,
    baseAsk: 4454.35,
    baseChangePct: -3.19,
    contractSize: 100,
    session: '01:05–23:55',
  },
  {
    symbol: 'GBPUSDrfd',
    description: 'Great Britain Pound vs US Dollar',
    digits: 5,
    spreadPoints: 14,
    baseBid: 1.27314,
    baseAsk: 1.27328,
    baseChangePct: 0.05,
    contractSize: 100000,
    session: '00:05–23:55',
  },
  {
    symbol: 'USDJPYrfd',
    description: 'US Dollar vs Japanese Yen',
    digits: 3,
    spreadPoints: 17,
    baseBid: 155.624,
    baseAsk: 155.641,
    baseChangePct: -0.18,
    contractSize: 100000,
    session: '00:05–23:55',
  },
];

/** Symbols offered by «Добавить символ» in edit mode. */
export const EXTRA_SYMBOLS: SymbolMeta[] = [
  {
    symbol: 'BTCUSD',
    description: 'Bitcoin vs US Dollar',
    digits: 2,
    spreadPoints: 2500,
    baseBid: 67452.3,
    baseAsk: 67477.3,
    baseChangePct: 1.84,
    contractSize: 1,
    session: '00:05–23:55',
  },
  {
    symbol: 'ETHUSD',
    description: 'Ethereum vs US Dollar',
    digits: 2,
    spreadPoints: 210,
    baseBid: 3518.4,
    baseAsk: 3520.5,
    baseChangePct: 2.12,
    contractSize: 1,
    session: '00:05–23:55',
  },
  {
    symbol: 'EURRUB',
    description: 'Euro vs Russian Ruble',
    digits: 4,
    spreadPoints: 620,
    baseBid: 99.421,
    baseAsk: 99.483,
    baseChangePct: -0.22,
    contractSize: 100000,
    session: '10:00–23:50',
  },
  {
    symbol: 'USDCHF',
    description: 'US Dollar vs Swiss Franc',
    digits: 5,
    spreadPoints: 16,
    baseBid: 0.89123,
    baseAsk: 0.89139,
    baseChangePct: -0.09,
    contractSize: 100000,
    session: '00:05–23:55',
  },
  /* Legacy non-«rfd» aliases kept resolvable for other pages' mocks
     (Chart fallback, History/Trade sample data still reference them). */
  {
    symbol: 'EURUSD',
    description: 'Euro vs US Dollar',
    digits: 5,
    spreadPoints: 12,
    baseBid: 1.08427,
    baseAsk: 1.08439,
    baseChangePct: 0.12,
    contractSize: 100000,
    session: '00:05–23:55',
  },
  {
    symbol: 'USDRUB',
    description: 'US Dollar vs Russian Ruble',
    digits: 4,
    spreadPoints: 580,
    baseBid: 92.354,
    baseAsk: 92.412,
    baseChangePct: -0.34,
    contractSize: 100000,
    session: '10:00–23:50',
  },
  {
    symbol: 'XAUUSD',
    description: 'Gold vs US Dollar',
    digits: 2,
    spreadPoints: 35,
    baseBid: 2384.52,
    baseAsk: 2384.87,
    baseChangePct: 0.58,
    contractSize: 100,
    session: '01:05–23:55',
  },
  {
    symbol: 'XAGUSD',
    description: 'Silver vs US Dollar',
    digits: 3,
    spreadPoints: 25,
    baseBid: 28.447,
    baseAsk: 28.472,
    baseChangePct: -0.21,
    contractSize: 5000,
    session: '01:05–23:55',
  },
  {
    symbol: 'GBPUSD',
    description: 'Great Britain Pound vs US Dollar',
    digits: 5,
    spreadPoints: 14,
    baseBid: 1.27314,
    baseAsk: 1.27328,
    baseChangePct: 0.05,
    contractSize: 100000,
    session: '00:05–23:55',
  },
  {
    symbol: 'USDJPY',
    description: 'US Dollar vs Japanese Yen',
    digits: 3,
    spreadPoints: 17,
    baseBid: 155.624,
    baseAsk: 155.641,
    baseChangePct: -0.18,
    contractSize: 100000,
    session: '00:05–23:55',
  },
];

export const ALL_SYMBOLS: SymbolMeta[] = [...SYMBOLS, ...EXTRA_SYMBOLS];

const bySymbol = new Map(ALL_SYMBOLS.map((s) => [s.symbol, s]));

export function getSymbolMeta(symbol: string): SymbolMeta | undefined {
  return bySymbol.get(symbol);
}

/** Absolute spread in price units. */
export function spreadAbs(meta: SymbolMeta): number {
  return meta.spreadPoints * Math.pow(10, -meta.digits);
}
