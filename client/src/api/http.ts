import { API_URL } from '@/config';
import { getToken, clearAuth } from './auth';

export class ApiError extends Error {
  status: number;
  detail?: string;
  constructor(status: number, message: string, detail?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

type Options = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  query?: Record<string, string | number | null | undefined>;
  signal?: AbortSignal;
};

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const { method = 'GET', body, auth = true, query, signal } = opts;

  const url = new URL(`${API_URL}${path}`, window.location.origin);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== null && v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'Нет связи с сервером');
  }

  if (res.status === 401 && auth) {
    clearAuth();
    // JWT expires after 12h (server/routes/auth.js) — a session left open
    // that long (or a token invalidated by a server restart) previously
    // just left the page stuck rendering an error/mock state forever,
    // since clearAuth() alone doesn't leave the authed route tree. Force
    // back to the login screen instead of leaving a logged-out client
    // sitting on a route that requires auth.
    if (!window.location.pathname.endsWith('/login')) {
      // Login.tsx redirects to «/» after a successful login — without this,
      // getting kicked out mid-admin-edit lands you back on Котировки with
      // no way back except manually retyping /admin (reported: "выбило в
      // котировки, нажать не могу"). Remember where we were, Login.tsx
      // reads it back once auth succeeds.
      try {
        sessionStorage.setItem('post-login-redirect', window.location.pathname + window.location.search);
      } catch {
        /* ignore */
      }
      window.location.href = `${window.location.origin}/mobile/login`;
    }
  }

  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      `Ошибка ${res.status}`;
    throw new ApiError(res.status, String(msg), data?.detail);
  }

  return data as T;
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
