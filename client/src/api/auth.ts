import { API_URL } from '@/config';

/** JWT реального backend. Ключ отдельный от мок-сессии (`terminal-session`). */
const TOKEN_KEY = 'terminal-auth-token';
const USER_KEY = 'terminal-auth-user';

export interface AuthUser {
  id: number;
  login: string;
  role: 'admin' | 'trader' | 'viewer';
  name: string;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getAuthUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function isAuthed(): boolean {
  return !!getToken();
}

export function clearAuth(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

/** Логин против backend. Бросает Error с текстом для отображения в форме. */
export async function login(loginId: string, password: string): Promise<AuthUser> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: loginId, password }),
    });
  } catch {
    throw new Error('Нет связи с сервером');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.token) {
    throw new Error(data?.error || 'Неверный логин или пароль');
  }
  try {
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  } catch {
    /* private mode */
  }
  return data.user as AuthUser;
}

export function logout(): void {
  clearAuth();
}
