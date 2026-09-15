/**
 * Провайдер истории сделок. Тот же интерфейс, что у @/mocks-trade/editStore
 * + @/mocks/history. Мобильный фронт сам фильтрует/агрегирует/считает итоги
 * (дизайн заморожен) — здесь только источник строк.
 *   mock — editStore поверх @/mocks/history
 *   api  — /api/history/raw + WS 'trade', правки через PATCH /api/trades/:id
 */
import { useSyncExternalStore } from 'react';
import { IS_API } from '@/config';
import { BALANCE_OPS, CFD_OPS, HISTORY, type Deal } from '@/mocks/history';
import * as editStore from '@/mocks-trade/editStore';
import { wsClient } from '@/api/ws';
import { getHistoryRaw, patchTrade, type ApiHistoryRow } from '@/api/rest';

export type { Deal, DealType } from '@/mocks/history';
export type { DealPatch } from '@/mocks-trade/editStore';
import type { DealPatch } from '@/mocks-trade/editStore';

/* ------------------------------- api store ------------------------------- */

const ms = (v: string | null) => (v ? Date.parse(v) : 0);

function toDeal(r: ApiHistoryRow): Deal & { _id?: number } {
  return {
    ticket: r.ticket,
    order: r.orderTicket ?? 0,
    positionId: r.positionId ?? 0,
    symbol: r.symbol,
    type: (r.dealType === 'withdrawal' ? 'balance' : r.dealType) as Deal['type'],
    volume: r.volume,
    openTime: ms(r.openTime),
    openPrice: r.openPrice,
    closeTime: ms(r.closeTime),
    closePrice: r.closePrice,
    stopLoss: r.stopLoss,
    takeProfit: r.takeProfit,
    profit: r.profit,
    swap: r.swap,
    commission: r.commission,
    comment: r.comment,
    isEdited: !!r.isEdited,
    _id: r.id,
  };
}

let deals: Array<Deal & { _id?: number }> = [];
let balanceOps: Deal[] = [];
let cfdOps: Deal[] = [];
let version = 0;
let started = false;
// Пока первый /history/raw ещё не ответил, deals/balanceOps/cfdOps пусты —
// страница истории рендерила это как «нет сделок» на несколько секунд.
// loaded различает «правда пусто» от «ещё грузится». error — отдельно:
// backend недоступен (напр. сервер приостановлен) не должен читаться как
// «сделок действительно нет» — страница должна показать явную ошибку связи.
let loaded = false;
let hasError = false;
const listeners = new Set<() => void>();

function notify() {
  version += 1;
  listeners.forEach((l) => l());
}

async function refresh() {
  try {
    const raw = await getHistoryRaw();
    deals = raw.deals.map(toDeal);
    balanceOps = raw.balanceOps.map(toDeal);
    cfdOps = raw.cfdOps.map(toDeal);
    loaded = true;
    hasError = false;
    notify();
  } catch {
    loaded = true;
    hasError = true;
    notify();
  }
}

// Каждый опрос перекачивает ВЕСЬ /history/raw (тысячи строк). Пробовали
// увеличить до 60с ради экономии трафика — сразу заметили задержку появления
// новых сделок (закрытые сделки не показывались вовремя), заказчик и так
// уже мирится с небольшой задержкой, но не с такой. Раз gzip на сервере
// теперь реально работает (Content-Encoding: gzip подтверждён, ~230КБ уже
// сжатых на выдаче) — трафик не настолько критичен, чтобы жертвовать
// свежестью; вернули как было.
const POLL_MS = 20_000;

function ensureStarted() {
  if (started) return;
  started = true;
  void refresh();
  wsClient.on('trade', () => {
    // событие сделки — подтянуть свежую историю (с задержкой, дать backend записать)
    setTimeout(refresh, 800);
  });
  // Аварийный поллинг: у EA не работает push события 'trade' по WS, поэтому
  // без него новые закрытые сделки не появлялись бы до перезагрузки страницы.
  setInterval(() => {
    if (listeners.size) void refresh();
  }, POLL_MS);
}

function apiSubscribe(cb: () => void): () => void {
  ensureStarted();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const apiUseDealsVersion = () => useSyncExternalStore(apiSubscribe, () => version);
const apiUseHistoryLoaded = () => useSyncExternalStore(apiSubscribe, () => loaded);
const apiUseHistoryError = () => useSyncExternalStore(apiSubscribe, () => hasError);
const apiGetDeals = (): Deal[] => deals;
const apiGetDeal = (ticket: number): Deal | undefined => deals.find((d) => d.ticket === ticket);
const apiGetBalanceOps = (): Deal[] => balanceOps;
const apiGetCfdOps = (): Deal[] => cfdOps;
const apiGetAllRows = (): Deal[] => [...deals, ...balanceOps];

function apiUpdateDeal(ticket: number, patch: DealPatch): void {
  const row = deals.find((d) => d.ticket === ticket);
  // оптимистичное обновление
  if (row) {
    Object.assign(row, patch, { isEdited: true });
    notify();
  }
  const id = row?._id;
  if (!id) return;
  const body: Record<string, unknown> = {};
  if (patch.profit !== undefined) body.profit = patch.profit;
  if (patch.swap !== undefined) body.swap = patch.swap;
  if (patch.commission !== undefined) body.commission = patch.commission;
  if (patch.comment !== undefined) body.comment = patch.comment;
  if (patch.openPrice !== undefined) body.open_price = patch.openPrice;
  if (patch.closePrice !== undefined) body.close_price = patch.closePrice;
  if (patch.openTime !== undefined) body.open_time = new Date(patch.openTime).toISOString();
  if (patch.closeTime !== undefined) body.close_time = new Date(patch.closeTime).toISOString();
  patchTrade(id, body).then(refresh).catch(() => {});
}

function apiResetDeal(): void {
  // В api-режиме сброс правки не поддержан (нет истории оригинала на клиенте).
  void refresh();
}

/* ------------------------------- export ------------------------------- */

export const useDealsVersion = IS_API ? apiUseDealsVersion : editStore.useDealsVersion;
export const getDeals = IS_API ? apiGetDeals : editStore.getDeals;
export const getDeal = IS_API ? apiGetDeal : editStore.getDeal;
export const updateDeal = IS_API ? apiUpdateDeal : editStore.updateDeal;
export const resetDeal = IS_API ? apiResetDeal : editStore.resetDeal;

export const getBalanceOps = IS_API ? apiGetBalanceOps : (): Deal[] => BALANCE_OPS;
export const getCfdOps = IS_API ? apiGetCfdOps : (): Deal[] => CFD_OPS;
export const getAllRows = IS_API ? apiGetAllRows : (): Deal[] => HISTORY;
export const useHistoryLoaded = IS_API ? apiUseHistoryLoaded : () => true;
export const useHistoryError = IS_API ? apiUseHistoryError : () => false;
