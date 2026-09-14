/**
 * Провайдер свечей для графика.
 *   mock — сгенерированный seeded-ряд (@/components/chart/candles)
 *   api  — исторические бары из /api/candles (кэш в памяти) + live-морфинг
 *          последней свечи по котировке (как и в mock).
 *
 * Интерфейс подобран так, чтобы CandleChart менялся минимально:
 *   getCandleSeries() — синхронно отдаёт готовый ряд (реальный из кэша или mock);
 *   useCandleData()   — хук, дергающий загрузку и меняющий version при приходе данных.
 */
import { useEffect, useState } from 'react';
import { IS_API } from '@/config';
import { generateCandles, type MockCandle, type Timeframe } from '@/components/chart/candles';
import { getCandles as fetchCandles } from '@/api/rest';

const cache = new Map<string, MockCandle[]>();
const inflight = new Set<string>();
let bump: (() => void) | null = null;

const key = (symbol: string, tf: string) => `${symbol}:${tf}`;

async function load(symbol: string, tf: Timeframe, digits: number) {
  const k = key(symbol, tf);
  if (inflight.has(k)) return;
  inflight.add(k);
  try {
    const bars = await fetchCandles(symbol, tf);
    const rounded = bars.map((b) => ({
      time: b.time,
      open: round(b.open, digits),
      high: round(b.high, digits),
      low: round(b.low, digits),
      close: round(b.close, digits),
    }));
    if (rounded.length) {
      cache.set(k, rounded);
      bump?.();
    }
  } catch {
    /* оставляем mock-фолбэк */
  } finally {
    inflight.delete(k);
  }
}

function round(v: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}

/** Готовый ряд свечей. В api — реальный из кэша, иначе (и до загрузки) — mock. */
export function getCandleSeries(
  symbol: string,
  tf: Timeframe,
  digits: number,
  bid: number,
): MockCandle[] {
  if (IS_API) {
    const real = cache.get(key(symbol, tf));
    if (real && real.length) return real;
  }
  return generateCandles(symbol, tf, digits, bid);
}

const REFRESH_MS = 300_000;

/** Триггерит загрузку реальных свечей (api) и возвращает счётчик обновлений.
 *  Переопрашивает раз в 5 минут — терминал не всегда досинхронизирует
 *  историю в реальном времени сам по себе (не по каждому символу/ТФ держит
 *  открытый график), так что живая дорисовка последней свечи может уйти в
 *  разрыв от давно устаревших данных; периодический рефетч подтягивает
 *  реальные бары. Раз в минуту (как было раньше) оказалось слишком часто —
 *  каждый рефетч пересоздаёт график целиком (сброс на состояние из fetch),
 *  и пока в терминале не хватает совсем свежих баров, это заметно как
 *  кратковременный "откат" графика к неполным данным при каждом тике. */
export function useCandleData(symbol: string, tf: Timeframe, digits: number): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!IS_API) return;
    bump = () => setVersion((v) => v + 1);
    void load(symbol, tf, digits);
    const timer = setInterval(() => void load(symbol, tf, digits), REFRESH_MS);
    return () => {
      bump = null;
      clearInterval(timer);
    };
  }, [symbol, tf, digits]);
  return version;
}
