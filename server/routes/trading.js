/**
 * Admin → открытие/закрытие сделок на реальном брокерском счёте (заявка
 * заказчика). В отличие от остальной админки (правка ЗАПИСЕЙ в БД —
 * витринные данные) это реальный ордер брокеру через SocketBridgeEA:
 * реальные деньги, реальный спред/проскальзывание, необратимо.
 */
import { Router } from 'express';
import { authRequired, requireRole } from './auth.js';
import { getBridge } from '../services/mt5-bridge/index.js';

const router = Router();

router.use(authRequired, requireRole('admin'));

// POST /api/trading/open — { type: 'buy'|'sell', volume: number, comment? }
router.post('/open', async (req, res) => {
  const { type, comment } = req.body || {};
  const volume = Number(req.body?.volume);
  if (type !== 'buy' && type !== 'sell') {
    return res.status(400).json({ error: "type должен быть 'buy' или 'sell'" });
  }
  if (!Number.isFinite(volume) || volume <= 0) {
    return res.status(400).json({ error: 'Некорректный объём' });
  }
  const bridge = getBridge();
  try {
    const result = await bridge.openTrade({ type, volume, comment });
    console.log(`[trading] ${req.user.login} открыл ${type} ${volume} лот — тикет ${result.order ?? result.deal}`);
    res.json(result);
  } catch (err) {
    console.error('[trading] open error:', err.message);
    res.status(502).json({ error: err.message || 'Не удалось открыть сделку' });
  }
});

// POST /api/trading/close — { ticket: number, volume? } (без volume — закрыть целиком)
router.post('/close', async (req, res) => {
  const ticket = Number(req.body?.ticket);
  if (!Number.isFinite(ticket) || ticket <= 0) {
    return res.status(400).json({ error: 'Некорректный тикет' });
  }
  const volume = req.body?.volume != null ? Number(req.body.volume) : undefined;
  const bridge = getBridge();
  try {
    const result = await bridge.closeTrade({ ticket, volume });
    console.log(`[trading] ${req.user.login} закрыл позицию #${ticket}`);
    res.json(result);
  } catch (err) {
    console.error('[trading] close error:', err.message);
    res.status(502).json({ error: err.message || 'Не удалось закрыть сделку' });
  }
});

export default router;
