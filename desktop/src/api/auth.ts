import { API_URL } from '@/config';

const TOKEN_KEY = 'mt5pc-token';
const USER_KEY = 'mt5pc-user';

export interface AuthUser { id: number; login: string; role: string; name: string; }

export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const getUser = (): AuthUser | null => { try { const r = localStorage.getItem(USER_KEY); return r ? JSON.parse(r) : null; } catch { return null; } };
export const isAuthed = () => !!getToken();
export const clearAuth = () => { try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch { /* */ } };

export async function login(loginId: string, password: string): Promise<AuthUser> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: loginId, password }),
    });
  } catch { throw new Error('Нет связи с сервером'); }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.token) throw new Error(data?.error || 'Неверный логин или пароль');
  try { localStorage.setItem(TOKEN_KEY, data.token); localStorage.setItem(USER_KEY, JSON.stringify(data.user)); } catch { /* */ }
  return data.user;
}
export const logout = () => clearAuth();
