export interface ConnectionCheckOptions {
  origin: string;
  apiBase: string;
  token: string | null;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

/** Support-only report. Never include tokens, account balances, logins or positions. */
export async function checkConnection(options: ConnectionCheckOptions): Promise<string> {
  const fetcher = options.fetcher ?? fetch;
  const api = new URL(options.apiBase.replace(/\/$/, '') + '/', options.origin);
  const lines = ['Диагностика связи v1', `Сайт: ${options.origin}`, `API: ${api.origin}${api.pathname}`, `Сессия: ${options.token ? 'есть' : 'нет'}`];
  const checks = await Promise.all(['health', 'auth/me', 'account', 'positions'].map(async route => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 12000);
    const started = Date.now();
    try {
      const response = await fetcher(new URL(route, api), {
        cache: 'no-store', signal: controller.signal,
        headers: route !== 'health' && options.token ? { Authorization: `Bearer ${options.token}` } : {},
      });
      const data = await response.json().catch(() => null);
      let detail = '';
      if (route === 'auth/me' && response.ok) detail = `; обслуживание: ${data?.tradeMaintenanceMode === true ? 'включено' : 'выключено'}`;
      if (response.ok && ((route === 'account' && !data?.account)
          || (route === 'positions' && !Array.isArray(data?.positions))
          || (route === 'health' && data?.status !== 'ok'))) detail += '; неверный формат ответа API';
      if (!response.ok && response.status === 401) detail = '; требуется повторный вход';
      return `${route}: HTTP ${response.status}, ${Date.now() - started} мс${detail}`;
    } catch (error) {
      return `${route}: ${(error as Error).name === 'AbortError' ? 'таймаут' : 'ошибка сети'}, ${Date.now() - started} мс`;
    } finally { clearTimeout(timeout); }
  }));
  return lines.concat(checks).join('\n');
}
