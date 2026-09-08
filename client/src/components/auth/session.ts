import { ADMIN_USERS } from '@/mocks/admin';
import type { UserRole } from '@/mocks/admin';

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

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
