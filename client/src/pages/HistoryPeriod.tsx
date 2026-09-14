import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronRight } from 'lucide-react';
import NavBar, { BackButton } from '@/components/NavBar';
import ActionSheet from '@/components/ActionSheet';
import Toast from '@/components/Toast';
import { getAllRows } from '@/data/history';
import { formatDate } from '@/lib/format';
import { RowSeparator } from '@/components/history/Section';
import {
  PERIOD_LABELS,
  endOfDay,
  periodLabel,
  periodRange,
  setHistoryFilter,
  startOfDay,
  useHistoryFilter,
  type PeriodKind,
} from '@/components/history/historyFilter';
import { formatRuShortDate, parseISODate, toISODate } from '@/components/history/utils';
import { downloadCsvReport, openHtmlReport } from '@/components/history/report';

const SYMBOL_OPTIONS = ['EURUSD', 'USDRUB', 'XAUUSD', 'XAGUSD', 'GBPUSD'] as const;

const PERIOD_ROWS: readonly { value: PeriodKind; label: string }[] = [
  { value: 'today', label: 'Сегодня' },
  { value: 'week', label: 'Последняя неделя' },
  { value: 'month', label: 'Последний месяц' },
  { value: '3m', label: 'Последние 3 месяца' },
  { value: '6m', label: 'Последние 6 месяцев' },
  { value: 'year', label: 'Последний год' },
  { value: 'custom', label: 'Выбрать период' },
];

// ВРЕМЕННО (по просьбе заказчика, пока подключён инвестор): отображение по
// этим периодам ещё не выверено до конца — оставить выбор только Сегодня и
// Последний год, остальные скрыть выбор (не тап, серым) до отдельного
// разрешения включить обратно.
const TEMP_DISABLED_PERIODS = new Set<PeriodKind>(['week', 'month', '3m', '6m', 'custom']);

// ВРЕМЕННО (тот же запрос): «Создать торговый отчёт» пока просто показывает
// «Режим просмотра» вместо реальной генерации HTML/CSV — снять флаг, чтобы
// вернуть рабочий выбор формата (код ниже не тронут).
const TEMP_REPORT_DISABLED = true;

/** White iOS card (radius 14, 16px margins) on the grouped gray background. */
function Card({ children, first }: { children: ReactNode; first?: boolean }) {
  return (
    <div className={`mx-4 ${first ? 'mt-5' : 'mt-4'} overflow-hidden rounded-[14px] bg-white`}>
      {children}
    </div>
  );
}

/** Checkmark with pop-in animation (history-period.md: scale 0.5→1 spring). */
function RowCheck() {
  return (
    <motion.span
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30, duration: 0.2 }}
      className="text-accent"
    >
      <Check size={22} strokeWidth={2.2} />
    </motion.span>
  );
}

