import { useEffect, useRef } from 'react';
import { Reorder, motion, useDragControls } from 'framer-motion';
import { Hourglass } from 'lucide-react';
import type { Quote } from '@/mocks/quotes';
import { getSymbolMeta } from '@/mocks/symbols';
import { MINUS, formatPrice, formatTime } from '@/lib/format';
import BigPrice from './BigPrice';

/**
 * Tick-flash keyframes for the MT5 iOS quotes list: a tick UP flashes blue
 * (#007AFF), a tick DOWN flashes red (#FF3B30). Defined locally because the
 * shared tailwind config still ships the desktop green/red variants.
 * Rendered once by the page.
 */
export function QuoteFlashStyles() {
  return (
    <style>{`
      @keyframes mt5q-flash-up {
        0% { background-color: rgba(0, 122, 255, 0.14); }
        100% { background-color: transparent; }
      }
      @keyframes mt5q-flash-down {
        0% { background-color: rgba(255, 59, 48, 0.14); }
        100% { background-color: transparent; }
      }
      @keyframes mt5q-num-up {
        0%, 60% { color: #007AFF; }
        100% { color: #000000; }
      }
      @keyframes mt5q-num-down {
        0%, 60% { color: #FF3B30; }
        100% { color: #000000; }
      }
      .mt5q-flash-up { animation: mt5q-flash-up 0.6s ease-out; }
      .mt5q-flash-down { animation: mt5q-flash-down 0.6s ease-out; }
      .mt5q-num-up { animation: mt5q-num-up 0.4s ease-out; }
      .mt5q-num-down { animation: mt5q-num-down 0.4s ease-out; }
    `}</style>
  );
}

interface QuoteRowProps {
  code: string;
  quote: Quote | undefined;
  editMode: boolean;
  confirming: boolean;
  onToggleConfirm: () => void;
  onDelete: () => void;
  onTap: () => void;
  onLongPress: () => void;
  staggerDelay: number;
}

/**
 * One MT5 iOS Market Watch row (image ref): white list row, no separators —
 * rows are divided by whitespace only. Left: signed points change + coloured
 * signed %, compact 14px symbol (about the change line's height), grey
 * «time · hourglass · spread» line. Right: big pip-emphasised Bid/Ask with
 * the session Low/High underneath.
 */
