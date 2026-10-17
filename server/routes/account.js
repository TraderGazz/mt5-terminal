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
        // ВАЖНО: ищем строго по account_number = реальный логин моста, а не
        // "ORDER BY id LIMIT 1" — mt5-sync.js тоже ключуется по account_number
        // (ON CONFLICT), и если строк несколько (см. баг-репорт 2026-10-17:
        // смена display_login раньше велась через сам account_number,
        // синк не узнавал счёт и плодил новую строку с пустым брендингом),
        // упавшая "первая по id" могла оказаться вообще не той.
        const { rows } = await query(
          'SELECT display_login, holder, company, server, access_server, currency FROM accounts WHERE account_number = $1',
          [String(acc.login || '')],
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
        // прислал мост. display_login — ОТДЕЛЬНАЯ колонка от account_number:
        // последний остаётся настоящим и используется синхронизацией как
        // ключ, его трогать нельзя.
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
      },
      source: bridge.status(),
    });
  } catch (err) {
    console.error('[account] error:', err.message);
    res.status(502).json({ error: 'MT5-мост недоступен', detail: err.message });
  }
});

// GET /api/account/public-branding — название компании/сервера для ЭКРАНА
// ВХОДА (до авторизации — токена ещё нет, обычный /api/account сюда не
// подходит). Только текст для отображения, никаких финансовых/личных
// данных — поэтому без authRequired.
router.get('/public-branding', async (req, res) => {
  let stored = null;
  if (isDbReady()) {
    try {
      // Нет токена — не можем спросить мост "какой реальный логин сейчас",
      // поэтому берём строку, где явно заполнен display_login (её и правит
      // admin через Брендинг), а не просто первую по id (см. баг-репорт
      // 2026-10-17 про дублирующиеся строки от синхронизации).
      const { rows } = await query(
        "SELECT display_login, company, server, access_server FROM accounts ORDER BY (display_login <> '') DESC, id ASC LIMIT 1"
      );
      stored = rows[0] || null;
    } catch { /* БД не обязательна */ }
  }
  res.json({
    company: stored?.company || 'ООО «Альфа-Форекс»',
    server: stored?.server || 'AlfaForexRU-Real',
    accessServer: stored?.access_server || 'RFD Access Server 1',
    accountNumber: stored?.display_login || '',
  });
});

export default router;
