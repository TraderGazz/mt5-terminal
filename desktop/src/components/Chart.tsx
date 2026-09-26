import { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  LineStyle,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts';
import { getCandles, getPositions, type Candle, type Position } from '@/api/rest';
import { wsClient } from '@/api/ws';

function toBar(c: Candle): CandlestickData<Time> {
  return { time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close };
}

function toMarkers(positions: Position[]): SeriesMarker<Time>[] {
  return positions
    .filter((p) => p.openTime)
    .map((p): SeriesMarker<Time> => ({
      time: Math.floor(new Date(p.openTime as string).getTime() / 1000) as Time,
      position: 'atPriceMiddle',
      price: p.openPrice,
      shape: 'circle',
      color: p.type === 'buy' ? '#34C759' : '#FF3B30',
      size: 1.2,
    }))
    .sort((a, b) => (a.time as number) - (b.time as number));
}

/**
 * Свечной график (заявка заказчика: «Торговля»/«История» — точная копия
 * оригинала MT5, а там таблицы всегда идут ПОД графиком, одна страница) +
 * маркеры открытых позиций на графике (стрелка в цене входа), как в
 * оригинале. Без индикаторов/инструментов рисования — это отдельная
 * большая функция самого MT5, не часть дизайна этих двух вкладок.
 */
export default function Chart({ timeframe }: { timeframe: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const positionsRef = useRef<Position[]>([]);

  const refreshMarkers = () => markersRef.current?.setMarkers(toMarkers(positionsRef.current));

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: { background: { type: ColorType.Solid, color: '#ffffff' }, textColor: '#1c1c1e', attributionLogo: false },
      grid: {
        vertLines: { color: '#d6d6da', style: LineStyle.Dotted },
        horzLines: { color: '#d6d6da', style: LineStyle.Dotted },
      },
      rightPriceScale: { borderColor: '#c8c8cc' },
      timeScale: {
        borderColor: '#c8c8cc',
        timeVisible: true,
        secondsVisible: false,
        // оригинал MT5 показывает дату+время на каждой отметке оси, не
        // только на смене суток (в отличие от "умного" форматтера по умолчанию).
        tickMarkFormatter: (time: Time) => {
          if (typeof time !== 'number') return '';
          const d = new Date(time * 1000);
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const pad2 = (n: number) => String(n).padStart(2, '0');
          return `${d.getDate()} ${months[d.getMonth()]} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
        },
      },
      crosshair: { mode: 0 },
    });
    // Цветовая схема как на референсе заказчика: полые бело-чёрные тела
    // (не закрашенные зелёный/красный, как в типичных веб-чартах) и
    // одноцветные зелёные тени — конкретная настройка именно этого
    // терминала, но раз заказчик прислал её как образец — воспроизвели точно.
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#ffffff',
      downColor: '#000000',
      borderVisible: true,
      borderUpColor: '#000000',
      borderDownColor: '#000000',
      wickUpColor: '#00A651',
      wickDownColor: '#00A651',
      priceLineColor: '#787b86',
      priceLineStyle: LineStyle.Dashed,
    });
    chartRef.current = chart;
    seriesRef.current = series;
    markersRef.current = createSeriesMarkers(series, []);

    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      chart.resize(width, height);
    });
    ro.observe(el);

    getPositions()
      .then((positions) => { positionsRef.current = positions; refreshMarkers(); })
      .catch(() => {});
    const offPositions = wsClient.on('positions', (d) => {
      positionsRef.current = (d as Position[]) || [];
      refreshMarkers();
    });

    return () => {
      offPositions();
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      markersRef.current = null;
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    series.setData([]);
    getCandles(timeframe, 300)
      .then((r) => { series.setData(r.bars.map(toBar)); refreshMarkers(); })
      .catch(() => {});

    const off = wsClient.on(`candle:${timeframe}`, (d) => {
      const payload = d as { bars?: Candle[] };
      const bars = payload?.bars;
      if (!bars?.length) return;
      for (const b of bars) series.update(toBar(b));
      refreshMarkers();
    });
    return off;
  }, [timeframe]);

  return <div ref={containerRef} className="h-full w-full" />;
}
