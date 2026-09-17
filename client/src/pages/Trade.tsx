import { useEffect, useMemo, useRef, useState } from 'react';
import { animate, motion } from 'framer-motion';
import { Briefcase, Plus } from 'lucide-react';
import Toast from '@/components/Toast';
import ActionSheet from '@/components/ActionSheet';
import PageLoading from '@/components/PageLoading';
import ConnectionError from '@/components/ConnectionError';
import PositionSheet, { type LivePositionData } from '@/components/trade/PositionSheet';
import NewOrderSheet from '@/components/trade/NewOrderSheet';
import { useAccount, useAccountReady, useAccountError } from '@/data/account';
import { usePositions, usePositionsReady, usePositionsError, refreshPositions } from '@/data/positions';
import type { Position } from '@/data/positions';
import { useQuotes } from '@/data/useQuotes';
import { refreshQuotes, type Quote } from '@/data/quotes';
import { getSymbolMeta } from '@/mocks/symbols';
import { formatPrice } from '@/lib/format';
import { openTrade, closeTrade } from '@/api/rest';
import { SYMBOL } from '@/config';
import { useCurrentRole } from '@/components/auth/session';

/** First-mount animations run once per session (design.md §6). */
let hasMountedOnce = false;

const PULL_THRESHOLD = 70;

interface LivePosition {
  position: Position;
  close: number;
  profit: number;
  digits: number;
  direction: Quote['direction'];
  tick: number;
}

/** Live floating P/L: scale the mock profit by the live price move. */
function toLive(p: Position, q: Quote | undefined): LivePosition {
  const meta = getSymbolMeta(p.symbol);
  const digits = meta?.digits ?? 5;
  const close = q ? (p.type === 'buy' ? q.bid : q.ask) : p.currentPrice;
  const dir = p.type === 'buy' ? 1 : -1;
  const baseMove = dir * (p.currentPrice - p.openPrice);
  const k = baseMove !== 0 ? p.profit / baseMove : 0;
  const profit = k * dir * (close - p.openPrice);
  return {
    position: p,
    close,
    profit,
    digits,
    direction: q?.direction ?? 'flat',
    tick: q?.tick ?? 0,
  };
}

