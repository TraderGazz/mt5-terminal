// Снимок счёта с наложенным Брендингом (заявка заказчика 2026-10-16/17) —
// общая логика для REST GET /api/account И для WS-пуша канала 'account'
// (server/services/ws-hub.js). Раньше WS слал СЫРОЙ bridge.account()
// напрямую, без этого слияния — через секунду-другую после загрузки
// страницы он затирал правильные (отредактированные) холдер/компанию/
// сервер обратно на настоящие/моковые дефолты (баг-репорт 2026-10-17:
// "Настройки" показывают старый бренд, хотя БД и REST-ответ уже верные).
import { query, isDbReady } from '../db.js';

export async function buildAccountView(bridge) {
  const acc = await bridge.account();

  let stored = null;
  if (isDbReady()) {
    try {
      const { rows } = await query(
        'SELECT display_login, holder, company, server, access_server, currency FROM accounts WHERE account_number = $1',
        [String(acc.login || '')],
      );
      stored = rows[0] || null;
    } catch { /* БД не обязательна */ }
  }

  return {
    login: stored?.display_login || acc.login || '',
    holder: stored?.holder || acc.name || '',
    company: stored?.company || 'ООО «Альфа-Форекс»',
    server: stored?.server || acc.server || '',
    accessServer: stored?.access_server || '',
    currency: acc.currency || stored?.currency || 'RUB',
    leverage: acc.leverage,
    balance: acc.balance,
    equity: acc.equity,
    margin: acc.margin,
    freeMargin: acc.freeMargin,
    marginLevel: acc.marginLevel,
    floatingProfit: acc.floatingProfit,
  };
}
