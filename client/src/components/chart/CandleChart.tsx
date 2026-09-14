import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
} from 'lightweight-charts';
import type {
  AutoscaleInfo,
  BarData,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  MouseEventParams,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';
import { TF_SECONDS, type MockCandle, type Timeframe } from './candles';
import { getCandleSeries, useCandleData } from '@/data/candles';
import { computeFractals, computeIchimoku, type IndicatorPoint } from './indicators';
import type { Quote } from '@/data/quotes';
import { POSITIONS } from '@/mocks/positions';
import type { SymbolMeta } from '@/mocks/symbols';
import { formatPrice } from '@/lib/format';

const pad2 = (n: number) => String(n).padStart(2, '0');
const MONTHS_EN = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Axis time labels in server time (UTC+3), MT5 iOS style: «d MMM HH:mm»
 *  («28 Aug 17:10») for M1–H4, «d MMM» for D1. */
function makeTickMarkFormatter(tf: Timeframe) {
  return (time: Time): string => {
    const d = new Date((Number(time) + 3 * 3600) * 1000);
    const dayMonth = `${d.getUTCDate()} ${MONTHS_EN[d.getUTCMonth()]}`;
    if (tf === 'D1') return dayMonth;
    return `${dayMonth} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  };
}

interface CandleChartProps {
  meta: SymbolMeta;
  timeframe: Timeframe;
  quote: Quote | undefined;
  /** MT5 crosshair mode: magnet crosshair with axis labels while on. */
  crosshairOn: boolean;
}

/**
 * Lightweight Charts candlestick canvas (MT5 iOS chart screen): green/red
 * candles on white, barely-visible #F0F0F3 grid, green (#34C759) dashed
 * current-price line with a green pill on the price scale, solid red
 * (#FF3B30) price lines for open positions of the symbol, pinch-zoom /
 * drag-scroll, double-tap resets zoom to the latest 60 candles. The last
 * candle morphs on every quote tick and rolls over when a new period starts.
 * The dashed #8E8E93 magnet crosshair (with OHLC readout) is only visible
 * while `crosshairOn` is set. Overlaid indicators (computed from the same
 * candles, see indicators.ts): Ichimoku Kinko Hyo (9, 26, 52) — red Tenkan,
 * blue Kijun, dashed Senkou A/B shifted +26 bars ahead, green Chikou shifted
 * -26 bars back — and grey ▲/▼ Fractals markers.
 */
export default function CandleChart({ meta, timeframe, quote, crosshairOn }: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const priceLineRef = useRef<IPriceLine | null>(null);
  const lastCandleRef = useRef<MockCandle | null>(null);
  const dataLenRef = useRef(0);
  const crosshairOnRef = useRef(crosshairOn);
  const [ohlc, setOhlc] = useState<{ bar: BarData<Time>; visible: boolean } | null>(null);
  const candleVersion = useCandleData(meta.symbol, timeframe, meta.digits);

  // Keep the ref current so chart-created closures see the latest toggle.
  useEffect(() => {
    crosshairOnRef.current = crosshairOn;
  }, [crosshairOn]);

  // Crosshair toggle: magnet mode + visible dashed lines/labels when on,
  // fully hidden when off (MT5 iOS behaviour).
  useEffect(() => {
    chartRef.current?.applyOptions({
      crosshair: {
        mode: crosshairOn ? CrosshairMode.Magnet : CrosshairMode.Normal,
        vertLine: { visible: crosshairOn, labelVisible: crosshairOn },
        horzLine: { visible: crosshairOn, labelVisible: crosshairOn },
      },
    });
    if (!crosshairOn) setOhlc(null);
  }, [crosshairOn]);

  // Create the chart and (re)load mock data when symbol/timeframe changes.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const digits = meta.digits;
    const bid = quote?.bid ?? meta.baseBid;
    const candles = getCandleSeries(meta.symbol, timeframe, digits, bid);
    dataLenRef.current = candles.length;
    lastCandleRef.current = candles[candles.length - 1];

    const chart: IChartApi = createChart(el, {
      width: Math.max(1, el.clientWidth),
      height: Math.max(1, el.clientHeight),
      layout: {
        background: { type: ColorType.Solid, color: '#FFFFFF' },
        textColor: '#8E8E93',
        fontSize: 11,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Tahoma, Roboto, sans-serif',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '#F0F0F3' },
        horzLines: { color: '#F0F0F3' },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        tickMarkFormatter: makeTickMarkFormatter(timeframe),
      },
      crosshair: {
        mode: crosshairOnRef.current ? CrosshairMode.Magnet : CrosshairMode.Normal,
        vertLine: {
          color: '#8E8E93',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#8E8E93',
          visible: crosshairOnRef.current,
          labelVisible: crosshairOnRef.current,
        },
        horzLine: {
          color: '#8E8E93',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#8E8E93',
          visible: crosshairOnRef.current,
          labelVisible: crosshairOnRef.current,
        },
      },
      // One-finger drag scrolls history, pinch zooms; vertical touch drag is
      // disabled so the page itself stays put.
      handleScroll: { pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { pinch: true, mouseWheel: true, axisPressedMouseMove: true },
    });

    // Open-position levels of this symbol must stay on screen (MT5 iOS shows
    // them with red price pills), so the autoscale range is widened to cover
    // every position price plus a small padding.
    const positionPrices = POSITIONS.filter((p) => p.symbol === meta.symbol).map(
      (p) => p.openPrice,
    );

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#34C759',
      downColor: '#FF3B30',
      wickUpColor: '#34C759',
      wickDownColor: '#FF3B30',
      borderVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: { type: 'price', precision: digits, minMove: Math.pow(10, -digits) },
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
        const info = original();
        if (info?.priceRange && positionPrices.length > 0) {
          const min = Math.min(info.priceRange.minValue, ...positionPrices);
          const max = Math.max(info.priceRange.maxValue, ...positionPrices);
          const pad = Math.max((max - min) * 0.02, Math.pow(10, -digits) * 10);
          info.priceRange.minValue = min - pad;
          info.priceRange.maxValue = max + pad;
        }
        return info;
      },
    });
    series.setData(candles.map((c) => ({ ...c, time: c.time as UTCTimestamp })));
    chart.timeScale().setVisibleLogicalRange({ from: candles.length - 60, to: candles.length - 1 });

    // Current price: MT5 iOS green dashed line + green pill on the scale.
    const priceLine = series.createPriceLine({
      price: candles[candles.length - 1].close,
      color: '#34C759',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: '',
    });

    // Open positions of this symbol → solid red level + red price pill.
    for (const pos of POSITIONS) {
      if (pos.symbol !== meta.symbol) continue;
      series.createPriceLine({
        price: pos.openPrice,
        color: '#FF3B30',
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: '',
      });
    }

    // --- Индикаторы MT5: Ichimoku Kinko Hyo (9, 26, 52) + Fractals ---
    // Значения считаются из тех же свечей, что строят график (indicators.ts).
    // Линии без ценовых меток/маркеров перекрестия, чтобы не мусорить на
    // шкале; autoscale свечей (с расширением под позиции) не затрагивается —
    // значения индикаторов лежат внутри ценового диапазона баров.
    const ichimoku = computeIchimoku(candles, TF_SECONDS[timeframe]);
    const toLineData = (pts: IndicatorPoint[]) =>
      pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }));
    const indicatorLineOpts = {
      lineWidth: 1 as const,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    };
    // Tenkan-sen — красная; Kijun-sen — синяя (1px сплошные).
    chart
      .addSeries(LineSeries, { ...indicatorLineOpts, color: '#FF3B30' })
      .setData(toLineData(ichimoku.tenkan));
    chart
      .addSeries(LineSeries, { ...indicatorLineOpts, color: '#007AFF' })
      .setData(toLineData(ichimoku.kijun));
    // Senkou Span A/B — приглушённый оливково-серый пунктир, сдвиг +26
    // баров вперёд (облако впереди цены).
    chart
      .addSeries(LineSeries, {
        ...indicatorLineOpts,
        color: '#B09A5E',
        lineStyle: LineStyle.Dashed,
      })
      .setData(toLineData(ichimoku.senkouA));
    chart
      .addSeries(LineSeries, {
        ...indicatorLineOpts,
        color: '#B09A5E',
        lineStyle: LineStyle.Dashed,
      })
      .setData(toLineData(ichimoku.senkouB));
    // Chikou Span — зелёная линия close, сдвиг -26 баров назад.
    chart
      .addSeries(LineSeries, { ...indicatorLineOpts, color: '#34C759' })
      .setData(toLineData(ichimoku.chikou));

    // Fractals: маленькие серые треугольники — ▲ над баром / ▼ под баром.
    createSeriesMarkers(
      series,
      computeFractals(candles).map((f) => ({
        time: f.time as UTCTimestamp,
        position: f.dir === 'up' ? ('aboveBar' as const) : ('belowBar' as const),
        shape: f.dir === 'up' ? ('arrowUp' as const) : ('arrowDown' as const),
        color: '#8E8E93',
        size: 1,
      })),
    );

    chartRef.current = chart;
    seriesRef.current = series;
    priceLineRef.current = priceLine;

    // Crosshair → OHLC overlay (fades out 300ms after release). Only in
    // crosshair mode, like MT5 iOS.
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const onCrosshairMove = (param: MouseEventParams<Time>) => {
      if (!crosshairOnRef.current) return;
      const bar = param.seriesData.get(series);
      if (param.point != null && param.time != null && bar != null && 'open' in bar) {
        if (hideTimer) clearTimeout(hideTimer);
        setOhlc({ bar, visible: true });
      } else {
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(
          () => setOhlc((s) => (s ? { ...s, visible: false } : s)),
          300,
        );
      }
    };
    chart.subscribeCrosshairMove(onCrosshairMove);

    // Double-tap / double-click → reset zoom to the latest 60 candles.
    const resetZoom = () => {
      const len = dataLenRef.current;
      chart.timeScale().setVisibleLogicalRange({ from: len - 60, to: len - 1 });
    };
    let lastTap = 0;
    const onTouchEnd = () => {
      const now = Date.now();
      if (now - lastTap < 300) resetZoom();
      lastTap = now;
    };
    el.addEventListener('dblclick', resetZoom);
    el.addEventListener('touchend', onTouchEnd);

    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) {
        chart.resize(Math.max(1, Math.floor(rect.width)), Math.max(1, Math.floor(rect.height)));
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      el.removeEventListener('dblclick', resetZoom);
      el.removeEventListener('touchend', onTouchEnd);
      if (hideTimer) clearTimeout(hideTimer);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      priceLineRef.current = null;
      setOhlc(null);
    };
    // Chart/data rebuild only on symbol or timeframe change; live ticks are
    // applied by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.symbol, meta.digits, meta.baseBid, meta.baseChangePct, timeframe, candleVersion]);

  // Live: morph the last candle from the quote ticker (~3s demo ticks).
  useEffect(() => {
    if (!quote || quote.symbol !== meta.symbol) return;
    const series = seriesRef.current;
    const priceLine = priceLineRef.current;
    const last = lastCandleRef.current;
    if (!series || !priceLine || !last) return;

    const tfSec = TF_SECONDS[timeframe];
    const price = quote.bid;
    const nowSec = Math.floor(Date.now() / 1000);
    const currentTime = Math.floor(nowSec / tfSec) * tfSec;

    let candle: MockCandle;
    if (currentTime > last.time) {
      // Roll over to a new candle. If more than one period is missing —
      // a real history-sync gap (weekend, EA/terminal lag, etc.), not a
      // normal tick-to-tick rollover — don't bridge last.close → price in
      // one bar: that fabricates a huge fake move that never happened.
      // Start the new candle flat at the live price instead.
      const gapPeriods = Math.round((currentTime - last.time) / tfSec);
      const open = gapPeriods <= 1 ? last.close : price;
      candle = {
        time: currentTime,
        open,
        high: Math.max(open, price),
        low: Math.min(open, price),
        close: price,
      };
      dataLenRef.current += 1;
    } else {
      candle = {
        ...last,
        close: price,
        high: Math.max(last.high, price),
        low: Math.min(last.low, price),
      };
    }
    lastCandleRef.current = candle;
    series.update({ ...candle, time: candle.time as UTCTimestamp });
    priceLine.applyOptions({ price });
  }, [quote, meta.symbol, timeframe]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />
      {crosshairOn && ohlc && (
        <div
          className={`pointer-events-none absolute left-2 top-[64px] z-10 text-[11px] leading-[14px] text-text-secondary transition-opacity duration-300 ${
            ohlc.visible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <span className="tnum">
            O {formatPrice(ohlc.bar.open, meta.digits)} H{' '}
            {formatPrice(ohlc.bar.high, meta.digits)} L{' '}
            {formatPrice(ohlc.bar.low, meta.digits)} C{' '}
            {formatPrice(ohlc.bar.close, meta.digits)}
          </span>
        </div>
      )}
    </div>
  );
}
