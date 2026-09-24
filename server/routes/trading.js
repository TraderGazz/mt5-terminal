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

// trader тоже пускаем к реальной торговле (заявка заказчика: "у
// администратора (трейдера)" — investor/viewer по-прежнему без доступа).
router.use(authRequired, requireRole('admin', 'trader'));

// POST /api/trading/open — { type: 'buy'|'sell', volume: number, comment?, stopLoss?, takeProfit? }
router.post('/open', async (req, res) => {
  const { type, comment } = req.body || {};
  const volume = Number(req.body?.volume);
  if (type !== 'buy' && type !== 'sell') {
    return res.status(400).json({ error: "type должен быть 'buy' или 'sell'" });
  }
  if (!Number.isFinite(volume) || volume <= 0) {
    return res.status(400).json({ error: 'Некорректный объём' });
  }
  const stopLoss = req.body?.stopLoss != null ? Number(req.body.stopLoss) : undefined;
  const takeProfit = req.body?.takeProfit != null ? Number(req.body.takeProfit) : undefined;
  if (stopLoss != null && !Number.isFinite(stopLoss)) {
    return res.status(400).json({ error: 'Некорректный стоп-лосс' });
  }
  if (takeProfit != null && !Number.isFinite(takeProfit)) {
    return res.status(400).json({ error: 'Некорректный тейк-профит' });
  }
  const bridge = getBridge();
  try {
    const result = await bridge.openTrade({ type, volume, comment, stopLoss, takeProfit });
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

// POST /api/trading/position/:ticket/modify — { stopLoss?, takeProfit? } —
// заявка заказчика: "изменить позицию как в оригинале MT5" (настоящий
// стоп-лосс/тейк-профит, реальный ордер брокеру через CTrade.PositionModify).
// Не путать с PATCH ниже — та правка чисто витринная, эта — настоящая.
router.post('/position/:ticket/modify', async (req, res) => {
  const ticket = Number(req.params.ticket);
  if (!Number.isFinite(ticket) || ticket <= 0) {
    return res.status(400).json({ error: 'Некорректный тикет' });
  }
  const stopLoss = req.body?.stopLoss != null ? Number(req.body.stopLoss) : undefined;
  const takeProfit = req.body?.takeProfit != null ? Number(req.body.takeProfit) : undefined;
  if (stopLoss != null && !Number.isFinite(stopLoss)) {
    return res.status(400).json({ error: 'Некорректный стоп-лосс' });
  }
  if (takeProfit != null && !Number.isFinite(takeProfit)) {
    return res.status(400).json({ error: 'Некорректный тейк-профит' });
  }
  if (stopLoss == null && takeProfit == null) {
    return res.status(400).json({ error: 'Укажите стоп-лосс и/или тейк-профит' });
  }
  const bridge = getBridge();
  try {
    const result = await bridge.modifyPosition({ ticket, stopLoss, takeProfit });
    console.log(`[trading] ${req.user.login} изменил SL/TP позиции #${ticket}`);
    res.json(result);
  } catch (err) {
    console.error('[trading] modify error:', err.message);
    res.status(502).json({ error: err.message || 'Не удалось изменить позицию' });
  }
});

// PATCH /api/trading/position/:ticket — { openPrice?, profit? } — заявка
// заказчика: косметическая правка ОТКРЫТОЙ позиции (не запись в БД, как
// закрытые сделки, — позиция живая). Реального ордера брокеру НЕ уходит.
// Только admin — витрина (обман глаза для показа) остаётся его правом,
// в отличие от настоящей торговли выше, которую только что открыли trader'у.
router.patch('/position/:ticket', requireRole('admin'), async (req, res) => {
  const ticket = Number(req.params.ticket);
  if (!Number.isFinite(ticket) || ticket <= 0) {
    return res.status(400).json({ error: 'Некорректный тикет' });
  }
  const bridge = getBridge();
  try {
    const positions = await bridge.rawPositions();
    const p = positions.find((x) => x.id === ticket);
    if (!p) return res.status(404).json({ error: 'Позиция не найдена (возможно уже закрыта)' });

    // Клиент шлёт только реально изменённое админом поле (не оба всегда) —
    // не тронутое поле нужно не занулять, а сохранить как было, иначе PATCH
    // одной только цены открытия тихо стирал ранее заданную правку прибыли
    // (и наоборот): баг-репорт «цену открытия поменял, но прибыль не
    // пересчиталась» был как раз про это — прежний код всегда получал от
    // клиента и цену, и прибыль (предзаполненную текущим значением), из-за
    // чего пересчёт от новой цены каждый раз гасился обратно к старому
    // числу.
    const existing = bridge.getPositionOverride(ticket);
    const openPriceOverride = req.body?.openPrice != null ? Number(req.body.openPrice) : existing.openPriceOverride;
    const targetProfit = req.body?.profit != null ? Number(req.body.profit) : null;
    if (req.body?.openPrice != null && !Number.isFinite(openPriceOverride)) {
      return res.status(400).json({ error: 'Некорректная цена открытия' });
    }
    if (req.body?.profit != null && !Number.isFinite(targetProfit)) {
      return res.status(400).json({ error: 'Некорректная прибыль' });
    }

    // Прибыль/убыток задаётся ЦЕЛЕВЫМ числом "здесь и сейчас" (заявка:
    // "поставил -60000, и дальше двигалась вместе с рынком") — пересчитываем
    // это в фиксированную добавку (offset) поверх текущей рассчитанной
    // прибыли (уже с учётом новой цены открытия, если она тоже меняется в
    // этом же запросе), чтобы дальше "плыло" вместе с рынком, не замерло.
    // Если прибыль в этом запросе не меняли — сохраняем прежний offset
    // (он и так "плывущий", не завязан на конкретную цену открытия).
    let profitOffset = existing.profitOffset;
    if (targetProfit != null) {
      const baseProfit = openPriceOverride != null ? recomputeProfit(p, openPriceOverride) : p.profit;
      profitOffset = targetProfit - baseProfit;
    }

    await bridge.setPositionOverride(ticket, { openPriceOverride, profitOffset });
    console.log(`[trading] ${req.user.login} изменил витрину позиции #${ticket}`);
    res.json({ ticket, openPriceOverride, profitOffset });
  } catch (err) {
    console.error('[trading] position override error:', err.message);
    res.status(500).json({ error: err.message || 'Не удалось сохранить' });
  }
});

// DELETE /api/trading/position/:ticket — сброс правки, вернуть настоящие цифры.
router.delete('/position/:ticket', requireRole('admin'), async (req, res) => {
  const ticket = Number(req.params.ticket);
  if (!Number.isFinite(ticket) || ticket <= 0) {
    return res.status(400).json({ error: 'Некорректный тикет' });
  }
  try {
    await getBridge().clearPositionOverride(ticket);
    res.json({ cleared: true });
  } catch (err) {
    console.error('[trading] clear override error:', err.message);
    res.status(500).json({ error: err.message || 'Не удалось сбросить' });
  }
});

// Та же линейная формула, что и в mt5-bridge/index.js#applyOverride — здесь
// нужна один раз, чтобы посчитать "targetProfit -> offset" ДО сохранения.
function recomputeProfit(p, openPriceOverride) {
  const dir = p.type === 'buy' ? 1 : -1;
  const realMove = dir * (p.currentPrice - p.openPrice);
  const k = realMove !== 0 ? p.profit / realMove : 0;
  return k * (dir * (p.currentPrice - openPriceOverride));
}

export default router;
