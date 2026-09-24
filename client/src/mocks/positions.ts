/** Open positions (design.md §8). Read-only in the terminal. */

export interface Position {
  id: number;
  symbol: string;
  type: 'buy' | 'sell';
  volume: number;
  openPrice: number;
  openTime: number;
  currentPrice: number;
  profit: number;
  swap: number;
  commission: number;
  /** 0 = нет уровня. */
  stopLoss: number;
  takeProfit: number;
}

const HOUR = 3600_000;

export const POSITIONS: Position[] = [
  {
    id: 78541230,
    symbol: 'EURUSDrfd',
    type: 'buy',
    volume: 0.5,
    openPrice: 1.16437,
    openTime: Date.now() - 26 * HOUR,
    currentPrice: 1.15834,
    profit: -30150.0,
    swap: -128.4,
    commission: -350.0,
    stopLoss: 1.15200,
    takeProfit: 0,
  },
  {
    id: 78542211,
    symbol: 'XAUUSDrfd',
    type: 'sell',
    volume: 0.1,
    openPrice: 4465.35,
    openTime: Date.now() - 9 * HOUR,
    currentPrice: 4453.71,
    profit: -1164.0,
    swap: 0,
    commission: -70.0,
    stopLoss: 0,
    takeProfit: 4400.00,
  },
  {
    id: 78543087,
    symbol: 'USDRUBrfd',
    type: 'buy',
    volume: 0.3,
    openPrice: 87.2045,
    openTime: Date.now() - 51 * HOUR,
    currentPrice: 86.8580,
    profit: -10395.0,
    swap: -96.15,
    commission: -210.0,
    stopLoss: 0,
    takeProfit: 0,
  },
];
