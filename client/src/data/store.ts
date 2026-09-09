import { useSyncExternalStore } from 'react';

/**
 * Крошечный reactive-стор для провайдеров данных (mock|api).
 * initial — значение по умолчанию (мок-снапшот), start — подписка на источник
 * в режиме api (вызывается один раз при первом подписчике).
 */
export function createStore<T>(initial: T, start?: (set: (v: T) => void) => void) {
  let value = initial;
  let started = false;
  const listeners = new Set<() => void>();

  const set = (v: T) => {
    value = v;
    listeners.forEach((l) => l());
  };

  const subscribe = (cb: () => void) => {
    listeners.add(cb);
    if (!started && start) {
      started = true;
      start(set);
    }
    return () => {
      listeners.delete(cb);
    };
  };

  const get = () => value;

  return {
    set,
    get,
    useValue: () => useSyncExternalStore(subscribe, get),
  };
}
