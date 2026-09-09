/**
 * Источник данных приложения.
 *   VITE_DATA_SOURCE=mock  — встроенные моки (по умолчанию, демо-режим)
 *   VITE_DATA_SOURCE=api   — реальный backend (REST + WebSocket)
 *
 * Дизайн заморожен: переключение источника не меняет вёрстку, только данные.
 */
export type DataSource = 'mock' | 'api';

export const DATA_SOURCE: DataSource =
  (import.meta.env.VITE_DATA_SOURCE as DataSource | undefined) ?? 'mock';

export const IS_API = DATA_SOURCE === 'api';

/** База REST API. По умолчанию — относительный путь (Vite-прокси / nginx). */
export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

/** Единственный торговый инструмент (уточнение заказчика). */
export const SYMBOL = (import.meta.env.VITE_SYMBOL as string | undefined) ?? 'EURUSD';

/** URL WebSocket-хаба. */
export function wsUrl(token: string): string {
  const explicit = import.meta.env.VITE_WS_URL as string | undefined;
  const base =
    explicit ??
    (typeof window !== 'undefined'
      ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`
      : 'ws://localhost:4000/ws');
  return `${base}?token=${encodeURIComponent(token)}`;
}
