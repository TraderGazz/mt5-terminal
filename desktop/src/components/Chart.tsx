import { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts';
import { getCandles, type Candle } from '@/api/rest';
import { wsClient } from '@/api/ws';

const TIMEFRAME = 'M5';

function toBar(c: Candle): CandlestickData<Time> {
  return { time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close };
}

/**
 * Свечной график (заявка заказчика: «Торговля»/«История» — точная копия
 * оригинала MT5, а там таблицы всегда идут ПОД графиком, одна страница).
 * Минимальная версия — только свечи M5, без индикаторов/инструментов
 * рисования (это отдельная большая функция самого MT5, не часть дизайна
 * этих двух вкладок).
 */
export default function Chart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: { background: { type: ColorType.Solid, color: '#ffffff' }, textColor: '#1c1c1e', attributionLogo: false },
      grid: {
        vertLines: { color: '#f0f0f3' },
        horzLines: { color: '#f0f0f3' },
      },
      rightPriceScale: { borderColor: '#e5e5e5' },
      timeScale: { borderColor: '#e5e5e5', timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#34C759',
      downColor: '#FF3B30',
      borderVisible: false,
      wickUpColor: '#34C759',
      wickDownColor: '#FF3B30',
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      chart.resize(width, height);
    });
    ro.observe(el);

    getCandles(TIMEFRAME, 300)
      .then((r) => series.setData(r.bars.map(toBar)))
      .catch(() => {});

    const off = wsClient.on(`candle:${TIMEFRAME}`, (d) => {
      const payload = d as { bars?: Candle[] };
      const bars = payload?.bars;
      if (!bars?.length) return;
      for (const b of bars) series.update(toBar(b));
    });

    return () => {
      off();
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="h-full w-full" />;
}
