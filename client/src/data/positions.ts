/** Провайдер открытых позиций. Интерфейс Position — как у @/mocks/positions. */
import { IS_API } from '@/config';
import { POSITIONS, type Position } from '@/mocks/positions';
import { wsClient } from '@/api/ws';
import { getPositions as fetchPositions, type ApiPosition } from '@/api/rest';
import { createStore } from './store';

export type { Position };

function fromApi(list: ApiPosition[]): Position[] {
  return list.map((p) => ({
    id: p.id,
    symbol: p.symbol,
    type: p.type,
    volume: p.volume,
    openPrice: p.openPrice,
    openTime: p.openTime ? new Date(p.openTime).getTime() : Date.now(),
    currentPrice: p.currentPrice,
    profit: p.profit,
    swap: p.swap,
    commission: p.commission,
    stopLoss: p.stopLoss,
    takeProfit: p.takeProfit,
  }));
}

// Пока первый реальный ответ не пришёл, useValue() отдаёт мок-снапшот
// POSITIONS как есть — на реальном счёте это выглядит как «мигание»
// посторонними цифрами перед загрузкой. readyStore даёт страницам различить
// «ещё грузится» (mock=заглушка) от «это и есть реальные данные».
//
// errorStore — отдельно: если backend недоступен (например, сервер
// приостановлен), fetch падает, ready всё равно становится true (чтобы не
// висеть спиннером вечно), но БЕЗ errorStore страница в этом случае молча
// показывала бы мок-заглушку (POSITIONS) как будто это настоящий счёт —
// реальный случай: заказчик приостановил сервер, инвестор увидел вымышленные
// позиции/баланс как настоящие. Страница должна вместо этого показать явную
// ошибку соединения.
const readyStore = createStore<boolean>(!IS_API);
const errorStore = createStore<boolean>(false);

const store = createStore<Position[]>(POSITIONS, (set) => {
  if (!IS_API) return;
  fetchPositions()
    .then((l) => {
      set(fromApi(l));
      errorStore.set(false);
    })
    .catch(() => errorStore.set(true))
    .finally(() => readyStore.set(true));
  wsClient.on('positions', (d) => {
    set(fromApi((d as ApiPosition[]) || []));
    errorStore.set(false);
    readyStore.set(true);
  });
});

export const usePositions = store.useValue;
export const getPositionsSnapshot = store.get;
export const usePositionsReady = readyStore.useValue;
export const usePositionsError = errorStore.useValue;

// Форс-обновление сразу после открытия/закрытия сделки (admin, Trade.tsx) —
// не ждать следующего WS-пуша (интервал синхронизации ~30с), пользователь
// должен увидеть результат своего действия сразу же.
export function refreshPositions(): Promise<void> {
  if (!IS_API) return Promise.resolve();
  return fetchPositions()
    .then((l) => {
      store.set(fromApi(l));
      errorStore.set(false);
    })
    .catch(() => errorStore.set(true));
}
