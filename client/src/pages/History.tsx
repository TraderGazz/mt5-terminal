import { useMemo, useRef, useState, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Clock } from 'lucide-react';
import ActionSheet from '@/components/ActionSheet';
import Toast from '@/components/Toast';
import PageLoading from '@/components/PageLoading';
import ConnectionError from '@/components/ConnectionError';
import {
  getBalanceOps,
  getCfdOps,
  getDeals,
  getDealLegs,
  useDealsVersion,
  useHistoryLoaded,
  useHistoryError,
  type DealLeg,
} from '@/data/history';
import { depositTotalsForRange, ledgerBalanceRows, type LedgerBalanceRow } from '@/data/depositLedger';
import { getSymbolMeta } from '@/mocks/symbols';
import { formatMoneyMT5 } from '@/components/history/utils';
import SegmentedControl from '@/components/history/SegmentedControl';
import {
  BalanceRow,
  DealLegRow,
  HistoryEmpty,
  OrderRow,
  PositionRow,
  aggregatePositions,
  type HistoryOrder,
} from '@/components/history/rows';
import { DAY, periodRange, useHistoryFilter } from '@/components/history/historyFilter';
import { canEditTrades, useCurrentRole } from '@/components/auth/session';

/** First-mount stagger happens only once per session (design.md §6). */
let hasMountedOnce = false;

const PULL_THRESHOLD = 70;

type TabKey = 'positions' | 'orders' | 'deals';

const TABS: readonly { value: TabKey; label: string }[] = [
  { value: 'positions', label: 'Позиции' },
  { value: 'orders', label: 'Ордера' },
  { value: 'deals', label: 'Сделки' },
];

/* ------------------------------------------------------------------ */
/* Сортировка (MT5 iOS sort popover)                                   */
/* ------------------------------------------------------------------ */

type SortKey =
  | 'default'
  | 'symbol'
  | 'ticket'
  | 'type'
  | 'volume'
  | 'openTime'
  | 'closeTime'
  | 'profit';

const SORT_OPTIONS: readonly { value: SortKey; label: string }[] = [
  { value: 'default', label: 'По умолчанию' },
  { value: 'symbol', label: 'Символ' },
  { value: 'ticket', label: 'Тикет' },
  { value: 'type', label: 'Тип' },
  { value: 'volume', label: 'Объем' },
  { value: 'openTime', label: 'Время открытия' },
  { value: 'closeTime', label: 'Время закрытия' },
  { value: 'profit', label: 'Прибыль' },
];

/** Minimal shape needed by the sort comparator (deals / positions / orders). */
interface SortableRow {
  ticket: number;
  symbol: string;
  type: string;
  volume: number;
  openTime: number;
  closeTime: number;
  profit: number;
}

/** Oldest-first by close time is the MT5 default — the list ends on the
 *  newest deal, which is what the auto-scroll-to-bottom lands on. */
function compareRows(key: SortKey): (a: SortableRow, b: SortableRow) => number {
  const byCloseTime = (a: SortableRow, b: SortableRow) => a.closeTime - b.closeTime;
  switch (key) {
    case 'symbol':
      return (a, b) => a.symbol.localeCompare(b.symbol) || byCloseTime(a, b);
    case 'ticket':
      return (a, b) => b.ticket - a.ticket;
    case 'type':
      return (a, b) => a.type.localeCompare(b.type) || byCloseTime(a, b);
    case 'volume':
      return (a, b) => a.volume - b.volume || byCloseTime(a, b);
    case 'openTime':
      return (a, b) => b.openTime - a.openTime;
    case 'profit':
      return (a, b) => b.profit - a.profit;
    case 'closeTime':
    default:
      return byCloseTime;
  }
}

/** Thin ⇅+≡ sort glyph (MT5 iOS history toolbar), not in lucide — inline SVG. */
function SortGlyph() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 4v12" />
      <path d="M2.8 13.8 5 16.5l2.2-2.7" />
      <path d="M10 20V8" />
      <path d="M7.8 10.2 10 7.5l2.2 2.7" />
      <path d="M15.5 6.5H21" />
      <path d="M15.5 12H21" />
      <path d="M15.5 17.5H21" />
    </svg>
  );
}

