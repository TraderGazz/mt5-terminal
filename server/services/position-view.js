import { roundMoney } from './money.js';

export function hasPositionOverride(override) {
  return ['openPriceOverride', 'volumeOverride', 'profitOffset', 'swapOffset']
    .some(key => override[key] != null);
}

export function hasFinancialPositionOverride(override) {
  return ['openPriceOverride', 'profitOffset', 'swapOffset'].some(key => override[key] != null);
}

// Customer clarification: lots are display metadata only. They must not change
// P/L, swap, equity, free margin or the actual broker order.
export function applyPositionOverride(position, override = {}) {
  const openPrice = override.openPriceOverride ?? position.openPrice;
  const volume = override.volumeOverride ?? position.volume;
  if (!hasFinancialPositionOverride(override)) return { ...position, volume };
  let profit = position.profit;
  if (override.openPriceOverride != null) {
    const direction = position.type === 'buy' ? 1 : -1;
    const realMove = direction * (position.currentPrice - position.openPrice);
    const coefficient = realMove !== 0 ? profit / realMove : 0;
    profit = coefficient * direction * (position.currentPrice - openPrice);
  }
  profit += override.profitOffset ?? 0;
  const swap = position.swap + (override.swapOffset ?? 0);
  return { ...position, openPrice, volume, profit: roundMoney(profit), swap: roundMoney(swap) };
}

export function buildPositionOverride(position, existing, patch) {
  const result = { ...existing };
  const number = (field) => {
    const value = Number(patch[field]);
    if (!Number.isFinite(value) || typeof patch[field] === 'boolean' || patch[field] === '') {
      throw new RangeError(`Некорректное значение: ${field}`);
    }
    return value;
  };
  if (patch.openPrice != null) result.openPriceOverride = number('openPrice');
  if (patch.volume != null) {
    const volume = number('volume');
    if (volume <= 0 || volume > 99999999.99 || Math.abs(volume * 100 - Math.round(volume * 100)) > 0.000001) {
      throw new RangeError('Объём должен быть больше нуля, не более 99 999 999,99 лота и содержать не более двух знаков после запятой');
    }
    result.volumeOverride = Math.round(volume * 100) / 100;
  }
  if (patch.profit != null) {
    const base = applyPositionOverride(position, { ...result, profitOffset: null });
    result.profitOffset = roundMoney(number('profit') - base.profit);
  }
  if (patch.swap != null) result.swapOffset = roundMoney(number('swap') - position.swap);
  return result;
}
