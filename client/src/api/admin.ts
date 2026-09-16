import { api } from './http';
import { API_URL } from '@/config';
import { getToken } from './auth';

export interface ApiAdminUser {
  id: number;
  login: string;
  role: 'admin' | 'trader' | 'viewer';
  name: string;
  active: boolean;
  created_at: string;
}

export const getUsers = () => api<{ users: ApiAdminUser[] }>('/admin/users').then((r) => r.users);

export const createUser = (body: {
  login: string;
  password: string;
  role: string;
  name?: string;
}) => api<{ user: ApiAdminUser }>('/admin/users', { method: 'POST', body }).then((r) => r.user);

export const updateUser = (
  id: number,
  body: Partial<{ role: string; name: string; password: string; active: boolean }>,
) => api<{ user: ApiAdminUser }>(`/admin/users/${id}`, { method: 'PATCH', body }).then((r) => r.user);

export const deleteUser = (id: number) =>
  api<{ deleted: true }>(`/admin/users/${id}`, { method: 'DELETE' });

// ---------- Import log ----------

export interface ApiImportLogEntry {
  id: number;
  filename: string;
  trades_count: number;
  source: string;
  user_id: number | null;
  user_login: string | null;
  created_at: string;
}

export const getImports = () =>
  api<{ imports: ApiImportLogEntry[] }>('/admin/imports').then((r) => r.imports);

/** Multipart-загрузка HTML-отчёта MT5 (server/routes/upload.js) — api() не
 * годится: он всегда JSON.stringify-ит body и шлёт application/json. */
export async function uploadMt5Report(
  file: File,
): Promise<{ message: string; inserted: number; skippedEdited: number; parsed: number }> {
  const token = getToken();
  const form = new FormData();
  form.append('report', file);
  const res = await fetch(`${API_URL}/upload/mt5-report`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || 'Не удалось загрузить отчёт');
  return data;
}

// ---------- Balance (accounts snapshot override) ----------

export interface ApiAdminAccount {
  id: number;
  balance: number;
  equity: number;
  margin: number;
  free_margin: number;
  margin_level: number;
  updated_at: string;
}

export const getAdminBalance = () =>
  api<{ account: ApiAdminAccount | null }>('/admin/balance').then((r) => r.account);

export const updateAdminBalance = (
  body: Partial<Pick<ApiAdminAccount, 'balance' | 'equity' | 'margin' | 'free_margin' | 'margin_level'>>,
) => api<{ account: ApiAdminAccount }>('/admin/balance', { method: 'PATCH', body }).then((r) => r.account);

// ---------- Sync settings (автообмен) ----------

export interface ApiSyncSettings {
  id: number;
  enabled: boolean;
  direction: string;
  reverse_enabled: boolean;
  updated_at: string;
}

export const getSyncSettings = () =>
  api<{ settings: ApiSyncSettings | null }>('/admin/sync-settings').then((r) => r.settings);

export const updateSyncSettings = (
  body: Partial<Pick<ApiSyncSettings, 'enabled' | 'direction' | 'reverse_enabled'>>,
) => api<{ settings: ApiSyncSettings }>('/admin/sync-settings', { method: 'PATCH', body }).then((r) => r.settings);

export interface ApiSyncLogEntry {
  id: number;
  direction: string;
  peer: string;
  status: 'ok' | 'error' | 'skipped';
  detail: string | null;
  created_at: string;
}

export const getSyncLog = () => api<{ log: ApiSyncLogEntry[] }>('/admin/sync-log').then((r) => r.log);

// ---------- Report export (server/routes/admin.js GET /report) ----------

/** Стримит готовый HTML/CSV-файл — api() не годится, тут не JSON. */
export async function fetchAdminReport(params: {
  format: 'html' | 'csv';
  from?: string;
  to?: string;
  symbol?: string;
}): Promise<{ blob: Blob; filename: string }> {
  const token = getToken();
  const qs = new URLSearchParams();
  qs.set('format', params.format);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.symbol) qs.set('symbol', params.symbol);
  const res = await fetch(`${API_URL}/admin/report?${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Не удалось сформировать отчёт');
  }
  const blob = await res.blob();
  const disp = res.headers.get('Content-Disposition') || '';
  const match = /filename="?([^"]+)"?/.exec(disp);
  const filename = match?.[1] || `report.${params.format}`;
  return { blob, filename };
}
