import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, Reorder, motion } from 'framer-motion';
import { List, Pencil, Plus, Search, X } from 'lucide-react';
import NavBar from '@/components/NavBar';
import ActionSheet from '@/components/ActionSheet';
import Toast from '@/components/Toast';
import QuoteRow, { QuoteFlashStyles } from '@/components/quotes/QuoteRow';
import { useQuotes } from '@/data/useQuotes';
import { ensureSymbols, refreshQuotes } from '@/data/quotes';
import { EXTRA_SYMBOLS, SYMBOLS, getSymbolMeta } from '@/mocks/symbols';
import { ACCOUNT } from '@/mocks/account';
import { formatTime } from '@/lib/format';

/** First-mount stagger happens only once per session (design.md §6). */
let hasMountedOnce = false;

const DEFAULT_ORDER = SYMBOLS.map((s) => s.symbol);
const PULL_THRESHOLD = 70;

/**
 * Header icon button — the MT5 iOS Quotes bar is «plain»: thin dark glyphs
 * directly on the white bar, no floating circles (ref image(24)).
 */
const HEADER_BTN =
  'flex h-11 items-center justify-center px-1 text-black transition-opacity duration-150 active:opacity-50';

export default function QuotesPage() {
  const navigate = useNavigate();
  const quotes = useQuotes();
  const quoteMap = useMemo(() => new Map(quotes.map((q) => [q.symbol, q])), [quotes]);

  const [order, setOrder] = useState<string[]>(DEFAULT_ORDER);
  const [editMode, setEditMode] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [accountSheet, setAccountSheet] = useState(false);
  const [addSheet, setAddSheet] = useState(false);
  const [rowSheet, setRowSheet] = useState<string | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Pull-to-refresh state
  const [pull, setPull] = useState(0);
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef<{ startY: number; pulling: boolean }>({ startY: 0, pulling: false });

  const [firstMount] = useState(() => !hasMountedOnce);
  useEffect(() => {
    hasMountedOnce = true;
  }, []);

  // The MT5 iOS Quotes screen is fully white — including the strip behind the
  // decorative status bar. AppShell owns the column's grouped-gray fill
  // (shared), so override it locally while this page is mounted and restore
  // it on unmount (useLayoutEffect: no gray flash on first paint).
  useLayoutEffect(() => {
    const column = document.getElementById('app-scroll')?.parentElement;
    if (!column) return;
    const prev = column.style.backgroundColor;
    column.style.backgroundColor = '#FFFFFF';
    return () => {
      column.style.backgroundColor = prev;
    };
  }, []);

  // 150ms live-search debounce
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(id);
  }, [query]);

  const visible = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!searchMode || !q) return order;
    return order.filter((code) => {
      const meta = getSymbolMeta(code);
      return (
        code.toLowerCase().includes(q) ||
        (meta?.description.toLowerCase().includes(q) ?? false)
      );
    });
  }, [order, debouncedQuery, searchMode]);

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
      setPull(Math.min(dy * 0.5, 110)); // rubber-band resistance 0.5
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
      void refreshQuotes().then((ts) => {
        setRefreshing(false);
        setToast(`Обновлено · ${formatTime(ts)}`);
      });
    } else {
      setPull(0);
    }
  };

  // --- actions ---
  // encodeURIComponent: symbols like «#LCO» would otherwise break the query string.
  const openChart = (code: string) => navigate(`/chart?symbol=${encodeURIComponent(code)}`);

  const addSymbol = (code: string) => {
    ensureSymbols([code]);
    setOrder((o) => (o.includes(code) ? o : [...o, code]));
  };

  const removeSymbol = (code: string) => {
    setOrder((o) => o.filter((c) => c !== code));
    setConfirmDelete(null);
  };

  const navRight = editMode ? (
    <button
      type="button"
      aria-label="Добавить символ"
      onClick={() => setAddSheet(true)}
      className={HEADER_BTN}
    >
      <Plus size={22} strokeWidth={1.8} />
    </button>
  ) : (
    <>
      <button
        type="button"
        aria-label="Редактировать"
        onClick={() => setEditMode(true)}
        className={HEADER_BTN}
      >
        <Pencil size={19} strokeWidth={1.8} />
      </button>
      <button
        type="button"
        aria-label="Поиск"
        onClick={() => setSearchMode(true)}
        className={HEADER_BTN}
      >
        <Search size={20} strokeWidth={1.8} />
      </button>
    </>
  );

  return (
    <div
      className="flex min-h-full flex-col bg-white"
      // +92px: extend the white page background into the scroll container's
      // bottom padding strip (reserved for the floating TabBar by Layout), so
      // no gray grouped-bg shows around/under the bar like in MT5 iOS.
      style={{ minHeight: 'calc(100% + 92px + env(safe-area-inset-bottom, 0px))' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <QuoteFlashStyles />
      {searchMode ? (
        <NavBar
          plain
          solid
          title={null}
          left={
            <div className="flex h-9 flex-1 items-center gap-1.5 rounded-[10px] bg-fill px-2">
              <Search size={16} strokeWidth={1.5} className="shrink-0 text-text-secondary" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск символа"
                className="min-w-0 flex-1 bg-transparent text-[17px] tracking-[-0.41px] outline-none placeholder:text-text-secondary"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Очистить"
                  onClick={() => setQuery('')}
                  className="text-text-secondary active:opacity-50"
                >
                  <X size={16} strokeWidth={2} />
                </button>
              )}
            </div>
          }
          right={
            <button
              type="button"
              onClick={() => {
                setSearchMode(false);
                setQuery('');
              }}
              className="h-11 pl-3 text-[17px] text-accent active:opacity-50"
            >
              Отмена
            </button>
          }
        />
      ) : editMode ? (
        <NavBar
          plain
          solid
          title="Редактирование"
          left={
            <button
              type="button"
              onClick={() => {
                setEditMode(false);
                setConfirmDelete(null);
              }}
              className="h-11 px-2 text-[17px] text-accent active:opacity-50"
            >
              Готово
            </button>
          }
          right={navRight}
        />
      ) : (
        <NavBar
          plain
          solid
          title="Котировки"
          left={
            <button
              type="button"
              aria-label="Счёт"
              onClick={() => setAccountSheet(true)}
              className={HEADER_BTN}
            >
              <List size={22} strokeWidth={1.8} />
            </button>
          }
          right={navRight}
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
          className={`h-5 w-5 text-text-secondary ${refreshing || pull >= PULL_THRESHOLD ? 'animate-spin' : ''}`}
          style={
            refreshing
              ? undefined
              : { transform: `rotate(${(pull / PULL_THRESHOLD) * 270}deg)`, opacity: 0.4 + 0.6 * (pull / PULL_THRESHOLD) }
          }
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      {/* Quote list */}
      <div className="flex-1">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-1 px-8 pt-20 text-center">
            <Search size={48} strokeWidth={1} className="text-text-secondary" />
            <p className="mt-2 text-[17px] font-semibold text-text-secondary">Нет символов</p>
            <p className="text-[13px] text-text-secondary">Попробуйте изменить запрос</p>
          </div>
        ) : (
          <Reorder.Group axis="y" values={order} onReorder={setOrder} className="list-none">
            <AnimatePresence initial={false}>
              {visible.map((code, i) => (
                <QuoteRow
                  key={code}
                  code={code}
                  quote={quoteMap.get(code)}
                  editMode={editMode}
                  confirming={confirmDelete === code}
                  onToggleConfirm={() =>
                    setConfirmDelete((c) => (c === code ? null : code))
                  }
                  onDelete={() => removeSymbol(code)}
                  onTap={() => openChart(code)}
                  onLongPress={() => setRowSheet(code)}
                  staggerDelay={firstMount && !searchMode ? i * 0.012 : 0}
                />
              ))}
            </AnimatePresence>
          </Reorder.Group>
        )}
      </div>

      {/* Account sheet */}
      <ActionSheet
        open={accountSheet}
        onClose={() => setAccountSheet(false)}
        title={
          <>
            Счёт {ACCOUNT.accountId}
            <br />
            {ACCOUNT.company} · {ACCOUNT.server}
          </>
        }
        actions={[
          { label: 'Выйти', destructive: true, onSelect: () => navigate('/login') },
        ]}
      />

      {/* Add-symbol sheet */}
      <ActionSheet
        open={addSheet}
        onClose={() => setAddSheet(false)}
        title="Добавить символ"
        actions={EXTRA_SYMBOLS.map((meta) => ({
          label: meta.symbol,
          disabled: order.includes(meta.symbol),
          onSelect: () => addSymbol(meta.symbol),
        }))}
      />

      {/* Long-press row sheet */}
      <ActionSheet
        open={rowSheet !== null}
        onClose={() => setRowSheet(null)}
        title={rowSheet ?? undefined}
        actions={[
          { label: 'Чарт', onSelect: () => rowSheet && openChart(rowSheet) },
          { label: 'Детали', onSelect: () => rowSheet && setDetails(rowSheet) },
        ]}
      />

      {/* Symbol details sheet (static mock) */}
      <SymbolDetails code={details} onClose={() => setDetails(null)} />

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SymbolDetails({ code, onClose }: { code: string | null; onClose: () => void }) {
  const meta = code ? getSymbolMeta(code) : undefined;
  return (
    <AnimatePresence>
      {code && meta && (
        <div className="fixed inset-0 z-[60]">
          <div className="relative mx-auto flex h-full w-full max-w-[430px] flex-col justify-end">
            <motion.div
              className="absolute inset-0 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={onClose}
            />
            <motion.div
              className="relative rounded-t-[12px] bg-white px-4 pb-8 pt-4"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            >
              <div className="mb-3 text-center text-[17px] font-semibold">{meta.symbol}</div>
              {(
                [
                  ['Описание', meta.description],
                  ['Дигиты', String(meta.digits)],
                  ['Спред', `${meta.spreadPoints} п.`],
                  ['Размер контракта', meta.contractSize.toLocaleString('ru-RU')],
                  ['Сессия', meta.session],
                ] as const
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between border-b border-separator py-2.5 text-[15px] last:border-b-0"
                >
                  <span className="text-text-secondary">{label}</span>
                  <span className="tnum">{value}</span>
                </div>
              ))}
              <button
                type="button"
                onClick={onClose}
                className="mt-4 h-[50px] w-full rounded-[12px] bg-accent text-[17px] font-semibold text-white active:opacity-85"
              >
                Закрыть
              </button>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