interface RadioRowProps {
  label: string;
  selected: boolean;
  last?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

function RadioRow({ label, selected, last, disabled, onSelect }: RadioRowProps) {
  return (
    <div className="bg-white">
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        className={`flex h-12 w-full items-center justify-between px-4 text-left ${
          disabled ? 'opacity-40' : 'active:bg-[#D9D9DE]'
        }`}
      >
        <span className="text-[17px] leading-[22px] tracking-[-0.41px]">{label}</span>
        <AnimatePresence>{selected && <RowCheck />}</AnimatePresence>
      </button>
      {!last && <RowSeparator />}
    </div>
  );
}

export default function HistoryPeriodPage() {
  const navigate = useNavigate();
  const applied = useHistoryFilter();

  const [symbol, setSymbol] = useState<string | null>(applied.symbol);
  const [period, setPeriod] = useState<PeriodKind>(applied.period);
  const [customFrom, setCustomFrom] = useState(applied.customFrom);
  const [customTo, setCustomTo] = useState(applied.customTo);
  const [openPicker, setOpenPicker] = useState<'from' | 'to' | null>(null);
  const [symbolSheet, setSymbolSheet] = useState(false);
  const [reportSheet, setReportSheet] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const dirty =
    symbol !== applied.symbol ||
    period !== applied.period ||
    customFrom !== applied.customFrom ||
    customTo !== applied.customTo;

  const apply = () => {
    setHistoryFilter({ symbol, period, customFrom, customTo });
    navigate(-1);
  };

  const pickCustomFrom = (value: string) => {
    if (!value) return;
    const ts = startOfDay(parseISODate(value));
    setCustomFrom(ts);
    if (ts > customTo) setCustomTo(endOfDay(ts));
    setPeriod('custom');
  };

  const pickCustomTo = (value: string) => {
    if (!value) return;
    const ts = endOfDay(parseISODate(value));
    setCustomTo(ts);
    if (ts < customFrom) setCustomFrom(startOfDay(ts));
    setPeriod('custom');
  };

  /** Deals matching the current (not yet applied) selection — for the report. */
  const reportDeals = useMemo(() => {
    const range = periodRange({ symbol, period, customFrom, customTo });
    return getAllRows().filter(
      (d) =>
        d.type !== 'balance' &&
        (symbol == null || d.symbol === symbol) &&
        d.closeTime >= range.from &&
        d.closeTime <= range.to,
    );
  }, [symbol, period, customFrom, customTo]);

  const reportTitle = `История: ${symbol ?? 'Все символы'} · ${periodLabel({
    symbol,
    period,
    customFrom,
    customTo,
  })}`;

  /** Gray subtitle under «Создать торговый отчет» (period name or date range). */
  const reportSubtitle =
    period === 'custom'
      ? `${formatDate(customFrom)} – ${formatDate(customTo)}`
      : PERIOD_LABELS[period];

  const makeReport = (kind: 'html' | 'csv') => {
    if (kind === 'html') {
      const ok = openHtmlReport(reportDeals, reportTitle);
      setToast(ok ? 'Отчёт сформирован' : 'Разрешите всплывающие окна');
    } else {
      downloadCsvReport(reportDeals, reportTitle);
      setToast('Отчёт сформирован');
    }
  };

  const symbolActions = [
    {
      label: `${symbol == null ? '✓ ' : ''}Все символы`,
      onSelect: () => setSymbol(null),
    },
    ...SYMBOL_OPTIONS.map((s) => ({
      label: `${symbol === s ? '✓ ' : ''}${s}`,
      onSelect: () => setSymbol(s),
    })),
  ];

  /** «С:» / «По:» row with a gray date pill; tapping the pill opens the date input. */
  const pickerRow = (
    which: 'from' | 'to',
    label: string,
    value: number,
    onPick: (v: string) => void,
    last: boolean,
  ) => (
    <div className="bg-white">
      <div className="flex h-12 w-full items-center justify-between px-4">
        <span className="text-[17px] leading-[22px] tracking-[-0.41px]">{label}</span>
        <button
          type="button"
          onClick={() => setOpenPicker(openPicker === which ? null : which)}
          className="tnum rounded-[10px] bg-fill px-3 py-1.5 text-[17px] leading-[22px] text-black active:opacity-60"
        >
          {formatRuShortDate(value)}
        </button>
      </div>
      <AnimatePresence initial={false}>
        {openPicker === which && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            <div className="flex justify-center px-4 pb-3 pt-1">
              <input
                type="date"
                value={toISODate(value)}
                min={which === 'to' ? toISODate(customFrom) : undefined}
                max={which === 'from' ? toISODate(customTo) : toISODate(Date.now())}
                onChange={(e) => onPick(e.target.value)}
                className="tnum h-9 rounded-[10px] bg-fill px-3 text-[15px] text-accent outline-none"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!last && <RowSeparator />}
    </div>
  );

  return (
    <div className="flex min-h-full flex-col">
      <NavBar
        title="История"
        left={<BackButton onClick={() => navigate(-1)} />}
        rightVariant="confirm"
        right={
          <button
            type="button"
            aria-label="Применить"
            disabled={!dirty}
            onClick={apply}
            className={`flex h-10 w-10 items-center justify-center transition-opacity duration-150 active:opacity-70 ${
              dirty ? '' : 'opacity-40'
            }`}
          >
            <Check size={22} strokeWidth={2.5} />
          </button>
        }
      />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="flex-1 pb-8"
      >
        {/* Symbol */}
        <Card first>
          <button
            type="button"
            onClick={() => setSymbolSheet(true)}
            className="flex h-12 w-full items-center justify-between px-4 text-left active:bg-[#D9D9DE]"
          >
            <span className="text-[17px] leading-[22px] tracking-[-0.41px] text-black">
              Символ:
            </span>
            <span className="text-[17px] leading-[22px] tracking-[-0.41px] text-text-secondary">
              {symbol ?? 'Все символы'}
            </span>
          </button>
        </Card>

        {/* Periods */}
        <Card>
          {PERIOD_ROWS.map((row, i) => {
            const disabled = TEMP_DISABLED_PERIODS.has(row.value);
            return (
              <RadioRow
                key={row.value}
                label={row.label}
                selected={period === row.value}
                last={i === PERIOD_ROWS.length - 1}
                disabled={disabled}
                onSelect={() => {
                  if (!disabled) setPeriod(row.value);
                }}
              />
            );
          })}
        </Card>

        {/* Custom range (only for «Выбрать период») */}
        <AnimatePresence initial={false}>
          {period === 'custom' && (
            <motion.div
              key="custom-range"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
              className="overflow-hidden"
            >
              <Card>
                {pickerRow('from', 'С:', customFrom, pickCustomFrom, false)}
                {pickerRow('to', 'По:', customTo, pickCustomTo, true)}
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Trade report */}
        <Card>
          <button
            type="button"
            onClick={() => (TEMP_REPORT_DISABLED ? setToast('Режим просмотра') : setReportSheet(true))}
            className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left active:bg-[#D9D9DE]"
          >
            <span className="min-w-0">
              <span className="block text-[17px] leading-[22px] tracking-[-0.41px] text-black">
                Создать торговый отчет
              </span>
              <span className="mt-0.5 block truncate text-[13px] leading-[16px] text-text-secondary">
                {reportSubtitle}
              </span>
            </span>
            <ChevronRight size={18} strokeWidth={2.2} className="shrink-0 text-[#C7C7CC]" />
          </button>
        </Card>
      </motion.div>

      {/* Symbol sheet */}
      <ActionSheet
        open={symbolSheet}
        onClose={() => setSymbolSheet(false)}
        title="Символ"
        actions={symbolActions}
      />

      {/* Report sheet */}
      <ActionSheet
        open={reportSheet}
        onClose={() => setReportSheet(false)}
        title="Торговый отчёт"
        actions={[
          { label: 'HTML-отчёт', onSelect: () => makeReport('html') },
          { label: 'CSV-файл', onSelect: () => makeReport('csv') },
        ]}
      />

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
