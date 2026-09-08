/**
 * Embed History — filter bar (embed-history.md §1): symbol + period chip
 * dropdowns. Popover: dropdown anchored under the chip (slides up on mobile).
 */
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface PeriodPreset {
  id: string;
  label: string;
  days: number;
}

export const PERIOD_PRESETS: PeriodPreset[] = [
  { id: 'today', label: 'Сегодня', days: 0 },
  { id: 'yesterday', label: 'Вчера', days: 1 },
  { id: 'week', label: 'Последняя неделя', days: 7 },
  { id: 'month', label: 'Последний месяц', days: 30 },
  { id: 'quarter', label: 'Последние 3 месяца', days: 90 },
  { id: 'all', label: 'Всё время', days: Infinity },
];

interface Option {
  id: string;
  label: string;
}

function Chip({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={label}
        className="flex items-center gap-1 rounded-full bg-[rgba(0,122,255,0.08)] px-3 py-1.5 text-[13px] font-medium text-accent active:opacity-80"
      >
        {options.find((o) => o.id === value)?.label ?? label}
        <ChevronDown size={14} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-[rgba(0,0,0,0.25)] sm:bg-transparent"
            />
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
              className="fixed inset-x-3 bottom-3 z-50 rounded-[12px] bg-white py-1 shadow-[0_8px_32px_rgba(0,0,0,0.18)] sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-10 sm:min-w-[220px]"
            >
              {options.map((o) => {
                const active = o.id === value;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => {
                      onChange(o.id);
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[15px] active:bg-fill hover:bg-[#F7F7FA]"
                  >
                    <span className={active ? 'font-medium text-accent' : 'text-black'}>
                      {o.label}
                    </span>
                    {active && <Check size={16} className="text-accent" />}
                  </button>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function EmbedFilterBar({
  symbols,
  symbol,
  onSymbol,
  period,
  onPeriod,
}: {
  symbols: string[];
  symbol: string;
  onSymbol: (s: string) => void;
  period: string;
  onPeriod: (p: string) => void;
}) {
  return (
    <div className="hairline-b flex items-center gap-2 bg-white px-4 py-2.5">
      <Chip
        label="Все символы"
        value={symbol}
        onChange={onSymbol}
        options={[
          { id: 'all', label: 'Все символы' },
          ...symbols.map((s) => ({ id: s, label: s })),
        ]}
      />
      <Chip
        label="Период"
        value={period}
        onChange={onPeriod}
        options={PERIOD_PRESETS.map((p) => ({ id: p.id, label: p.label }))}
      />
    </div>
  );
}