/** Extra canceled pending orders for the «Ордера» tab mock. */
const CANCELED_ORDERS: HistoryOrder[] = [
  {
    ticket: 90215610,
    symbol: 'EURUSD',
    type: 'buy limit',
    volume: 0.2,
    price: 1.071,
    state: 'canceled',
    time: Date.now() - 2 * DAY,
  },
  {
    ticket: 90214900,
    symbol: 'XAUUSD',
    type: 'sell limit',
    volume: 0.1,
    price: 2410.0,
    state: 'canceled',
    time: Date.now() - 5 * DAY,
  },
];

const digitsOf = (symbol: string) => getSymbolMeta(symbol)?.digits ?? 5;

/** Floating 40px light-gray circle button (MT5 iOS trade/history chrome). */
function CircleButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F2F2F4]/90 text-black backdrop-blur-[12px] transition-opacity duration-150 active:opacity-60"
    >
      {children}
    </button>
  );
}

/** Flat MT5 iOS totals row: black 15px label left, tabular-nums value right. */
function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[15px] leading-[22px] text-black">{label}</span>
      <span className="tnum shrink-0 text-[15px] font-medium leading-[22px] text-black">{value}</span>
    </div>
  );
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const role = useCurrentRole();
  // Видимая кнопка-карандаш на самой сделке — заявка заказчика: явный вход
  // в редактирование прямо на сайте, только для admin (не trader/viewer).
  const isAdmin = role === 'admin';
  // «Сделки» видна инвестору, но не нажимается (заявка заказчика).
  const tabs = useMemo(
    () => TABS.map((t) => (t.value === 'deals' ? { ...t, disabled: role === 'viewer' } : t)),
    [role],
  );
  const filter = useHistoryFilter();
  const historyLoaded = useHistoryLoaded();
  const historyError = useHistoryError();

  const [tab, setTab] = useState<TabKey>('positions');
  const [tabDir, setTabDir] = useState(1);
  const [rowsAnimate, setRowsAnimate] = useState(() => !hasMountedOnce);
  const [sort, setSort] = useState<SortKey>('default');
  const [sortOpen, setSortOpen] = useState(false);
  const [rowSheet, setRowSheet] = useState<{ symbol: string; ticket: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    hasMountedOnce = true;
  }, []);

  // Pull-to-refresh state
  const [pull, setPull] = useState(0);
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef<{ startY: number; pulling: boolean }>({ startY: 0, pulling: false });

  const range = useMemo(() => periodRange(filter), [filter]);

  // Reads through editStore so edits from TradeEdit («(изм.)», changed
  // profit/swap/commission) are reflected here immediately.
  const dealsVersion = useDealsVersion();

  const deals = useMemo(
    () =>
      getDeals()
        .filter(
          (d) =>
            d.type !== 'balance' &&
            (filter.symbol == null || d.symbol === filter.symbol) &&
            d.closeTime >= range.from &&
            d.closeTime <= range.to,
        )
        // Flat list, no day sections (MT5 iOS); order = selected sort key.
        .sort(compareRows(sort)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filter.symbol, range, dealsVersion, sort],
  );

  const positions = useMemo(() => {
    const aggregated = aggregatePositions(deals);
    if (sort === 'default') return aggregated;
    return [...aggregated].sort(compareRows(sort));
  }, [deals, sort]);

  // Сырые сделки (открытие/закрытие раздельно) — для вкладки «Сделки»,
  // 1-в-1 с оригинальным MT5 (см. DealLeg в data/history.ts). compareRows
  // читает только openTime/closeTime/profit/symbol/ticket/type/volume — у
  // сырой сделки одно-единственное time, подставляем его в оба поля.
  const dealLegs = useMemo(() => {
    const cmp = compareRows(sort);
    return getDealLegs()
      .filter(
        (d) =>
          d.dealType !== 'balance' &&
          (filter.symbol == null || d.symbol === filter.symbol) &&
          d.time >= range.from &&
          d.time <= range.to,
      )
      .sort((a, b) =>
        cmp(
          { ...a, type: a.type ?? '', openTime: a.time, closeTime: a.time },
          { ...b, type: b.type ?? '', openTime: b.time, closeTime: b.time },
        ),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.symbol, range, dealsVersion, sort]);

  // Депозит/снятие СТРОКАМИ в Истории — заявка заказчика: только те, что
  // реально есть в выписке (ledgerBalanceRows), НЕ синхронизированные с EA
  // demo-записи из БД (там мусор — заказчик отдельно попросил почистить
  // саму таблицу в админке). symbol у баланса нет — при выбранном
  // конкретном символе строки скрываются целиком.
  const balanceRows = useMemo(
    () => (filter.symbol == null ? ledgerBalanceRows(range.from, range.to) : []),
    [filter.symbol, range],
  );

  // Объединённый список для вкладки «Сделки»: сырые сделки + депозиты/
  // снятия из выписки, отсортированные одним ключом сортировки.
  const dealsTabRows = useMemo(() => {
    type Row = { kind: 'leg'; leg: DealLeg } | { kind: 'balance'; op: LedgerBalanceRow };
    const cmp = compareRows(sort);
    const asSortable = (r: Row): SortableRow =>
      r.kind === 'leg'
        ? { ticket: r.leg.ticket, symbol: r.leg.symbol, type: r.leg.type ?? '', volume: r.leg.volume, openTime: r.leg.time, closeTime: r.leg.time, profit: r.leg.profit }
        : { ticket: r.op.ticket, symbol: '', type: 'balance', volume: 0, openTime: r.op.closeTime, closeTime: r.op.closeTime, profit: r.op.profit };
    const rows: Row[] = [
      ...dealLegs.map((leg): Row => ({ kind: 'leg', leg })),
      ...balanceRows.map((op): Row => ({ kind: 'balance', op })),
    ];
    return rows.sort((a, b) => cmp(asSortable(a), asSortable(b)));
  }, [dealLegs, balanceRows, sort]);

  // То же самое для вкладки «Позиции» — в оригинале депозит/снятие тоже
  // идут вперемешку со всей историей там, не только в «Сделках».
  const positionsTabRows = useMemo(() => {
    type Row = { kind: 'position'; position: (typeof positions)[number] } | { kind: 'balance'; op: LedgerBalanceRow };
    const cmp = compareRows(sort);
    const asSortable = (r: Row): SortableRow =>
      r.kind === 'position'
        ? { ticket: r.position.ticket, symbol: r.position.symbol, type: r.position.type, volume: r.position.volume, openTime: r.position.openTime, closeTime: r.position.closeTime, profit: r.position.profit }
        : { ticket: r.op.ticket, symbol: '', type: 'balance', volume: 0, openTime: r.op.closeTime, closeTime: r.op.closeTime, profit: r.op.profit };
    const rows: Row[] = [
      ...positions.map((position): Row => ({ kind: 'position', position })),
      ...balanceRows.map((op): Row => ({ kind: 'balance', op })),
    ];
    return rows.sort((a, b) => cmp(asSortable(a), asSortable(b)));
  }, [positions, balanceRows, sort]);

  // MT5 iOS opens History already scrolled to the very bottom (latest
  // entries + the totals block visible). Scroll the app scroll container
  // (Layout#app-scroll — not window) the first time real data is in —
  // 'auto' behaviour = instant jump, no animation. Guarded by a ref so it
  // fires once per page visit, not on every 20s history-poll refresh, and
  // doesn't fight the user's own scrolling afterwards.
  //
  // Real history loads asynchronously (history.ts fetches /history/raw
  // after mount) — a plain mount-time effect ran and settled on an empty
  // list before the fetch resolved, so it never reached the true bottom
  // once thousands of rows arrived. Depending on `deals` re-runs this once
  // data shows up; with thousands of DOM rows layout can still take a few
  // extra frames, so scrollTo(bottom) is re-issued each frame until
  // scrollHeight stops growing (capped so a stuck render can't loop).
  const autoScrolledRef = useRef(false);
  useEffect(() => {
    if (autoScrolledRef.current || deals.length === 0) return;
    autoScrolledRef.current = true;

    let cancelled = false;
    let rafId = 0;
    let frames = 0;
    let lastHeight = -1;
    let stable = 0;
    const MAX_FRAMES = 120; // ~2s at 60fps safety cap

    const tick = () => {
      if (cancelled) return;
      const el = document.getElementById('app-scroll');
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
        if (el.scrollHeight === lastHeight) {
          stable += 1;
        } else {
          stable = 0;
          lastHeight = el.scrollHeight;
        }
      }
      frames += 1;
      if (stable >= 4 || frames >= MAX_FRAMES) return;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [deals]);

  const orders = useMemo<HistoryOrder[]>(() => {
    const filled: HistoryOrder[] = deals.map((d) => ({
      ticket: d.order,
      symbol: d.symbol,
      type: d.type as 'buy' | 'sell',
      volume: d.volume,
      price: d.openPrice,
      state: 'filled',
      time: d.openTime,
    }));
    const canceled = CANCELED_ORDERS.filter(
      (o) =>
        (filter.symbol == null || o.symbol === filter.symbol) &&
        o.time >= range.from &&
        o.time <= range.to,
    );
    const all = [...filled, ...canceled].sort((a, b) => b.time - a.time);
    if (sort === 'default') return all;
    const cmp = compareRows(sort);
    const asSortable = (o: HistoryOrder): SortableRow => ({
      ticket: o.ticket,
      symbol: o.symbol,
      type: o.type,
      volume: o.volume,
      openTime: o.time,
      closeTime: o.time,
      profit: 0,
    });
    return [...all].sort((a, b) => cmp(asSortable(a), asSortable(b)));
  }, [deals, filter.symbol, range, sort]);

  // CFD adjustments for the «CFD» totals row (respects symbol + period).
  const cfdOps = useMemo(
    () =>
      getCfdOps().filter(
        (d) =>
          (filter.symbol == null || d.symbol === filter.symbol) &&
          d.closeTime >= range.from &&
          d.closeTime <= range.to,
      ),
    [filter.symbol, range, dealsVersion],
  );

  // Итоги считаются из реальных данных (deals/balanceOps уже отфильтрованы
  // по выбранному периоду и символу выше) — как в оригинале, меняются вместе
  // с фильтром периода, для ЛЮБОГО периода (включая «Последний год»: раньше
  // тут была зафиксированная заглушка под демо-презентацию, но правки из
  // админки по ней не применялись — заказчик подтвердил, что теперь этот
  // период тоже должен быть живым, как остальные).
  const totals = useMemo(() => {
    let profit = 0;
    let swap = 0;
    let commission = 0;
    for (const d of deals) {
      profit += d.profit;
      swap += d.swap;
      commission += d.commission;
    }
    return { profit, swap, commission, total: profit + swap + commission };
  }, [deals]);

  // То же самое, но из СЫРЫХ сделок — специально для вкладки «Сделки».
  // Важно: это НЕ обязано совпадать с totals выше (который из уже слитых
  // open+close позиций) — сам оригинальный MT5 показывает разные суммы во
  // вкладках «Сделки» и «Позиции» для одного и того же периода (проверено
  // напрямую сравнением скриншотов), это не баг, а факт про то, как MT5
  // считает эти два разных представления.
  const dealLegsTotals = useMemo(() => {
    let profit = 0;
    let swap = 0;
    let commission = 0;
    for (const d of dealLegs) {
      if (d.dealType !== 'buy' && d.dealType !== 'sell') continue;
      profit += d.profit;
      swap += d.swap;
      commission += d.commission;
    }
    return { profit, swap, commission, total: profit + swap + commission };
  }, [dealLegs]);

  // Депозит/снятие — ТОЛЬКО из официальной выписки брокера (depositLedger.ts,
  // заявка заказчика). Синхронизированные с EA balance-записи за всё время
  // не совпадают с выпиской (68.7М против 25.3М по сумме депозитов) — раз
  // выписка авторитетна, любая дата, которой в ней нет, должна показывать 0,
  // а не подставлять несовпадающие цифры из EA. Отсюда и ожидаемое поведение:
  // период «Месяц» (целиком после LEDGER_END, где в выписке пусто) должен
  // показывать депозит 0 — так и просил заказчик.
  const balTotals = useMemo(() => {
    const { deposit, withdrawal } = depositTotalsForRange(range.from, range.to);
    return { deposit, withdrawal, net: deposit - withdrawal };
  }, [range]);

  const cfdTotal = useMemo(() => cfdOps.reduce((s, d) => s + d.profit, 0), [cfdOps]);

  // «Снятие» / «CFD» rows: только когда период реально содержит ненулевые
  // операции такого рода.
  const showWithdrawal = balTotals.withdrawal !== 0;
  const showCfd = cfdTotal !== 0;
  // «Баланс» — сумма именно за выбранный период (Депозит-Снятие+Прибыль+
  // Своп+Комиссия+CFD), не текущий баланс счёта целиком.
  // «Сделки» считает итоги из сырых legs (см. dealLegsTotals) — по факту
  // отличается от «Позиций»/«Ордеров», как и в оригинале.
  const activeTotals = tab === 'deals' ? dealLegsTotals : totals;
  const grandTotal = balTotals.net + activeTotals.total + cfdTotal;

  const orderStats = useMemo(
    () => ({
      total: orders.length,
      filled: orders.filter((o) => o.state === 'filled').length,
      canceled: orders.filter((o) => o.state === 'canceled').length,
    }),
    [orders],
  );

  /** Totals render only below a non-empty list (flat white block, MT5 iOS). */
  const showTotals =
    tab === 'orders'
      ? orders.length > 0
      : tab === 'positions'
        ? positionsTabRows.length > 0
        : dealsTabRows.length > 0;

  const changeTab = (next: TabKey) => {
    if (next === tab) return;
    const oldIdx = TABS.findIndex((t) => t.value === tab);
    const newIdx = TABS.findIndex((t) => t.value === next);
    setTabDir(newIdx > oldIdx ? 1 : -1);
    setTab(next);
    setRowsAnimate(true);
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

  const onTouchEnd = () => {
    if (!pullRef.current.pulling && pull === 0) return;
    pullRef.current.pulling = false;
    setPulling(false);
    if (pull >= PULL_THRESHOLD) {
      setRefreshing(true);
      setPull(0);
      setTimeout(() => {
        setRefreshing(false);
        setToast('История обновлена');
      }, 700);
    } else {
      setPull(0);
    }
  };

  const stagger = (i: number) => (rowsAnimate ? Math.min(i * 0.025, 0.4) : 0);

  // Real account's first load: show a spinner instead of the empty-list
  // ("Нет сделок") state — /history/raw on a big account can take a few
  // seconds, and an empty state there reads as "history is broken", not
  // "still loading".
  if (!historyLoaded) return <PageLoading />;
  // Backend unreachable — show that explicitly rather than an empty
  // "Нет сделок" state, which reads as "this account has no trades". Only
  // when we've never had ANY real data (raw, unfiltered by period) —
  // a transient poll failure after a successful load just keeps showing
  // the last good (if slightly stale) data instead of hiding it behind
  // an error screen.
  if (historyError && getDeals().length === 0 && getBalanceOps().length === 0) {
    return <ConnectionError />;
  }

  return (
    <div
      className="page-white flex min-h-full flex-col bg-white"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Top zone (no page title, MT5 iOS): sort circle — floating pill tabs — period clock circle */}
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-xl">
        <div className="flex items-center gap-2.5 px-2 pb-2 pt-1.5">
          <div className="relative">
            <CircleButton label="Сортировка" onClick={() => setSortOpen((v) => !v)}>
              <SortGlyph />
            </CircleButton>
            <AnimatePresence>
              {sortOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  style={{ transformOrigin: 'top left' }}
                  className="absolute left-0 top-[calc(100%+8px)] z-50 w-[272px] overflow-hidden rounded-[14px] bg-white shadow-[0_10px_34px_rgba(0,0,0,0.22)]"
                >
                  <div className="px-4 pb-1.5 pt-3 text-[12px] uppercase leading-[16px] tracking-[0.2px] text-text-secondary">
                    Сортировка
                  </div>
                  {SORT_OPTIONS.map((opt, i) => (
                    <div key={opt.value}>
                      {i > 0 && <div className="ml-4 h-px bg-[#C6C6C8]" />}
                      <button
                        type="button"
                        onClick={() => {
                          setSort(opt.value);
                          setSortOpen(false);
                        }}
                        className="flex h-11 w-full items-center justify-between gap-2 px-4 text-left active:bg-[#D9D9DE]"
                      >
                        <span className="text-[17px] leading-[22px] tracking-[-0.41px] text-black">
                          {opt.label}
                        </span>
                        {sort === opt.value && (
                          <Check size={20} strokeWidth={2.2} className="shrink-0 text-accent" />
                        )}
                      </button>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="min-w-0 flex-1">
            <SegmentedControl
              options={tabs}
              value={tab}
              onChange={changeTab}
              layoutId="history-tab-thumb"
            />
          </div>
          <CircleButton label="Выбрать период" onClick={() => navigate('/history/period')}>
            <Clock size={19} strokeWidth={1.6} />
          </CircleButton>
        </div>
      </header>

      {/* Dismiss layer for the sort popover (content area; header stays above) */}
      {sortOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/10"
          aria-hidden
          onClick={() => setSortOpen(false)}
        />
      )}

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
          <path
            d="M21 12a9 9 0 0 0-9-9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Tab content */}
      <div className="relative flex-1 pb-4">
        <AnimatePresence mode="popLayout" initial={false} custom={tabDir}>
          <motion.div
            key={`${tab}-${filter.symbol ?? 'all'}-${filter.period}`}
            custom={tabDir}
            initial={{ opacity: 0, x: 24 * tabDir }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 * tabDir }}
            transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
          >
            {tab === 'deals' &&
              (dealsTabRows.length === 0 ? (
                <HistoryEmpty title="Нет сделок" />
              ) : (
                <div className="bg-white">
                  {dealsTabRows.map((row, i) =>
                    row.kind === 'balance' ? (
                      <BalanceRow
                        key={`bal-${row.op.ticket}`}
                        op={row.op}
                        last={i === dealsTabRows.length - 1}
                        staggerDelay={stagger(i)}
                      />
                    ) : (
                      <DealLegRow
                        key={row.leg.ticket}
                        leg={row.leg}
                        digits={digitsOf(row.leg.symbol)}
                        last={i === dealsTabRows.length - 1}
                        staggerDelay={stagger(i)}
                        onTap={
                          row.leg.entry === 'out' || row.leg.entry === 'inout'
                            ? () => navigate(`/trade/${row.leg.ticket}`)
                            : undefined
                        }
                      />
                    ),
                  )}
                </div>
              ))}

            {tab === 'positions' &&
              (positionsTabRows.length === 0 ? (
                <HistoryEmpty title="Нет закрытых позиций" />
              ) : (
                <div className="bg-white">
                  {positionsTabRows.map((row, i) =>
                    row.kind === 'balance' ? (
                      <BalanceRow
                        key={`bal-${row.op.ticket}`}
                        op={row.op}
                        last={i === positionsTabRows.length - 1}
                        staggerDelay={stagger(i)}
                      />
                    ) : (
                      <PositionRow
                        key={row.position.ticket}
                        position={row.position}
                        digits={digitsOf(row.position.symbol)}
                        last={i === positionsTabRows.length - 1}
                        staggerDelay={stagger(i)}
                        onTap={() => navigate(`/trade/${row.position.ticket}`)}
                        onLongPress={() => setRowSheet(row.position)}
                        onEdit={isAdmin ? () => navigate(`/trade/${row.position.ticket}/edit`) : undefined}
                      />
                    ),
                  )}
                </div>
              ))}

            {tab === 'orders' &&
              (orders.length === 0 ? (
                <HistoryEmpty title="Нет ордеров" />
              ) : (
                <div className="bg-white">
                  {orders.map((o, i) => (
                    <OrderRow
                      key={o.ticket}
                      order={o}
                      digits={digitsOf(o.symbol)}
                      last={i === orders.length - 1}
                      staggerDelay={stagger(i)}
                    />
                  ))}
                </div>
              ))}

          </motion.div>
        </AnimatePresence>

        {/* Flat MT5 iOS totals block at the end of the list, framed by
            full-width hairlines above «Депозит» and below «Баланс». */}
        {showTotals && (
          <div className="bg-white pb-4">
            <div className="h-px bg-[#C6C6C8]" />
            <div className="px-2 py-[14px]">
              {tab === 'orders' ? (
                <>
                  <TotalRow label="Всего" value={String(orderStats.total)} />
                  <TotalRow label="Исполнено" value={String(orderStats.filled)} />
                  <TotalRow label="Отменено" value={String(orderStats.canceled)} />
                </>
              ) : (
                <>
                  <TotalRow label="Депозит" value={formatMoneyMT5(balTotals.deposit)} />
                  {showWithdrawal && (
                    <TotalRow label="Снятие" value={formatMoneyMT5(balTotals.withdrawal)} />
                  )}
                  <TotalRow label="Прибыль" value={formatMoneyMT5(activeTotals.profit)} />
                  {showCfd && <TotalRow label="CFD" value={formatMoneyMT5(cfdTotal)} />}
                  <TotalRow label="Своп" value={formatMoneyMT5(activeTotals.swap)} />
                  <TotalRow label="Комиссия" value={formatMoneyMT5(activeTotals.commission)} />
                  <TotalRow label="Баланс" value={formatMoneyMT5(grandTotal)} />
                </>
              )}
            </div>
            <div className="h-px bg-[#C6C6C8]" />
          </div>
        )}
      </div>

      {/* Long-press deal sheet */}
      <ActionSheet
        open={rowSheet !== null}
        onClose={() => setRowSheet(null)}
        title={rowSheet ? `${rowSheet.symbol} · #${rowSheet.ticket}` : undefined}
        actions={[
          {
            label: 'Подробнее',
            onSelect: () => rowSheet && navigate(`/trade/${rowSheet.ticket}`),
          },
          ...(canEditTrades()
            ? [
                {
                  label: 'Редактировать',
                  onSelect: () => rowSheet && navigate(`/trade/${rowSheet.ticket}/edit`),
                },
              ]
            : []),
        ]}
      />

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
