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

// Candle times (from the backend) are true UTC; MT5's own terminal/EA runs
// on the broker's server clock (UTC+3) with no timezone awareness, so all
// display AND period-boundary math needs this same shift applied.
const BROKER_OFFSET_SEC = 3 * 3600;

/** «d MMM HH:mm» in server time (UTC+3) from a REAL (not synthetic — see
 *  buildSynthetic below) unix-seconds timestamp. Used by the crosshair/OHLC
 *  time label, which (unlike axis ticks) always shows the time-of-day. */
function formatRealTime(realSec: number): string {
  const d = new Date((realSec + BROKER_OFFSET_SEC) * 1000);
  const dayMonth = `${d.getUTCDate()} ${MONTHS_EN[d.getUTCMonth()]}`;
  return `${dayMonth} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/** Axis tick label: same as formatRealTime, but «d MMM» only (no time) for
 *  D1, MT5 iOS style. */
function formatRealTickMark(realSec: number, tf: Timeframe): string {
  if (tf !== 'D1') return formatRealTime(realSec);
  const d = new Date((realSec + BROKER_OFFSET_SEC) * 1000);
  return `${d.getUTCDate()} ${MONTHS_EN[d.getUTCMonth()]}`;
}

/**
 * lightweight-charts spaces numeric-timestamp bars proportionally to real
 * elapsed time — real forex data has none on weekends, so any intraday
 * chart using real timestamps directly shows a visible blank gap every
 * Fri→Mon (confirmed against the library's own docs: this is the default,
 * not a bug — "whitespace" gaps are exactly what real time gaps render as).
 * MT5's own chart has no such gap: candles sit flush together regardless of
 * the calendar hole between them.
 *
 * Fix: plot on a SYNTHETIC, perfectly uniform time axis (index × tfSec) —
 * gapless by construction — and keep a parallel real-time lookup purely for
 * axis/crosshair LABELS (which must still show the true broker date/time).
 * `synOf(i)` is the synthetic time for candles[i] (or any projected index,
 * e.g. Ichimoku's Senkou spans 26 bars into the future); `realTimeForIndex`
 * reverses that (real time for a synthetic time's index), extrapolating by
 * flat tfSec steps for indices beyond the real data (future projections,
 * and new bars appended live by the rollover effect below — both cases are
 * verified single, gap-free tfSec steps already, see that effect).
 */
function buildSynthetic(candles: MockCandle[], tfSec: number) {
  const realTimeOf = candles.map((c) => c.time);
  const synBase = realTimeOf[0] ?? 0;
  const synOf = (index: number): number => synBase + index * tfSec;
  const realTimeForIndex = (index: number): number => {
    if (index >= 0 && index < realTimeOf.length) return realTimeOf[index];
    const lastIdx = realTimeOf.length - 1;
    const anchorIdx = index >= realTimeOf.length ? lastIdx : 0;
    const anchor = realTimeOf[anchorIdx] ?? synBase;
    return anchor + (index - anchorIdx) * tfSec;
  };
  const indexOfSyn = (synTime: number): number => Math.round((synTime - synBase) / tfSec);
  const realTimeForSyn = (synTime: number): number => realTimeForIndex(indexOfSyn(synTime));
  return { synOf, realTimeForIndex, realTimeForSyn };
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
 * current-price line with a green pill on the price scale, pinch-zoom /
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
  // lastCandleRef.time is SYNTHETIC (chart-plotted) time; lastRealTimeRef is
  // the corresponding REAL time, tracked separately purely to detect period
  // rollovers against the real wall clock — see buildSynthetic above.
  const lastCandleRef = useRef<MockCandle | null>(null);
  const lastRealTimeRef = useRef(0);
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
    const tfSec = TF_SECONDS[timeframe];
    const { synOf, realTimeForSyn } = buildSynthetic(candles, tfSec);
    dataLenRef.current = candles.length;
    const lastIdx = candles.length - 1;
    lastCandleRef.current = { ...candles[lastIdx], time: synOf(lastIdx) };
    lastRealTimeRef.current = candles[lastIdx].time;

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
      localization: {
        timeFormatter: (time: Time) => formatRealTime(realTimeForSyn(Number(time))),
      },
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        tickMarkFormatter: (time: Time) => formatRealTickMark(realTimeForSyn(Number(time)), timeframe),
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

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#34C759',
      downColor: '#FF3B30',
      wickUpColor: '#34C759',
      wickDownColor: '#FF3B30',
      borderVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: { type: 'price', precision: digits, minMove: Math.pow(10, -digits) },
    });
    series.setData(candles.map((c, i) => ({ ...c, time: synOf(i) as UTCTimestamp })));
    // Synthetic time is gap-free and strictly one tfSec step per index, so
    // (unlike the old real-time version of this code) a plain N-bars-back
    // subtraction is always exact — no risk of landing short/long across a
    // weekend hole.
    const applyZoom = () => {
      chart.timeScale().setVisibleRange({
        from: synOf(lastIdx - 59) as UTCTimestamp,
        to: synOf(lastIdx) as UTCTimestamp,
      });
    };
    applyZoom();
    // The chart can still be mid-layout (container not yet at its final
    // size) the instant it's created, especially when switching timeframe
    // from an open action sheet — setVisibleRange silently lands short of
    // the true end in that case. Re-apply after layout settles.
    requestAnimationFrame(() => requestAnimationFrame(applyZoom));

    // Current price: MT5 iOS green dashed line + green pill on the scale.
    const priceLine = series.createPriceLine({
      price: candles[candles.length - 1].close,
      color: '#34C759',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: '',
    });

    // --- Индикаторы MT5: Ichimoku Kinko Hyo (9, 26, 52) + Fractals ---
    // Значения считаются из тех же свечей, что строят график (indicators.ts).
    // Линии без ценовых меток/маркеров перекрестия, чтобы не мусорить на
    // шкале; autoscale свечей (с расширением под позиции) не затрагивается —
    // значения индикаторов лежат внутри ценового диапазона баров.
    const ichimoku = computeIchimoku(candles);
    const toLineData = (pts: IndicatorPoint[]) =>
      pts.map((p) => ({ time: synOf(p.index) as UTCTimestamp, value: p.value }));
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
        time: synOf(f.index) as UTCTimestamp,
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
    // lastCandleRef.time is synthetic (see buildSynthetic) — exact math.
    const resetZoom = () => {
      const lastTime = lastCandleRef.current?.time;
      if (lastTime == null) return;
      chart.timeScale().setVisibleRange({
        from: (lastTime - 59 * TF_SECONDS[timeframe]) as UTCTimestamp,
        to: lastTime as UTCTimestamp,
      });
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
    // Candle times are true UTC, but MT5/broker buckets H1/H4/D1 periods by
    // its OWN server clock (UTC+3), not true-UTC boundaries — e.g. a real
    // H4 bar rolls over at broker 20:00, which is true-UTC 17:00. Flooring
    // raw UTC would roll our bar an offset-sized chunk early/late vs the
    // real terminal. Shift into broker time before flooring, then back.
    // Compared against lastRealTimeRef (REAL time), not last.time (which is
    // the chart's gap-free SYNTHETIC time — see buildSynthetic above).
    const currentRealTime = Math.floor((nowSec + BROKER_OFFSET_SEC) / tfSec) * tfSec - BROKER_OFFSET_SEC;

    let candle: MockCandle;
    if (currentRealTime > lastRealTimeRef.current) {
      const gapPeriods = Math.round((currentRealTime - lastRealTimeRef.current) / tfSec);
      if (gapPeriods > 1) {
        // Real history-sync gap (weekend, EA/terminal lag, etc.), not a
        // normal tick-to-tick rollover: we don't know what actually
        // happened in the missing periods. Don't fabricate a bar that
        // visually absorbs the whole gap's price move into one candle
        // (reads as a candle from a much higher timeframe) — leave the
        // last real bar alone and only move the price line. A fresh
        // candle refetch will backfill the real bars once available.
        priceLine.applyOptions({ price });
        return;
      }
      // Verified above to be exactly one real tfSec step (gapPeriods <= 1),
      // so advancing the synthetic time by one tfSec step too keeps it
      // gap-free and in sync with the real clock — see buildSynthetic.
      candle = {
        time: last.time + tfSec,
        open: last.close,
        high: Math.max(last.close, price),
        low: Math.min(last.close, price),
        close: price,
      };
      lastRealTimeRef.current = currentRealTime;
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
