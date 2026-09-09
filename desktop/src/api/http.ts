import { API_URL } from '@/config';
import { getToken, clearAuth } from './auth';

type Opts = { method?: string; body?: unknown; query?: Record<string, string | number | undefined> };

export async function api<T>(path: string, opts: Opts = {}): Promise<T> {
  const url = new URL(`${API_URL}${path}`, window.location.origin);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method: opts.method ?? 'GET', headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  if (res.status === 401) clearAuth();
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error || `Ошибка ${res.status}`);
  return data as T;
}