export default function QuoteRow({
  code,
  quote,
  editMode,
  confirming,
  onToggleConfirm,
  onDelete,
  onTap,
  onLongPress,
  staggerDelay,
}: QuoteRowProps) {
  const controls = useDragControls();
  const meta = getSymbolMeta(code);
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  /** Session low/high, widened on every tick (mock has no day OHLC). */
  const dayBounds = useRef<{ low: number; high: number } | null>(null);

  useEffect(
    () => () => {
      if (lpTimer.current) clearTimeout(lpTimer.current);
    },
    [],
  );

  const clearLp = () => {
    if (lpTimer.current) {
      clearTimeout(lpTimer.current);
      lpTimer.current = null;
    }
  };

  const digits = meta?.digits ?? 5;

  let low = 0;
  let high = 0;
  if (quote) {
    if (!dayBounds.current) {
      // Seed around the day open so L/H are plausible from the first render.
      const open = quote.bid / (1 + quote.changePct / 100);
      dayBounds.current = {
        low: Math.min(open, quote.bid),
        high: Math.max(open, quote.ask),
      };
    } else {
      dayBounds.current.low = Math.min(dayBounds.current.low, quote.bid);
      dayBounds.current.high = Math.max(dayBounds.current.high, quote.ask);
    }
    low = dayBounds.current.low;
    high = dayBounds.current.high;
  }

  const flashClass =
    quote?.direction === 'up'
      ? 'mt5q-flash-up'
      : quote?.direction === 'down'
        ? 'mt5q-flash-down'
        : '';
  const numClass =
    quote?.direction === 'up'
      ? 'mt5q-num-up'
      : quote?.direction === 'down'
        ? 'mt5q-num-down'
        : '';

  // Signed day change in points (derived from changePct vs the day open).
  let pointsText = '';
  let pctText = '';
  let changeColor = 'text-accent';
  if (quote) {
    const open = quote.bid / (1 + quote.changePct / 100);
    const points = Math.round((quote.bid - open) * Math.pow(10, digits));
    const negative = quote.changePct < 0;
    pointsText = `${negative ? MINUS : '+'}${Math.abs(points)}`;
    pctText = `${negative ? MINUS : ''}${Math.abs(quote.changePct).toFixed(2)}%`;
    changeColor = negative ? 'text-loss' : 'text-accent';
  }

  return (
    <Reorder.Item
      value={code}
      dragListener={false}
      dragControls={controls}
      initial={staggerDelay > 0 ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
      transition={{ duration: 0.25, delay: staggerDelay }}
      whileDrag={{ scale: 1.02, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 20 }}
      className="relative select-none bg-white"
    >
      <div className="flex items-stretch">
        {/* delete zone (edit mode) */}
        <div
          className={`flex items-center justify-center overflow-hidden transition-[width] duration-300 ${
            editMode ? 'w-11' : 'w-0'
          }`}
        >
          {editMode && (
            <button
              type="button"
              aria-label="Удалить"
              onClick={onToggleConfirm}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-loss active:opacity-70"
            >
              <span
                className={`block h-[2px] w-3 rounded bg-white transition-transform duration-200 ${
                  confirming ? 'rotate-90' : ''
                }`}
              />
            </button>
          )}
        </div>

        {/* content */}
        <div
          className="flex min-w-0 flex-1 items-center justify-between gap-2 py-[9px] pl-4 pr-4 active:bg-[#D9D9DE]"
          onClick={() => {
            if (!editMode && !longPressed.current) onTap();
          }}
          onPointerDown={() => {
            longPressed.current = false;
            clearLp();
            lpTimer.current = setTimeout(() => {
              longPressed.current = true;
              if (!editMode) onLongPress();
            }, 500);
          }}
          onPointerUp={clearLp}
          onPointerLeave={clearLp}
          onPointerCancel={clearLp}
        >
          {/* left: change / symbol / time+spread */}
          <div className="flex min-w-0 flex-col gap-[2px]">
            {quote && (
              <div className="tnum text-[12px] font-medium leading-[14px]">
                <span className="text-[#3A3A3C]">{pointsText}</span>{' '}
                <span className={changeColor}>{pctText}</span>
              </div>
            )}
            <div className="truncate text-[14px] font-semibold leading-[17px] tracking-[-0.15px]">
              {code}
            </div>
            {quote && (
              <div className="tnum flex items-center gap-1 text-[11px] leading-[13px] text-text-secondary">
                <span>{formatTime(quote.updatedAt)}</span>
                <Hourglass size={10} strokeWidth={1.8} aria-hidden />
                <span>{meta?.spreadPoints ?? '—'}</span>
              </div>
            )}
          </div>

          {/* right: big Bid/Ask with session L/H underneath */}
          {quote && (
            <div
              key={quote.tick}
              className={`-mx-1 flex shrink-0 items-start gap-4 rounded-md px-1 py-0.5 text-black ${flashClass} ${numClass}`}
            >
              <div className="flex flex-col items-end">
                <BigPrice value={quote.bid} digits={digits} />
                <span className="tnum mt-[3px] text-[11px] leading-[13px] text-text-secondary">
                  L: {formatPrice(low, digits)}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <BigPrice value={quote.ask} digits={digits} />
                <span className="tnum mt-[3px] text-[11px] leading-[13px] text-text-secondary">
                  H: {formatPrice(high, digits)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* right zone: delete button or drag handle (edit mode) */}
        <div
          className={`flex items-center overflow-hidden transition-[width] duration-300 ${
            editMode ? (confirming ? 'w-[92px]' : 'w-10') : 'w-0'
          }`}
        >
          {editMode &&
            (confirming ? (
              <motion.button
                type="button"
                initial={{ x: 60 }}
                animate={{ x: 0 }}
                transition={{ duration: 0.25 }}
                onClick={onDelete}
                className="flex h-full w-[92px] items-center justify-center bg-loss text-[15px] font-medium text-white"
              >
                Удалить
              </motion.button>
            ) : (
              <div
                onPointerDown={(e) => controls.start(e)}
                className="flex h-full w-10 cursor-grab touch-none items-center justify-center text-text-secondary"
                aria-label="Перетащить"
              >
                <svg width="18" height="12" viewBox="0 0 18 12" fill="none" aria-hidden>
                  <path d="M1 1h16M1 6h16M1 11h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
            ))}
        </div>
      </div>
    </Reorder.Item>
  );
}
