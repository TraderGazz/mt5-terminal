/**
 * Trade history (design.md §8) — 18 closed deals + 3 balance operations
 * over the last 30 days. Fields match the TZ `trades` SQL table.
 */

export type DealType = 'buy' | 'sell' | 'balance' | 'cfd';

export interface Deal {
  ticket: number;
  order: number;
  positionId: number;
  symbol: string;
  type: DealType;
  volume: number;
  openTime: number;
  openPrice: number;
  closeTime: number;
  closePrice: number;
  stopLoss: number;
  takeProfit: number;
  profit: number;
  swap: number;
  commission: number;
  comment: string;
  isEdited: boolean;
}

const DAY = 86400_000;
const NOW = Date.now();

/** daysAgo + hourOfDay → timestamp */
function t(daysAgo: number, hour: number, minute = 0): number {
  const d = new Date(NOW - daysAgo * DAY);
  d.setHours(hour, minute, Math.floor(Math.random() * 0), 0);
  return d.getTime();
}

function deal(partial: Omit<Deal, 'stopLoss' | 'takeProfit' | 'swap' | 'commission' | 'comment' | 'isEdited'> &
  Partial<Deal>): Deal {
  return {
    stopLoss: 0,
    takeProfit: 0,
    swap: 0,
    commission: 0,
    comment: '',
    isEdited: false,
    ...partial,
  };
}

export const DEALS: Deal[] = [
  deal({
    ticket: 90214401, order: 90214402, positionId: 90214400,
    symbol: 'EURUSDrfd', type: 'buy', volume: 0.30,
    openTime: t(1, 9, 15), openPrice: 1.07982, closeTime: t(1, 15, 40), closePrice: 1.08396,
    takeProfit: 1.08400, profit: 11420.50, commission: -210, comment: 'tp',
  }),
  deal({
    ticket: 90213877, order: 90213878, positionId: 90213876,
    symbol: 'XAUUSDrfd', type: 'sell', volume: 0.10,
    openTime: t(2, 11, 5), openPrice: 2398.40, closeTime: t(2, 18, 22), closePrice: 2391.20,
    profit: 6430.00, commission: -70,
  }),
  deal({
    ticket: 90212954, order: 90212955, positionId: 90212953,
    symbol: 'USDRUBrfd', type: 'buy', volume: 0.20,
    openTime: t(3, 10, 30), openPrice: 93.4500, closeTime: t(3, 16, 12), closePrice: 93.1240,
    stopLoss: 93.1200, profit: -5875.00, commission: -140, comment: 'sl', isEdited: true,
  }),
  deal({
    ticket: 90211890, order: 90211891, positionId: 90211889,
    symbol: 'GBPUSDrfd', type: 'buy', volume: 0.25,
    openTime: t(4, 8, 50), openPrice: 1.26840, closeTime: t(4, 14, 5), closePrice: 1.27288,
    profit: 10230.75, commission: -175,
  }),
  deal({
    ticket: 90210766, order: 90210767, positionId: 90210765,
    symbol: 'EURUSDrfd', type: 'sell', volume: 0.40,
    openTime: t(5, 12, 20), openPrice: 1.08654, closeTime: t(6, 9, 45), closePrice: 1.08211,
    profit: 16210.00, swap: -42.30, commission: -280, isEdited: true,
  }),
  deal({
    ticket: 90209312, order: 90209313, positionId: 90209311,
    symbol: 'XAUUSDrfd', type: 'buy', volume: 0.05,
    openTime: t(7, 10, 10), openPrice: 2376.80, closeTime: t(7, 19, 30), closePrice: 2388.15,
    takeProfit: 2388.00, profit: 5102.40, commission: -35, comment: 'tp',
  }),
  deal({
    ticket: 90208455, order: 90208456, positionId: 90208454,
    symbol: 'USDRUBrfd', type: 'sell', volume: 0.30,
    openTime: t(8, 11, 40), openPrice: 92.8800, closeTime: t(9, 10, 25), closePrice: 93.3100,
    stopLoss: 93.3000, profit: -11610.00, swap: -96.15, commission: -210, comment: 'sl',
  }),
  deal({
    ticket: 90207201, order: 90207202, positionId: 90207200,
    symbol: 'EURUSDrfd', type: 'buy', volume: 0.20,
    openTime: t(10, 9, 5), openPrice: 1.07712, closeTime: t(10, 13, 55), closePrice: 1.07988,
    profit: 5060.20, commission: -140,
  }),
  deal({
    ticket: 90206344, order: 90206345, positionId: 90206343,
    symbol: 'GBPUSDrfd', type: 'sell', volume: 0.15,
    openTime: t(11, 14, 30), openPrice: 1.27410, closeTime: t(12, 10, 15), closePrice: 1.27662,
    stopLoss: 1.27650, profit: -3452.80, swap: -11.20, commission: -105, isEdited: true,
  }),
  deal({
    ticket: 90205187, order: 90205188, positionId: 90205186,
    symbol: 'XAUUSDrfd', type: 'buy', volume: 0.10,
    openTime: t(13, 9, 25), openPrice: 2358.30, closeTime: t(14, 16, 40), closePrice: 2379.90,
    profit: 19340.00, swap: -58.75, commission: -70,
  }),
  deal({
    ticket: 90204330, order: 90204331, positionId: 90204329,
    symbol: 'EURUSDrfd', type: 'sell', volume: 0.50,
    openTime: t(15, 12, 0), openPrice: 1.08320, closeTime: t(15, 17, 35), closePrice: 1.08144,
    profit: 8050.00, commission: -350,
  }),
  deal({
    ticket: 90203412, order: 90203413, positionId: 90203411,
    symbol: 'USDRUBrfd', type: 'buy', volume: 0.40,
    openTime: t(16, 10, 45), openPrice: 92.6100, closeTime: t(17, 12, 20), closePrice: 92.9840,
    profit: 13465.00, swap: -128.20, commission: -280,
  }),
  deal({
    ticket: 90202566, order: 90202567, positionId: 90202565,
    symbol: 'GBPUSDrfd', type: 'buy', volume: 0.30,
    openTime: t(18, 8, 35), openPrice: 1.26554, closeTime: t(18, 15, 50), closePrice: 1.26901,
    takeProfit: 1.26900, profit: 9512.30, commission: -210, comment: 'tp',
  }),
  deal({
    ticket: 90201720, order: 90201721, positionId: 90201719,
    symbol: 'XAUUSDrfd', type: 'sell', volume: 0.08,
    openTime: t(20, 13, 15), openPrice: 2402.60, closeTime: t(21, 9, 30), closePrice: 2409.15,
    stopLoss: 2409.00, profit: -4681.60, swap: -31.40, commission: -56, comment: 'sl',
  }),
  deal({
    ticket: 90200983, order: 90200984, positionId: 90200982,
    symbol: 'EURUSDrfd', type: 'buy', volume: 0.35,
    openTime: t(22, 10, 5), openPrice: 1.07248, closeTime: t(23, 14, 45), closePrice: 1.07712,
    profit: 14885.90, swap: -37.10, commission: -245,
  }),
  deal({
    ticket: 90199871, order: 90199872, positionId: 90199870,
    symbol: 'USDRUBrfd', type: 'sell', volume: 0.25,
    openTime: t(24, 11, 50), openPrice: 93.7500, closeTime: t(24, 17, 10), closePrice: 93.4200,
    profit: 7425.00, commission: -175,
  }),
  deal({
    ticket: 90199044, order: 90199045, positionId: 90199043,
    symbol: 'GBPUSDrfd', type: 'sell', volume: 0.20,
    openTime: t(26, 9, 40), openPrice: 1.27188, closeTime: t(27, 12, 5), closePrice: 1.26802,
    profit: 7054.40, swap: -14.90, commission: -140, isEdited: true,
  }),
  deal({
    ticket: 90198117, order: 90198118, positionId: 90198116,
    symbol: 'XAUUSDrfd', type: 'buy', volume: 0.06,
    openTime: t(28, 10, 20), openPrice: 2341.50, closeTime: t(29, 15, 25), closePrice: 2355.80,
    profit: 7688.10, swap: -35.25, commission: -42,
  }),
];

