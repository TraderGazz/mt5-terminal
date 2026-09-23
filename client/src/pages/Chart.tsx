import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { motion } from 'framer-motion';
import { ChartCandlestick, ChevronDown, Crosshair } from 'lucide-react';
import ActionSheet from '@/components/ActionSheet';
import Toast from '@/components/Toast';
import CandleChart from '@/components/chart/CandleChart';
import { TIMEFRAMES, type Timeframe } from '@/components/chart/candles';
import { ensureSymbols } from '@/data/quotes';
import { useQuote } from '@/data/useQuotes';
import { SYMBOLS, getSymbolMeta, type SymbolMeta } from '@/mocks/symbols';
import { cn } from '@/lib/utils';

/** First chart mount of the session gets the clip-path reveal (chart.md). */
let chartMountedOnce = false;

/** Flat header icon-button: dark glyph on transparent, no circle (MT5 iOS). */
function IconButton({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex h-11 w-11 items-center justify-center transition-opacity duration-150 active:opacity-50',
        active ? 'text-accent' : 'text-black',
      )}
    >
      {children}
    </button>
  );
}

/** «Рынок открыт/закрыт» from the mock session string, in server time (UTC+3). */
function marketStatus(meta: SymbolMeta): string {
  const now = new Date();
  const server = new Date(now.getTime() + (180 + now.getTimezoneOffset()) * 60_000);
  const day = server.getDay();
  if (day === 0 || day === 6) return 'Рынок закрыт';
  const m = meta.session.match(/(\d{2}):(\d{2})\D+(\d{2}):(\d{2})/);
  if (!m) return 'Рынок открыт';
  const mins = server.getHours() * 60 + server.getMinutes();
  const from = Number(m[1]) * 60 + Number(m[2]);
  const to = Number(m[3]) * 60 + Number(m[4]);
  return mins >= from && mins <= to ? 'Рынок открыт' : 'Рынок закрыт';
}

type SheetKind = 'symbol' | 'period';

