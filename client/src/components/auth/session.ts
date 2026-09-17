import { ADMIN_USERS } from '@/mocks/admin';
import type { UserRole } from '@/mocks/admin';
import { IS_API } from '@/config';
import { getAuthUser } from '@/api/auth';
import { useLiveRole } from '@/data/authSession';

/**
 * Mock auth session stored in localStorage (auth.md / settings.md).
 * Role is resolved from the admin users mock by numeric login; unknown
 * logins fall back to 'trader' (no admin entry point in Settings).
 */

const KEY = 'terminal-session';

export interface Session {
  login: string;
  role: UserRole;
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (typeof parsed.login !== 'string' || parsed.login.length === 0) return null;
    return { login: parsed.login, role: parsed.role ?? 'trader' };
  } catch {
    return null;
  }
}

export function startSession(login: string): Session {
  const numeric = Number(login);
  const user = ADMIN_USERS.find((u) => u.login === numeric);
  const session: Session = { login, role: user?.role ?? 'trader' };
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* private mode — session is memory-only */
  }
  return session;
}

/**
 * Текущая роль пользователя. В api-режиме — из реального JWT (`getAuthUser`),
 * НЕ из мок-сессии (`startSession` резолвит роль по ADMIN_USERS и в api-
 * режиме тоже, но это только для отображения имени — для прав доступа это
 * ненадёжно, т.к. номер логина реального пользователя может не совпадать
 * ни с одной записью в моках).
 */
export function currentRole(): UserRole {
  if (IS_API) return (getAuthUser()?.role as UserRole | undefined) ?? 'trader';
  return getSession()?.role ?? 'trader';
}

/** Редактирование сделок/торговля на сайте — только admin (заявка заказчика). */
export function canEditTrades(): boolean {
  return currentRole() === 'admin';
}

/**
 * Реактивная версия currentRole() — переподхватывает смену роли из
 * authSession.ts (периодический /auth/me) без перезахода. В mock-режиме
 * роль не меняется динамически, отдаём статичное значение как есть (IS_API
 * не меняется в рантайме, так что условный вызов хука тут безопасен).
 */
export function useCurrentRole(): UserRole {
  // Хук вызывается безусловно (Rules of Hooks) — стор в мок-режиме просто
  // никогда не обновляется (authSession.ts не стартует поллинг без IS_API).
  const live = useLiveRole();
  if (IS_API) return (live as UserRole | null) ?? currentRole();
  return currentRole();
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
