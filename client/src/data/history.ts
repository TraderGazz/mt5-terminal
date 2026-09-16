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
import { getHistoryRaw, patchTrade, type ApiHistoryRow, type ApiDealLeg } from '@/api/rest';

export type { Deal, DealType } from '@/mocks/history';

/**
 * Сырая сделка (открытие/закрытие раздельно) — для вкладки «Сделки», 1-в-1 с
 * оригинальным MT5 (там открытие и закрытие — ДВЕ отдельные строки, а не
 * слитая позиция, как в Deal/aggregatePositions). См. deal_legs в БД.
 */
export interface DealLeg {
  ticket: number;
  positionId: number;
  orderTicket: number;
  symbol: string;
  type: 'buy' | 'sell' | null;
  entry: 'in' | 'out' | 'inout' | '';
  dealType: 'buy' | 'sell' | 'balance' | 'cfd';
  volume: number;
  price: number;
  stopLoss: number;
  takeProfit: number;
  profit: number;
  swap: number;
  commission: number;
  time: number;
  comment: string;
  isEdited: boolean;
}
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

function toLeg(r: ApiDealLeg): DealLeg {
  return {
    ticket: r.ticket,
    positionId: r.positionId ?? 0,
    orderTicket: r.orderTicket ?? 0,
    symbol: r.symbol,
    type: r.type,
    entry: r.entry,
    dealType: (r.dealType === 'withdrawal' ? 'balance' : r.dealType) as DealLeg['dealType'],
    volume: r.volume,
    price: r.price,
    stopLoss: r.stopLoss,
    takeProfit: r.takeProfit,
    profit: r.profit,
    swap: r.swap,
    commission: r.commission,
    time: ms(r.time),
    comment: r.comment,
    isEdited: !!r.isEdited,
  };
}

let deals: Array<Deal & { _id?: number }> = [];
let balanceOps: Deal[] = [];
let cfdOps: Deal[] = [];
let dealLegs: DealLeg[] = [];
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
    dealLegs = raw.dealLegs.map(toLeg);
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
const apiGetDealLegs = (): DealLeg[] => dealLegs;

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

// Мок-режим не хранит настоящих отдельных open/close сделок — синтезируем
// по 2 ноги (in/out) на позицию из мока, чтобы вкладка «Сделки» выглядела
// так же по форме, как в api-режиме (только для демо, не для сверки).
let mockLegsCache: DealLeg[] | null = null;
function mockDealLegs(): DealLeg[] {
  if (mockLegsCache) return mockLegsCache;
  const legs: DealLeg[] = [];
  for (const d of HISTORY) {
    if (d.type === 'buy' || d.type === 'sell') {
      legs.push({
        ticket: d.ticket * 2 - 1,
        positionId: d.positionId,
        orderTicket: d.order,
        symbol: d.symbol,
        type: d.type,
        entry: 'in',
        dealType: d.type,
        volume: d.volume,
        price: d.openPrice,
        stopLoss: 0,
        takeProfit: 0,
        profit: 0,
        swap: 0,
        commission: 0,
        time: d.openTime,
        comment: '',
        isEdited: false,
      });
      legs.push({
        ticket: d.ticket * 2,
        positionId: d.positionId,
        orderTicket: d.order,
        symbol: d.symbol,
        type: d.type === 'buy' ? 'sell' : 'buy',
        entry: 'out',
        dealType: d.type,
        volume: d.volume,
        price: d.closePrice,
        stopLoss: d.stopLoss,
        takeProfit: d.takeProfit,
        profit: d.profit,
        swap: d.swap,
        commission: d.commission,
        time: d.closeTime,
        comment: d.comment,
        isEdited: d.isEdited,
      });
    } else {
      legs.push({
        ticket: d.ticket,
        positionId: 0,
        orderTicket: 0,
        symbol: d.symbol,
        type: null,
        entry: 'out',
        dealType: d.type,
        volume: 0,
        price: 0,
        stopLoss: 0,
        takeProfit: 0,
        profit: d.profit,
        swap: d.swap,
        commission: d.commission,
        time: d.closeTime,
        comment: d.comment,
        isEdited: d.isEdited,
      });
    }
  }
  mockLegsCache = legs.sort((a, b) => b.time - a.time);
  return mockLegsCache;
}

export const getDealLegs = IS_API ? apiGetDealLegs : mockDealLegs;
export const useHistoryLoaded = IS_API ? apiUseHistoryLoaded : () => true;
export const useHistoryError = IS_API ? apiUseHistoryError : () => false;
