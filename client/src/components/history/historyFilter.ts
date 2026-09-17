import { useSyncExternalStore } from 'react';
import { formatDate } from '@/lib/format';

/**
 * Shared history filter state (design.md history-period.md): the period page
 * writes the selection here, the history page subscribes and re-filters.
 * Module-level store so the state survives route changes without editing
 * shared files (App.tsx / context providers).
 */

export type PeriodKind = 'today' | 'week' | 'month' | '3m' | '6m' | 'year' | 'custom';

export interface HistoryFilterState {
  /** null = «Все символы». */
  symbol: string | null;
  period: PeriodKind;
  /** Custom range («с»), start of day, ms. */
  customFrom: number;
  /** Custom range («по»), end of day, ms. */
  customTo: number;
}

export const DAY = 86400_000;

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** Monday 00:00 of the calendar week containing ts (MT5-style «На этой
 *  неделе», not a rolling 7-day lookback). */
export function startOfWeek(ts: number): number {
  const d = new Date(ts);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function defaultState(): HistoryFilterState {
  const now = Date.now();
  // ВРЕМЕННО «Последний год» вместо «6 месяцев» — период 6m сейчас скрыт
  // из выбора (HistoryPeriod.tsx TEMP_DISABLED_PERIODS), дефолт не должен
  // указывать на недоступный вариант. Вернуть на '6m' вместе с тем флагом.
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  return {
    symbol: null,
    period: 'year',
    customFrom: startOfDay(sixMonthsAgo.getTime()),
    customTo: endOfDay(now),
  };
}

let state: HistoryFilterState = defaultState();
const listeners = new Set<() => void>();

export function getHistoryFilter(): HistoryFilterState {
  return state;
}

export function setHistoryFilter(next: HistoryFilterState): void {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Reactive access to the shared history filter. */
export function useHistoryFilter(): HistoryFilterState {
  return useSyncExternalStore(subscribe, getHistoryFilter);
}

/* ------------------------------------------------------------------ */

export interface PeriodRange {
  from: number;
  to: number;
}

/** Resolves the selected period to an absolute [from, to] range in ms. */
export function periodRange(f: HistoryFilterState, now: number = Date.now()): PeriodRange {
  switch (f.period) {
    case 'today':
      return { from: startOfDay(now), to: now };
    case 'week':
      return { from: startOfWeek(now), to: now };
    // MT5 считает «месяц» здесь не календарным (28-31 день), а фиксированными
    // 29 днями — сверено напрямую с оригиналом: «месяц»/«3 месяца» дали ровно
    // 29 и 29×3=87 дней назад (совпало день-в-день), «6 месяцев» не удалось
    // сверить впрямую — там граница упёрлась в фактическое начало истории
    // счёта раньше, чем настал бы расчётный рубеж 29×6=174 дня.
    case 'month':
      return { from: now - 29 * DAY, to: now };
    case '3m':
      return { from: now - 3 * 29 * DAY, to: now };
    case '6m':
      return { from: now - 6 * 29 * DAY, to: now };
    case 'year': {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return { from: d.getTime(), to: now };
    }
    case 'custom':
      return { from: f.customFrom, to: f.customTo };
  }
}

export const PERIOD_LABELS: Record<PeriodKind, string> = {
  today: 'Сегодня',
  week: 'Последняя неделя',
  month: 'Последний месяц',
  '3m': 'Последние 3 месяца',
  '6m': 'Последние 6 месяцев',
  year: 'Последний год',
  custom: 'Свой период',
};

/** Human label of the current selection (for subtitles / reports). */
export function periodLabel(f: HistoryFilterState): string {
  if (f.period === 'custom') return `${formatDate(f.customFrom)} — ${formatDate(f.customTo)}`;
  return PERIOD_LABELS[f.period];
}
