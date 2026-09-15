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
  }));
}

// Пока первый реальный ответ не пришёл, useValue() отдаёт мок-снапшот
// POSITIONS как есть — на реальном счёте это выглядит как «мигание»
// posторонними цифрами перед загрузкой. readyStore даёт страницам различить
// «ещё грузится» (mock=заглушка) от «это и есть реальные данные».
const readyStore = createStore<boolean>(!IS_API);

const store = createStore<Position[]>(POSITIONS, (set) => {
  if (!IS_API) return;
  fetchPositions()
    .then((l) => set(fromApi(l)))
    .catch(() => {})
    .finally(() => readyStore.set(true));
  wsClient.on('positions', (d) => {
    set(fromApi((d as ApiPosition[]) || []));
    readyStore.set(true);
  });
});

export const usePositions = store.useValue;
export const getPositionsSnapshot = store.get;
export const usePositionsReady = readyStore.useValue;
