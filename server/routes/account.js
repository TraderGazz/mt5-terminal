import { Router } from 'express';
import { authRequired } from './auth.js';
import { getBridge } from '../services/mt5-bridge/index.js';
import { query, isDbReady } from '../db.js';
import { buildAccountView } from '../services/account-view.js';

const router = Router();

// GET /api/account — снимок счёта для страниц «Торговля» / «Настройки».
// Источник: MT5-мост (live) + Брендинг из БД (см. account-view.js — та же
// функция использует WS-пуш 'account' в ws-hub.js, чтобы оба пути слияния
// не расходились).
router.get('/', authRequired, async (req, res) => {
  const bridge = getBridge();
  try {
    const account = await buildAccountView(bridge);
    res.json({ account, source: bridge.status() });
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
