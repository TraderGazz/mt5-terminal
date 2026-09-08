/**
 * TODO(integration): индикаторы (Ichimoku Kinko Hyo, Fractals) сейчас
 * считаются ЛОКАЛЬНО из моковых свечей generateCandles() — только для
 * визуальной копии MT5 iOS. При подключении реальных данных MT5 индикаторы
 * должны пересчитываться из реальных котировок (или приходить с сервера
 * вместе с барами). Заменить источник данных здесь при интеграции.
 *
 * Расчёт классический (MT5):
 *  - Tenkan-sen  = (maxHigh(9)  + minLow(9))  / 2
 *  - Kijun-sen   = (maxHigh(26) + minLow(26)) / 2
 *  - Senkou Span A = (Tenkan + Kijun) / 2, сдвиг на 26 баров ВПЕРЁД
 *  - Senkou Span B = (maxHigh(52) + minLow(52)) / 2, сдвиг на 26 баров ВПЕРЁД
 *  - Chikou Span = close, сдвиг на 26 баров НАЗАД
 *  - Fractals: ап-фрактал — high бара выше high двух баров слева и двух
 *    справа; даун-фрактал — зеркально по low.
 */

import type { MockCandle } from './candles';

export interface IndicatorPoint {
  /** UNIX seconds (UTC), aligned to the timeframe grid (may be in the future). */
  time: number;
  value: number;
}

export interface IchimokuData {
  tenkan: IndicatorPoint[];
  kijun: IndicatorPoint[];
  senkouA: IndicatorPoint[];
  senkouB: IndicatorPoint[];
  chikou: IndicatorPoint[];
}

export interface FractalPoint {
  time: number;
  /** 'up' — фрактал над баром (▲), 'down' — под баром (▼). */
  dir: 'up' | 'down';
}

/** (max high + min low) / 2 over the `period` bars ending at index `end`. */
function donchianMid(candles: MockCandle[], end: number, period: number): number | null {
  if (end < period - 1) return null;
  let hi = -Infinity;
  let lo = Infinity;
  for (let i = end - period + 1; i <= end; i++) {
    if (candles[i].high > hi) hi = candles[i].high;
    if (candles[i].low < lo) lo = candles[i].low;
  }
  return (hi + lo) / 2;
}

/**
 * Ichimoku Kinko Hyo (9, 26, 52) со сдвигом 26. Senkou-линии продлены в
 * будущее по шагу таймфрейма `tfSec` (облако впереди цены, как в MT5).
 */
export function computeIchimoku(
  candles: MockCandle[],
  tfSec: number,
  tenkanPeriod = 9,
  kijunPeriod = 26,
  senkouBPeriod = 52,
  displacement = 26,
): IchimokuData {
  const tenkan: IndicatorPoint[] = [];
  const kijun: IndicatorPoint[] = [];
  const senkouA: IndicatorPoint[] = [];
  const senkouB: IndicatorPoint[] = [];
  const chikou: IndicatorPoint[] = [];

  for (let i = 0; i < candles.length; i++) {
    const t = donchianMid(candles, i, tenkanPeriod);
    const k = donchianMid(candles, i, kijunPeriod);
    const b = donchianMid(candles, i, senkouBPeriod);
    if (t != null) tenkan.push({ time: candles[i].time, value: t });
    if (k != null) kijun.push({ time: candles[i].time, value: k });
    if (t != null && k != null) {
      senkouA.push({ time: candles[i].time + displacement * tfSec, value: (t + k) / 2 });
    }
    if (b != null) {
      senkouB.push({ time: candles[i].time + displacement * tfSec, value: b });
    }
    if (i >= displacement) {
      chikou.push({ time: candles[i - displacement].time, value: candles[i].close });
    }
  }

  return { tenkan, kijun, senkouA, senkouB, chikou };
}

/**
 * Fractals Билла Вильямса (MT5): бар — ап-фрактал, если его high строго
 * выше high двух соседних баров с каждой стороны; даун-фрактал — зеркально.
 */
export function computeFractals(candles: MockCandle[]): FractalPoint[] {
  const out: FractalPoint[] = [];
  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];
    if (
      c.high > candles[i - 1].high &&
      c.high > candles[i - 2].high &&
      c.high > candles[i + 1].high &&
      c.high > candles[i + 2].high
    ) {
      out.push({ time: c.time, dir: 'up' });
    }
    if (
      c.low < candles[i - 1].low &&
      c.low < candles[i - 2].low &&
      c.low < candles[i + 1].low &&
      c.low < candles[i + 2].low
    ) {
      out.push({ time: c.time, dir: 'down' });
    }
  }
  return out;
}
