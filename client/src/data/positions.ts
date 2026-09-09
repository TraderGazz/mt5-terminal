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

const store = createStore<Position[]>(POSITIONS, (set) => {
  if (!IS_API) return;
  fetchPositions().then((l) => set(fromApi(l))).catch(() => {});
  wsClient.on('positions', (d) => set(fromApi((d as ApiPosition[]) || [])));
});

export const usePositions = store.useValue;
export const getPositionsSnapshot = store.get;