/** MT5-style money: ASCII minus, space thousands, dot decimals ("-40 128 812.93"). */
function mt5Money(value: number): string {
  const [int, dec] = Math.abs(value).toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${value < 0 ? '-' : ''}${grouped}.${dec}`;
}

/** Lots the way MT5 shows them: 1 → "1", 0.5 → "0.5", 1.25 → "1.25". */
function mt5Lots(volume: number): string {
  return String(Math.round(volume * 100) / 100);
}

/** Compact MT5 iOS account row: black 16px label/value, 22px pitch, no separator.
 *  Values are a notch bolder (medium) than the regular labels, as in MT5 iOS. */
function AccountRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-2">
      <span className="shrink-0 text-[16px] leading-[22px] text-black">{label}</span>
      <span className="tnum min-w-0 truncate text-right text-[16px] font-medium leading-[22px] text-black">
        {value}
      </span>
    </div>
  );
}

export default function TradePage() {
  // Реальные открытие/закрытие сделок прямо на сайте — заявка заказчика,
  // только для admin (не trader/viewer). Это настоящий ордер брокеру через
  // MT5-мост, не мок/запись для витрины — как и в отдельной админке.
  const isAdmin = useCurrentRole() === 'admin';
  const [orderSheet, setOrderSheet] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [closeConfirm, setCloseConfirm] = useState<Position | null>(null);
  const [closing, setClosing] = useState(false);

  const account = useAccount();
  const positions = usePositions();
  const accountReady = useAccountReady();
  const positionsReady = usePositionsReady();
  const dataReady = accountReady && positionsReady;
  const accountError = useAccountError();
  const positionsError = usePositionsError();
  const dataError = accountError || positionsError;
  const quotes = useQuotes();
  const quoteMap = useMemo(() => new Map(quotes.map((q) => [q.symbol, q])), [quotes]);

  const [selected, setSelected] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Pull-to-refresh state (same pattern as the Quotes page)
  const [pull, setPull] = useState(0);
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef<{ startY: number; pulling: boolean }>({ startY: 0, pulling: false });

  const [firstMount] = useState(() => !hasMountedOnce);
  useEffect(() => {
    hasMountedOnce = true;
  }, []);

  const live = useMemo(
    () => positions.map((p) => toLive(p, quoteMap.get(p.symbol))),
    [positions, quoteMap],
  );
  // Итоги (шапка/hero) берём готовыми со счёта — там уже учтены своп и
  // комиссия (equity/freeMargin от MT5 всегда точны). Клиентский live[]
  // пересчёт остаётся только для анимации отдельных строк позиций.
  const equity = account.equity;
  const freeMargin = account.freeMargin;
  const totalProfit = equity - account.balance;

  // Hero count-up on first mount (0 → value, 600ms ease-out)
  const initialTotalRef = useRef(totalProfit);
  const [countUp, setCountUp] = useState<number | null>(firstMount ? 0 : null);
  useEffect(() => {
    if (!firstMount) return;
    const controls = animate(0, initialTotalRef.current, {
      duration: 0.6,
      ease: 'easeOut',
      onUpdate: (v) => setCountUp(v),
      onComplete: () => setCountUp(null),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const heroValue = countUp ?? totalProfit;

  const selectedData: LivePositionData | null = useMemo(() => {
    if (selected === null) return null;
    const l = live.find((x) => x.position.id === selected);
    return l ? { position: l.position, close: l.close, profit: l.profit, digits: l.digits } : null;
  }, [selected, live]);

  const symbolQuote = quoteMap.get(SYMBOL);

  const submitOpen = (type: 'buy' | 'sell', volume: number) => {
    setSubmittingOrder(true);
    openTrade({ type, volume })
      .then((r) => {
        setToast(`Сделка открыта: ${type} ${volume} лот, тикет #${r.order ?? r.deal ?? '—'}`);
        setOrderSheet(false);
        return refreshPositions();
      })
      .catch((err: Error) => setToast(err.message || 'Не удалось открыть сделку'))
      .finally(() => setSubmittingOrder(false));
  };

  const submitClose = () => {
    if (!closeConfirm) return;
    const target = closeConfirm;
    setClosing(true);
    closeTrade({ ticket: target.id })
      .then(() => {
        setToast(`Позиция #${target.id} закрыта`);
        setCloseConfirm(null);
        setSelected(null);
        return refreshPositions();
      })
      .catch((err: Error) => setToast(err.message || 'Не удалось закрыть сделку'))
      .finally(() => setClosing(false));
  };

  // --- pull to refresh ---
  const scrollerAtTop = () => {
    const el = document.getElementById('app-scroll');
    return !el || el.scrollTop <= 0;
  };
  const onTouchStart = (e: React.TouchEvent) => {
    if (!scrollerAtTop() || refreshing) return;
    pullRef.current = { startY: e.touches[0].clientY, pulling: true };
    setPulling(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!pullRef.current.pulling || refreshing) return;
    const dy = e.touches[0].clientY - pullRef.current.startY;
    if (dy > 0 && scrollerAtTop()) {
      setPull(Math.min(dy * 0.5, 110));
    } else {
      pullRef.current.pulling = false;
      setPulling(false);
      setPull(0);
    }
  };
  const doRefresh = () => {
    setRefreshing(true);
    void refreshQuotes().then(() => {
      setRefreshing(false);
      setToast('Синхронизировано с MT5');
    });
  };
  const onTouchEnd = () => {
    if (!pullRef.current.pulling && pull === 0) return;
    pullRef.current.pulling = false;
    setPulling(false);
    if (pull >= PULL_THRESHOLD) {
      setPull(0);
      doRefresh();
    } else {
      setPull(0);
    }
  };

  // Real account's first load: show a spinner, not the mock snapshot
  // (POSITIONS/ACCOUNT placeholders) flashing before live data replaces it.
  if (!dataReady) return <PageLoading />;
  // Backend unreachable (e.g. paused server) — show that explicitly instead
  // of silently falling back to the mock snapshot as if it were real data.
  if (dataError) return <ConnectionError />;

  return (
    <div
      className="page-white flex min-h-full flex-col bg-white"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull-to-refresh spinner */}
      <div
        className={`flex items-center justify-center overflow-hidden ${
          pulling ? '' : 'transition-[height] duration-200'
        }`}
        style={{ height: refreshing ? 44 : pull }}
      >
        <svg
          className={`h-5 w-5 text-text-secondary ${
            refreshing || pull >= PULL_THRESHOLD ? 'animate-spin' : ''
          }`}
          style={
            refreshing
              ? undefined
              : {
                  transform: `rotate(${(pull / PULL_THRESHOLD) * 270}deg)`,
                  opacity: 0.4 + 0.6 * (pull / PULL_THRESHOLD),
                }
          }
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      {/* Floating account P/L hero + new-order (read-only) button — sticky:
          stays pinned at the top while the positions list scrolls beneath it,
          matching the real MT5 app. */}
      <div className="sticky top-0 z-20 bg-white pb-[22px] pt-4">
        <div className="text-center">
          <motion.div
            key={Math.round(heroValue * 100)}
            initial={{ opacity: 0.5 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className={`tnum text-[20px] font-semibold leading-[26px] ${
              heroValue < 0 ? 'text-loss' : 'text-accent'
            }`}
          >
            {mt5Money(heroValue)} {account.currency}
          </motion.div>
        </div>
        <button
          type="button"
          aria-label="Новый ордер"
          onClick={() =>
            isAdmin
              ? setOrderSheet(true)
              : setToast('Только просмотр. Совершение сделок недоступно')
          }
          className={`absolute right-5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full active:opacity-50 ${
            isAdmin ? 'bg-accent text-white' : 'bg-[#F2F2F4] text-[#8E8E93]'
          }`}
        >
          <Plus size={22} strokeWidth={1.5} />
        </button>
      </div>

      {/* Account block — compact flat rows on white, no separators (MT5 iOS) */}
      <motion.div
        initial={firstMount ? { opacity: 0, y: 12 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: firstMount ? 0.1 : 0 }}
      >
        <AccountRow label="Баланс:" value={mt5Money(account.balance)} />
        <AccountRow label="Средства:" value={mt5Money(equity)} />
        <AccountRow label="Маржа:" value={mt5Money(account.margin)} />
        <AccountRow label="Свободная маржа:" value={mt5Money(freeMargin)} />
        <AccountRow label="Уровень маржи (%):" value={account.marginLevel.toFixed(2)} />
      </motion.div>

      {/* Section header — full-width light-gray band with bold black title (MT5 iOS) */}
      <div className="mt-[8px] flex h-[29px] items-center bg-[#F8F8F8] px-2">
        <span className="text-[14px] font-bold leading-[18px] text-black">Позиции</span>
      </div>

      {/* Positions list — flat rows with hairlines, no card */}
      {live.length === 0 ? (
        <div className="flex flex-col items-center gap-1 px-8 pt-12 text-center">
          <Briefcase size={48} strokeWidth={1} className="text-text-secondary" />
          <p className="mt-2 text-[17px] font-semibold text-text-secondary">
            Нет открытых позиций
          </p>
          <p className="text-[13px] text-text-secondary">
            Позиции появятся после синхронизации с MT5
          </p>
        </div>
      ) : (
        <div>
          {live.map((l, i) => (
            <motion.button
              key={l.position.id}
              type="button"
              initial={firstMount ? { opacity: 0, y: 10 } : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: firstMount ? i * 0.04 : 0 }}
              onClick={() => setSelected(l.position.id)}
              className="block w-full px-2 py-[5px] text-left active:bg-[#F2F2F7]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[17px] leading-[22px] tracking-[-0.41px]">
                    <span className="font-semibold text-black">{l.position.symbol}</span>{' '}
                    <span className={l.position.type === 'buy' ? 'text-accent' : 'text-loss'}>
                      {l.position.type}{' '}
                      <span className="tnum">{mt5Lots(l.position.volume)}</span>
                    </span>
                  </div>
                  <div className="tnum mt-[2px] text-[15px] leading-[20px] text-text-secondary">
                    {formatPrice(l.position.openPrice, l.digits)} →{' '}
                    {formatPrice(l.close, l.digits)}
                  </div>
                </div>
                <div className="shrink-0 rounded-[4px] px-1 py-0.5 text-right">
                  <div
                    className={`tnum text-[20px] font-medium leading-[26px] ${
                      l.profit < 0 ? 'text-loss' : 'text-accent'
                    }`}
                  >
                    {mt5Money(l.profit)}
                  </div>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {/* Position detail sheet — «Закрыть позицию» только у admin */}
      <PositionSheet
        data={selectedData}
        onClose={() => setSelected(null)}
        onRequestClosePosition={
          isAdmin && selectedData ? () => setCloseConfirm(selectedData.position) : undefined
        }
      />

      {/* Новый ордер (admin) — реальная рыночная заявка, не мок */}
      <NewOrderSheet
        open={orderSheet}
        symbol={SYMBOL}
        digits={getSymbolMeta(SYMBOL)?.digits ?? 5}
        bid={symbolQuote?.bid}
        ask={symbolQuote?.ask}
        submitting={submittingOrder}
        onSubmit={submitOpen}
        onClose={() => !submittingOrder && setOrderSheet(false)}
      />

      {/* Подтверждение закрытия позиции (admin) */}
      <ActionSheet
        open={closeConfirm !== null}
        onClose={() => !closing && setCloseConfirm(null)}
        title={
          closeConfirm
            ? `#${closeConfirm.id} ${closeConfirm.symbol} ${closeConfirm.type} — закрыть по рынку? Действие необратимо.`
            : undefined
        }
        actions={[
          {
            label: closing ? 'Закрываю…' : 'Закрыть позицию',
            destructive: true,
            disabled: closing,
            onSelect: submitClose,
          },
        ]}
      />

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
