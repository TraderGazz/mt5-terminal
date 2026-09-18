import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { motion } from 'framer-motion';
import { Briefcase, Minus, Plus } from 'lucide-react';
import AppShell from '@/components/AppShell';
import NavBar from '@/components/NavBar';
import ActionSheet from '@/components/ActionSheet';
import EditRow, { EDIT_INPUT_CLASS } from '@/components/trade/EditRow';
import { getDeal, updateDeal, useDealsVersion } from '@/data/history';
import { getSymbolMeta } from '@/mocks/symbols';
import type { Deal, DealPatch } from '@/data/history';
import { canEditTrades } from '@/components/auth/session';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** timestamp → "YYYY-MM-DDTHH:mm" (local, for datetime-local inputs). */
function toDateTimeInput(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "YYYY-MM-DDTHH:mm" → timestamp (NaN when incomplete). */
function fromDateTimeInput(value: string): number {
  return new Date(value).getTime();
}

/** "12,5" / "12.5" → 12.5 ; NaN when not a finite decimal. */
function parseDecimal(value: string): number {
  const n = Number(value.trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

type FieldKey =
  | 'profit'
  | 'swap'
  | 'commission'
  | 'comment'
  | 'openTime'
  | 'closeTime'
  | 'openPrice'
  | 'closePrice';

interface FormState {
  profit: string;
  swap: string;
  commission: string;
  comment: string;
  openTime: string;
  closeTime: string;
  openPrice: string;
  closePrice: string;
}

function initForm(deal: Deal, digits: number): FormState {
  return {
    profit: deal.profit.toFixed(2),
    swap: deal.swap.toFixed(2),
    commission: deal.commission.toFixed(2),
    comment: deal.comment,
    openTime: toDateTimeInput(deal.openTime),
    closeTime: toDateTimeInput(deal.closeTime),
    openPrice: deal.openPrice.toFixed(digits),
    closePrice: deal.closePrice.toFixed(digits),
  };
}

type Errors = Partial<Record<FieldKey, string>>;

/** Full validation per trade-edit.md. */
function validate(form: FormState, isBalance: boolean): Errors {
  const errors: Errors = {};
  if (!Number.isFinite(parseDecimal(form.profit))) errors.profit = 'Некорректное число';
  if (!Number.isFinite(parseDecimal(form.swap))) errors.swap = 'Некорректное число';
  if (!Number.isFinite(parseDecimal(form.commission))) errors.commission = 'Некорректное число';

  const open = fromDateTimeInput(form.openTime);
  const close = fromDateTimeInput(form.closeTime);
  if (!Number.isFinite(open)) {
    errors.openTime = 'Некорректная дата';
  } else if (Number.isFinite(close) && open > close) {
    errors.openTime = 'Время открытия позже закрытия';
  }
  if (!Number.isFinite(close)) {
    errors.closeTime = 'Некорректная дата';
  } else if (Number.isFinite(open) && close < open) {
    errors.closeTime = 'Время закрытия раньше открытия';
  }

  if (!isBalance) {
    const op = parseDecimal(form.openPrice);
    const cp = parseDecimal(form.closePrice);
    if (!Number.isFinite(op) || op <= 0) errors.openPrice = 'Цена должна быть больше 0';
    if (!Number.isFinite(cp) || cp <= 0) errors.closePrice = 'Цена должна быть больше 0';
  }
  return errors;
}

export default function TradeEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const ticket = Number(id);

  useEffect(() => {
    if (!canEditTrades()) navigate(`/trade/${ticket}`, { replace: true });
  }, [ticket, navigate]);

  useDealsVersion();
  const deal = getDeal(ticket);
  const digits = deal ? (getSymbolMeta(deal.symbol)?.digits ?? 5) : 5;
  const isBalance = deal?.type === 'balance';

  const initial = useMemo(
    () => (deal ? initForm(deal, digits) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ticket],
  );

  const [form, setForm] = useState<FormState | null>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [focused, setFocused] = useState<FieldKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [cancelSheet, setCancelSheet] = useState(false);
  const [resetSheet, setResetSheet] = useState(false);

  if (!deal || !form || !initial) {
    return (
      <AppShell>
        <div className="flex min-h-full flex-col bg-bg-secondary">
          <NavBar title="Редактирование" />
          <div className="flex flex-1 flex-col items-center justify-center gap-1 px-8 text-center">
            <Briefcase size={48} strokeWidth={1} className="text-text-secondary" />
            <p className="mt-2 text-[17px] font-semibold text-text-secondary">Сделка не найдена</p>
          </div>
        </div>
      </AppShell>
    );
  }

  const dirty = (Object.keys(form) as FieldKey[]).some(
    (k) => form[k] !== initial[k],
  );

  const setField = (key: FieldKey, value: string) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    // Clear the error of a field as soon as the user edits it.
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const blurField = (key: FieldKey) => {
    setFocused(null);
    // Dirty-check on blur (trade-edit.md)
    const errs = validate(form, isBalance ?? false);
    setErrors((e) => ({ ...e, [key]: errs[key] }));
  };

  const stepProfit = (delta: number) => {
    const cur = parseDecimal(form.profit);
    const next = (Number.isFinite(cur) ? cur : 0) + delta;
    setField('profit', next.toFixed(2));
  };

  const doSave = () => {
    const errs = validate(form, isBalance ?? false);
    setErrors(errs);
    if (Object.values(errs).some(Boolean) || saving) return;
    setSaving(true);
    // 800ms mock latency (trade-edit.md «Behavior on save»)
    setTimeout(() => {
      // Отправляем только РЕАЛЬНО изменённые поля. Важно для openTime/
      // closeTime: <input type="datetime-local"> хранит точность только до
      // минуты — если слать их всегда (даже нетронутыми), каждое сохранение
      // молча обнуляло секунды закрытия/открытия. На плотных по времени
      // сделках (несколько в одну минуту) это схлопывало их в одну и ту же
      // секунду, и они пропадали из выбранного периода/сортировки в Истории
      // (баг-репорт: "изменил три сделки, все они исчезли").
      const patch: DealPatch = {};
      if (form.profit !== initial.profit) patch.profit = parseDecimal(form.profit);
      if (form.swap !== initial.swap) patch.swap = parseDecimal(form.swap);
      if (form.commission !== initial.commission) patch.commission = parseDecimal(form.commission);
      if (form.comment !== initial.comment) patch.comment = form.comment.slice(0, 64);
      if (form.openTime !== initial.openTime) patch.openTime = fromDateTimeInput(form.openTime);
      if (form.closeTime !== initial.closeTime) patch.closeTime = fromDateTimeInput(form.closeTime);
      if (!isBalance) {
        if (form.openPrice !== initial.openPrice) patch.openPrice = parseDecimal(form.openPrice);
        if (form.closePrice !== initial.closePrice) patch.closePrice = parseDecimal(form.closePrice);
      }
      updateDeal(ticket, patch);
      // Auto-pop back to the detail page with a «Сохранено» toast.
      navigate(`/trade/${ticket}`, { replace: true, state: { saved: true } });
    }, 800);
  };

  const doCancel = () => {
    if (dirty) {
      setCancelSheet(true);
    } else {
      navigate(-1);
    }
  };

  const doReset = () => {
    // 300ms cross-fade feel: fade out, swap values, fade in
    setForm({ ...initial });
    setErrors({});
  };

  const saveDisabled = !dirty || saving;

  const moneyInput = (key: 'profit' | 'swap' | 'commission') => (
    <div className="relative">
      <input
        inputMode="decimal"
        value={form[key]}
        onChange={(e) => setField(key, e.target.value)}
        onFocus={() => setFocused(key)}
        onBlur={() => blurField(key)}
        className={`${EDIT_INPUT_CLASS} ${key === 'profit' ? 'pl-14' : ''} pr-5`}
        aria-label={key}
      />
      <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center text-[15px] text-text-secondary">
        ₽
      </span>
      {key === 'profit' && (
        <span className="absolute inset-y-0 left-0 flex items-center gap-1">
          <button
            type="button"
            aria-label="Минус 0.01"
            onClick={() => stepProfit(-0.01)}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-fill text-accent active:opacity-50"
          >
            <Minus size={14} strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label="Плюс 0.01"
            onClick={() => stepProfit(0.01)}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-fill text-accent active:opacity-50"
          >
            <Plus size={14} strokeWidth={2} />
          </button>
        </span>
      )}
    </div>
  );

  const dateInput = (key: 'openTime' | 'closeTime') => (
    <input
      type="datetime-local"
      value={form[key]}
      onChange={(e) => setField(key, e.target.value)}
      onFocus={() => setFocused(key)}
      onBlur={() => blurField(key)}
      className={`${EDIT_INPUT_CLASS} text-[14px]`}
      aria-label={key}
    />
  );

  const priceInput = (key: 'openPrice' | 'closePrice') => (
    <input
      inputMode="decimal"
      value={form[key]}
      onChange={(e) => setField(key, e.target.value)}
      onFocus={() => setFocused(key)}
      onBlur={() => blurField(key)}
      className={EDIT_INPUT_CLASS}
      aria-label={key}
    />
  );

  return (
    <AppShell>
      <div className="flex min-h-full flex-col bg-bg-secondary">
        <NavBar
          title="Редактирование"
          subtitle={`#${deal.ticket}`}
          left={
            <button
              type="button"
              onClick={doCancel}
              className="flex h-11 items-center px-2 text-[17px] text-accent active:opacity-50"
            >
              Отмена
            </button>
          }
          right={
            <button
              type="button"
              onClick={doSave}
              disabled={saveDisabled}
              className={`flex h-11 items-center px-2 text-[17px] font-semibold text-accent active:opacity-50 ${
                saveDisabled ? 'opacity-40' : ''
              }`}
            >
              {saving ? (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                  <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              ) : (
                'Сохранить'
              )}
            </button>
          }
        />

        {/* Form card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="m-4 overflow-hidden rounded-[10px] bg-white"
        >
          <EditRow label="Прибыль" error={errors.profit} focused={focused === 'profit'}>
            {moneyInput('profit')}
          </EditRow>
          <EditRow label="Своп" error={errors.swap} focused={focused === 'swap'}>
            {moneyInput('swap')}
          </EditRow>
          <EditRow label="Комиссия" error={errors.commission} focused={focused === 'commission'}>
            {moneyInput('commission')}
          </EditRow>
          <EditRow label="Комментарий" error={errors.comment} focused={focused === 'comment'}>
            <input
              type="text"
              maxLength={64}
              value={form.comment}
              onChange={(e) => setField('comment', e.target.value)}
              onFocus={() => setFocused('comment')}
              onBlur={() => blurField('comment')}
              placeholder="—"
              className={EDIT_INPUT_CLASS}
              aria-label="Комментарий"
            />
          </EditRow>
          <EditRow label="Время открытия" error={errors.openTime} focused={focused === 'openTime'}>
            {dateInput('openTime')}
          </EditRow>
          <EditRow
            label="Время закрытия"
            error={errors.closeTime}
            focused={focused === 'closeTime'}
            last={isBalance}
          >
            {dateInput('closeTime')}
          </EditRow>
          {!isBalance && (
            <EditRow label="Цена открытия" error={errors.openPrice} focused={focused === 'openPrice'}>
              {priceInput('openPrice')}
            </EditRow>
          )}
          {!isBalance && (
            <EditRow
              label="Цена закрытия"
              error={errors.closePrice}
              focused={focused === 'closePrice'}
              last
            >
              {priceInput('closePrice')}
            </EditRow>
          )}
        </motion.div>

        {/* Info note */}
        <p className="mx-6 mb-4 text-center text-[12px] leading-[16px] text-text-secondary">
          После сохранения сделка будет помечена как «(изм.)» в истории. Исходные значения
          сохраняются в журнале изменений.
        </p>

        {/* Bottom actions */}
        <div className="mx-4 mb-6 mt-2 flex flex-col gap-3">
          <motion.button
            type="button"
            whileTap={{ scale: 0.97, opacity: 0.85 }}
            transition={{ duration: 0.12 }}
            onClick={doSave}
            disabled={saveDisabled}
            className={`flex h-[50px] w-full items-center justify-center rounded-[12px] bg-accent text-[17px] font-semibold text-white ${
              saveDisabled ? 'opacity-40' : ''
            }`}
          >
            {saving ? (
              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            ) : (
              'Сохранить'
            )}
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.97, opacity: 0.85 }}
            transition={{ duration: 0.12 }}
            onClick={() => dirty && setResetSheet(true)}
            className={`h-[50px] w-full rounded-[12px] border border-loss bg-transparent text-[17px] font-semibold text-loss ${
              dirty ? '' : 'opacity-40'
            }`}
          >
            Сбросить изменения
          </motion.button>
        </div>

        {/* Cancel confirmation */}
        <ActionSheet
          open={cancelSheet}
          onClose={() => setCancelSheet(false)}
          title="Отменить изменения?"
          actions={[
            { label: 'Отменить правки', destructive: true, onSelect: () => navigate(-1) },
            { label: 'Продолжить редактирование' },
          ]}
        />

        {/* Reset confirmation */}
        <ActionSheet
          open={resetSheet}
          onClose={() => setResetSheet(false)}
          title="Сбросить правки?"
          actions={[{ label: 'Сбросить', destructive: true, onSelect: doReset }]}
        />
      </div>
    </AppShell>
  );
}