export default function ChartPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const rawSymbol = searchParams.get('symbol') ?? 'EURUSDrfd';
  const meta = getSymbolMeta(rawSymbol) ?? getSymbolMeta('EURUSDrfd')!;
  const symbol = meta.symbol;
  const quote = useQuote(symbol);

  const [timeframe, setTimeframe] = useState<Timeframe>('M5');
  const [crosshairOn, setCrosshairOn] = useState(false);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Extra symbols (e.g. BTCUSD) join the ticker so the chart stays live.
  useEffect(() => {
    ensureSymbols([symbol]);
  }, [symbol]);

  const chartKey = `${symbol}:${timeframe}`;
  const [clipKey] = useState(() => {
    const key = chartMountedOnce ? null : chartKey;
    chartMountedOnce = true;
    return key;
  });
  const isFirstReveal = clipKey !== null && chartKey === clipKey;

  // 400ms skeleton shimmer while the new series "loads".
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    const id = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(id);
  }, [chartKey]);

  const changeSymbol = (code: string) => setSearchParams({ symbol: code });

  return (
    // Layout reserves ~92px under the content for the floating TabBar; run the
    // white chart background edge-to-edge under that zone too (the chart
    // canvas itself keeps its own bottom inset below, so the time axis stays
    // visible above the TabBar). absolute+inset-0 anchors to #app-scroll's
    // PADDING box (its nearest `relative` ancestor), covering exactly that
    // reserved zone without ever exceeding it — a previous height:calc(100%
    // + 92px) hack relied on exact arithmetic that could drift by a pixel
    // when the browser's dvh unit shifted mid-gesture (iOS address bar
    // show/hide), leaving #app-scroll just tall enough to scroll — baг-репорт
    // "страница опять съезжает" on the Chart page specifically.
    <div className="absolute inset-0 flex flex-col overflow-hidden bg-white">
      {/* MT5 iOS top strip: timeframe on the left, flat tool icons on the right. */}
      <div className="flex h-11 shrink-0 items-center justify-between bg-white pl-4 pr-1">
        <button
          type="button"
          aria-label="Период графика"
          onClick={() => setSheet('period')}
          className="flex min-h-11 items-center text-[17px] leading-[22px] tracking-[-0.41px] text-black active:opacity-50"
        >
          {timeframe}
        </button>
        <div className="flex items-center">
          <IconButton
            label="Перекрестие"
            active={crosshairOn}
            onClick={() => setCrosshairOn((v) => !v)}
          >
            <Crosshair size={24} strokeWidth={1.5} />
          </IconButton>
          <IconButton label="Индикаторы" onClick={() => setToast('Режим просмотра')}>
            <span className="font-serif text-[24px] italic leading-none">ƒ</span>
          </IconButton>
          <IconButton label="Периоды графика" onClick={() => setSheet('period')}>
            <ChartCandlestick size={24} strokeWidth={1.5} />
          </IconButton>
        </div>
      </div>

      {/* Full-screen chart with the symbol overlay in the top-left corner.
          The bottom inset keeps the time axis above the floating TabBar while
          the page's white background continues underneath it. */}
      <div
        className="relative min-h-0 flex-1 bg-white"
        style={{ paddingBottom: 'calc(92px + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* In-flow box so the canvas ends above the TabBar inset (absolute
            children would otherwise fill the padding box too). */}
        <div className="relative h-full w-full">
          <motion.div
            key={chartKey}
            className="absolute inset-0"
            initial={
              isFirstReveal
                ? { opacity: 1, clipPath: 'inset(0% 100% 0% 0%)' }
                : { opacity: 0.3 }
            }
            animate={
              loading
                ? isFirstReveal
                  ? { opacity: 1, clipPath: 'inset(0% 100% 0% 0%)' }
                  : { opacity: 0.3 }
                : { opacity: 1, clipPath: 'inset(0% 0% 0% 0%)' }
            }
            transition={{
              duration: isFirstReveal ? 0.5 : 0.25,
              ease: [0.32, 0.72, 0, 1],
            }}
          >
            <CandleChart meta={meta} timeframe={timeframe} quote={quote} crosshairOn={crosshairOn} />
          </motion.div>

          {loading && (
            <motion.div
              className="absolute inset-0 z-10"
              style={{
                backgroundImage:
                  'linear-gradient(90deg, #F2F2F7 0%, #FAFAFC 50%, #F2F2F7 100%)',
                backgroundSize: '200px 100%',
              }}
              animate={{ backgroundPosition: ['-200px 0px', '200px 0px'] }}
              transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
            />
          )}

          {/* Symbol header overlay on top of the chart (MT5 iOS). */}
          <div className="pointer-events-none absolute left-2 top-1 z-20">
            <button
              type="button"
              aria-label="Сменить символ"
              onClick={() => setSheet('symbol')}
              className="pointer-events-auto flex min-h-[22px] items-center gap-0.5 text-[13px] font-semibold leading-[16px] text-black active:opacity-50"
            >
              {symbol}
              <ChevronDown size={13} strokeWidth={2.2} />
              <span className="font-normal">{timeframe}</span>
            </button>
            <div className="text-[12px] leading-[16px] text-text-secondary">{meta.description}</div>
            <div className="text-[12px] leading-[16px] text-text-secondary">
              {marketStatus(meta)}
            </div>
          </div>
        </div>
      </div>

      <ActionSheet
        open={sheet === 'symbol'}
        title="Сменить символ"
        actions={SYMBOLS.map((s) => ({
          label: s.symbol === symbol ? `✓ ${s.symbol}` : s.symbol,
          onSelect: () => changeSymbol(s.symbol),
        }))}
        onClose={() => setSheet(null)}
      />
      <ActionSheet
        open={sheet === 'period'}
        title="Период графика"
        actions={TIMEFRAMES.map((tf) => ({
          label: tf === timeframe ? `✓ ${tf}` : tf,
          onSelect: () => setTimeframe(tf),
        }))}
        onClose={() => setSheet(null)}
      />

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
