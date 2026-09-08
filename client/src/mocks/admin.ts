/** Admin panel mocks (design.md §8): users, import log, sync log. */

export type UserRole = 'admin' | 'trader' | 'viewer';

export interface AdminUser {
  id: number;
  name: string;
  login: number;
  role: UserRole;
  server: string;
  balance: number;
  lastActive: number;
}

const DAY = 86400_000;
const HOUR = 3600_000;
const NOW = Date.now();

export const ADMIN_USERS: AdminUser[] = [
  { id: 1, name: 'Иванов Иван Сергеевич', login: 50214896, role: 'admin', server: 'AlfaForex-Real', balance: 1250000.0, lastActive: NOW - 12 * 60000 },
  { id: 2, name: 'Петрова Анна Викторовна', login: 50214901, role: 'trader', server: 'AlfaForex-Real', balance: 480500.25, lastActive: NOW - 2 * HOUR },
  { id: 3, name: 'Сидоров Алексей Петрович', login: 50214914, role: 'trader', server: 'AlfaForex-Real', balance: 91230.0, lastActive: NOW - 26 * HOUR },
  { id: 4, name: 'Козлова Мария Дмитриевна', login: 50214927, role: 'trader', server: 'AlfaForex-Demo', balance: 100000.0, lastActive: NOW - 3 * DAY },
  { id: 5, name: 'Николаев Дмитрий Олегович', login: 50214935, role: 'viewer', server: 'AlfaForex-Real', balance: 0, lastActive: NOW - 5 * DAY },
  { id: 6, name: 'Федорова Елена Андреевна', login: 50214948, role: 'viewer', server: 'AlfaForex-Real', balance: 0, lastActive: NOW - 8 * DAY },
];

export type ImportStatus = 'ok' | 'error';

export interface ImportLogEntry {
  id: number;
  time: number;
  source: 'auto' | 'manual';
  fileName: string | null;
  records: number;
  status: ImportStatus;
  message: string;
}

export const IMPORT_LOG: ImportLogEntry[] = [
  { id: 8, time: NOW - 5 * 60000, source: 'auto', fileName: null, records: 3, status: 'ok', message: 'Синхронизация MT5 (авто, каждые 5 мин)' },
  { id: 7, time: NOW - 10 * 60000, source: 'auto', fileName: null, records: 0, status: 'ok', message: 'Синхронизация MT5 (авто, каждые 5 мин)' },
  { id: 6, time: NOW - 3 * HOUR, source: 'manual', fileName: 'report-50214896.html', records: 12, status: 'ok', message: 'Ручная загрузка HTML-отчёта' },
  { id: 5, time: NOW - 7 * HOUR, source: 'auto', fileName: null, records: 5, status: 'ok', message: 'Синхронизация MT5 (авто, каждые 5 мин)' },
  { id: 4, time: NOW - DAY, source: 'manual', fileName: 'StatementWeekly.html', records: 21, status: 'ok', message: 'Ручная загрузка HTML-отчёта' },
  { id: 3, time: NOW - DAY - 4 * HOUR, source: 'auto', fileName: null, records: 0, status: 'error', message: 'Таймаут соединения с сервером MT5' },
  { id: 2, time: NOW - 2 * DAY, source: 'auto', fileName: null, records: 8, status: 'ok', message: 'Синхронизация MT5 (авто, каждые 5 мин)' },
  { id: 1, time: NOW - 3 * DAY, source: 'manual', fileName: 'history-may.html', records: 34, status: 'ok', message: 'Ручная загрузка HTML-отчёта' },
];

export interface SyncLogEntry {
  id: number;
  time: number;
  direction: 'in' | 'out';
  records: number;
  status: ImportStatus;
  message: string;
}

export const SYNC_LOG: SyncLogEntry[] = [
  { id: 6, time: NOW - 5 * 60000, direction: 'in', records: 3, status: 'ok', message: 'Получено сделок из MT5' },
  { id: 5, time: NOW - 32 * 60000, direction: 'out', records: 1, status: 'ok', message: 'Отправлена правка сделки #90212954' },
  { id: 4, time: NOW - 2 * HOUR, direction: 'in', records: 0, status: 'ok', message: 'Получено сделок из MT5' },
  { id: 3, time: NOW - 5 * HOUR, direction: 'out', records: 2, status: 'ok', message: 'Отправлены правки баланса' },
  { id: 2, time: NOW - DAY - 4 * HOUR, direction: 'in', records: 0, status: 'error', message: 'Ошибка авторизации API MT5' },
  { id: 1, time: NOW - 2 * DAY, direction: 'in', records: 8, status: 'ok', message: 'Получено сделок из MT5' },
];

export interface SyncSettings {
  autoSync: boolean;
  intervalMin: number;
  lastSync: number;
  apiEndpoint: string;
}

export const SYNC_SETTINGS: SyncSettings = {
  autoSync: true,
  intervalMin: 5,
  lastSync: NOW - 5 * 60000,
  apiEndpoint: 'https://mt5.alfa-forex.example/api/sync',
};