/** Balance operations (2 deposits, 1 withdrawal). */
export const BALANCE_OPS: Deal[] = [
  deal({
    ticket: 90150001, order: 0, positionId: 0,
    symbol: '', type: 'balance', volume: 0,
    openTime: t(29, 9, 0), openPrice: 0, closeTime: t(29, 9, 0), closePrice: 0,
    profit: 500000.0, comment: 'Пополнение счёта',
  }),
  deal({
    ticket: 90150002, order: 0, positionId: 0,
    symbol: '', type: 'balance', volume: 0,
    openTime: t(19, 12, 0), openPrice: 0, closeTime: t(19, 12, 0), closePrice: 0,
    profit: -100000.0, comment: 'Вывод средств',
  }),
  deal({
    ticket: 90150003, order: 0, positionId: 0,
    symbol: '', type: 'balance', volume: 0,
    openTime: t(6, 10, 0), openPrice: 0, closeTime: t(6, 10, 0), closePrice: 0,
    profit: 250000.0, comment: 'Пополнение счёта',
  }),
  deal({
    ticket: 90150004, order: 0, positionId: 0,
    symbol: '', type: 'balance', volume: 0,
    openTime: t(12, 15, 0), openPrice: 0, closeTime: t(12, 15, 0), closePrice: 0,
    profit: -150000.0, comment: 'Вывод средств',
  }),
];

/**
 * CFD adjustments (dividend-like accruals). Kept OUT of HISTORY/DEALS so the
 * deals list and the edit store stay untouched — the History page reads this
 * array directly for the «CFD» totals row.
 */
export const CFD_OPS: Deal[] = [
  deal({
    ticket: 90160001, order: 0, positionId: 0,
    symbol: 'XAUUSDrfd', type: 'cfd', volume: 0,
    openTime: t(9, 12, 0), openPrice: 0, closeTime: t(9, 12, 0), closePrice: 0,
    profit: 1250.0, comment: 'CFD adjustment',
  }),
  deal({
    ticket: 90160002, order: 0, positionId: 0,
    symbol: 'USDRUBrfd', type: 'cfd', volume: 0,
    openTime: t(21, 12, 0), openPrice: 0, closeTime: t(21, 12, 0), closePrice: 0,
    profit: -840.5, comment: 'CFD adjustment',
  }),
];

/** Full history, newest first. */
export const HISTORY: Deal[] = [...DEALS, ...BALANCE_OPS].sort(
  (a, b) => b.closeTime - a.closeTime,
);
