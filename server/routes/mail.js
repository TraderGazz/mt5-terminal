/**
 * GET /api/mail — «Настройки → Почта» (заявка заказчика 2026-10-17: раньше
 * была декоративной заглушкой). Реальные системные сообщения — пишет админ
 * через панель (см. /admin/mail в admin.js), клиент только читает.
 */
import { Router } from 'express';
import { authRequired } from './auth.js';
import { query, isDbReady } from '../db.js';

const router = Router();

router.get('/', authRequired, async (req, res) => {
  if (!isDbReady()) return res.json({ items: [] });
  const { rows } = await query(
    'SELECT id, subject, body, created_at FROM mail_messages ORDER BY created_at DESC LIMIT 200',
  );
  res.json({ items: rows });
});

export default router;
