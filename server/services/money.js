// Round each posted amount first, like PostgreSQL NUMERIC(..., 2), then
// calculate deltas in integer kopecks. Never subtract unrounded P/L from a
// trade that has already been rounded by PostgreSQL.
export function cents(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) throw new TypeError('Money must be finite');
  const [, whole, fraction = '', exponent = '0'] = Math.abs(n).toString().match(/^(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
  const digits = BigInt(whole + fraction);
  const scale = fraction.length - Number(exponent) - 2;
  const divisor = scale > 0 ? 10n ** BigInt(scale) : 1n;
  const absolute = scale > 0
    ? digits / divisor + ((digits % divisor) * 2n >= divisor ? 1n : 0n)
    : digits * 10n ** BigInt(-scale);
  const amount = Number(absolute);
  if (!Number.isSafeInteger(amount)) throw new RangeError('Money exceeds safe integer range');
  return n < 0 ? -amount : amount;
}
export const roundMoney = (value) => cents(value) / 100;
export const addMoney = (...values) => values.reduce((sum, value) => sum + cents(value), 0) / 100;
export const tradeDelta = (profit, swap, oldProfit, oldSwap) =>
  (cents(profit) + cents(swap) - cents(oldProfit) - cents(oldSwap)) / 100;
