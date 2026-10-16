import { Router } from 'express';
import { authRequired } from './auth.js';
import { getBridge } from '../services/mt5-bridge/index.js';
import { query, isDbReady } from '../db.js';

const router = Router();

// GET /api/account — снимок счёта для страниц «Торговля» / «Настройки».
// Источник: MT5-мост (live). Реквизиты (ФИО/компания) — из БД, если есть.
router.get('/', authRequired, async (req, res) => {
  const bridge = getBridge();
  try {
    const acc = await bridge.account();

    let stored = null;
    if (isDbReady()) {
      try {
        const { rows } = await query(
          'SELECT account_number, holder, company, server, access_server, currency FROM accounts ORDER BY id LIMIT 1'
        );
        stored = rows[0] || null;
      } catch { /* БД не обязательна */ }
    }

    res.json({
      account: {
        // Заявка заказчика 2026-10-16: можно переименовать брокера на
        // отображении (компания/сервер/номер), не переключаясь на другой
        // реальный счёт — поэтому для ЭТИХ полей сохранённое в БД (admin
        // правит через /api/admin/branding) главнее, чем то, что реально
        // прислал мост.
        login: stored?.account_number || acc.login || '',
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
      },
      source: bridge.status(),
    });
  } catch (err) {
    console.error('[account] error:', err.message);
    res.status(502).json({ error: 'MT5-мост недоступен', detail: err.message });
  }
});

export default router;
