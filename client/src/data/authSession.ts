/**
 * Периодически перепроверяет роль текущего пользователя через GET /auth/me
 * (JWT несёт роль как снимок на момент логина, до 12ч) и обновляет
 * закэшированного пользователя + реактивный стор, если роль поменялась в
 * админке. Нужно, чтобы смена роли (например investor → viewer) применялась
 * сама, без просьбы перезайти — инвестору такое лучше вообще не говорить.
 * Заодно это даёт побочный эффект: authRequired на сервере уже проверяет
 * active при каждом запросе — этот поллинг делает то же самое даже на
 * страницах, которые иначе редко дёргают API, так что отключение учётки
 * (см. admin.md «отключить пользователя») тоже подхватывается быстрее.
 */
import { createStore } from './store';
import { IS_API } from '@/config';
import { api } from '@/api/http';
import { getAuthUser, isAuthed, updateAuthUserRole } from '@/api/auth';
import type { AuthUser } from '@/api/auth';

const POLL_MS = 20_000;

// Видимость Истории для роли viewer — тумблер в админке (app_settings),
// приходит тем же /auth/me, что и роль, так что читаем его в этом же
// тике, без отдельного цикла опроса. null = ещё не пришло (до первого
// тика) — используется как «пока не знаем», см. useHistoryVisibleToViewer.
const historyVisibleStore = createStore<boolean | null>(null);

const roleStore = createStore<AuthUser['role'] | null>(getAuthUser()?.role ?? null, (set) => {
  if (!IS_API) return;
  const tick = () => {
    if (!isAuthed()) return;
    api<{ user: { role: AuthUser['role'] }; historyVisibleToViewer: boolean }>('/auth/me')
      .then(({ user, historyVisibleToViewer }) => {
        updateAuthUserRole(user.role);
        set(user.role);
        historyVisibleStore.set(historyVisibleToViewer);
      })
      .catch(() => {
        // 401 (роль/деактивация) уже обрабатывается глобально в api/http.ts.
      });
  };
  tick();
  setInterval(tick, POLL_MS);
});

export const useLiveRole = () => roleStore.useValue();
// true, пока не пришёл первый ответ /auth/me (не прячем Историю на миг
// загрузки страницы) и в мок-режиме без бэкенда.
export const useHistoryVisibleToViewer = () => historyVisibleStore.useValue() ?? true;
