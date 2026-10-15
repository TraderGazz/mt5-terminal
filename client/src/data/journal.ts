import { useSyncExternalStore } from 'react';

/**
 * Локальный журнал действий (заявка заказчика: «Настройки → Журнал» была
 * заглушкой «Режим просмотра»). Хранится в этом браузере (localStorage) —
 * не на сервере: это личный журнал устройства, как в оригинальном MT5
 * (там тоже локальный, per-терминал). Пишем значимые события — вход,
 * сделки, правка SL/TP — не каждый клик/навигацию (иначе журнал был бы
 * нечитаемым шумом).
 */

export interface JournalEntry {
  time: number;
  message: string;
}

const STORAGE_KEY = 'mt5-journal';
const MAX_ENTRIES = 300;

let entries: JournalEntry[] = load();
const listeners = new Set<() => void>();

function load(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* quota/приватный режим — журнал просто не переживёт перезагрузку */
  }
}

function notify() {
  listeners.forEach((l) => l());
}

export function logEvent(message: string): void {
  entries = [...entries, { time: Date.now(), message }].slice(-MAX_ENTRIES);
  persist();
  notify();
}

export function clearJournal(): void {
  entries = [];
  persist();
  notify();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): JournalEntry[] {
  return entries;
}

export function useJournal(): JournalEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}
