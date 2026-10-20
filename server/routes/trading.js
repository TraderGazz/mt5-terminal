/**
 * Admin → открытие/закрытие сделок на реальном брокерском счёте (заявка
 * заказчика). В отличие от остальной админки (правка ЗАПИСЕЙ в БД —
 * витринные данные) это реальный ордер брокеру через SocketBridgeEA:
 * реальные деньги, реальный спред/проскальзывание, необратимо.
 */
import { Router } from 'express';
import { authRequired, requireRole } from './auth.js';
import { getBridge } from '../services/mt5-bridge/index.js';
import { query, isDbReady } from '../db.js';

const router = Router();

// Закрыли позицию, у которой была косметическая "правка витрины" (заявка
// заказчика 2026-10-16: закрытая отредактированная позиция должна и в
// Истории показывать отредактированную — плюсовую — прибыль, а не настоящую
// минусовую от брокера). closeTrade() не возвращает итоговую строку
// истории сразу — её туда кладёт фоновая синхронизация (каждые ~30с),
// поэтому ждём её результат и патчим один раз, как только строка появится
// (is_edited=TRUE защищает её от того, чтобы синк потом откатил обратно —
// тот же механизм, что у обычной ручной правки через PATCH /api/trades/:id).
async function carryOverrideToHistory(ticket, targetProfit, targetSwap) {
  if (!isDbReady()) return;
  const ATTEMPTS = 20;
  const DELAY_MS = 3000;
  for (let i = 0; i < ATTEMPTS; i++) {
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    try {
      // position_id, НЕ ticket — у строки в trades «ticket» это номер
      // закрывающей сделки у брокера (другой ряд нумерации), а правка
      // хранится по тикету ОТКРЫТОЙ позиции, который переживает в
      // position_id (баг-репорт 2026-10-20: перенос никогда не находил
      // строку, т.к. искал не по той колонке — "не дождались синка" 60с).
      const { rows } = await query('SELECT id, is_edited, profit, swap FROM trades WHERE position_id = $1', [ticket]);
      if (!rows[0]) continue; // синк ещё не подтянул закрытую сделку — ждём дальше
      if (!rows[0].is_edited) {
        const realProfit = Number(rows[0].profit) || 0;
        const realSwap = Number(rows[0].swap) || 0;
        await query('UPDATE trades SET profit = $1, swap = $2, is_edited = TRUE WHERE id = $3', [
          targetProfit,
          targetSwap,
          rows[0].id,
        ]);
        // Витринная прибыль не меняет реальный баланс брокера — переносим
        // ту же разницу в смещение баланса счёта (см. mt5-sync.js), иначе
        // "Средства/Баланс" на сайте просядут ниже ожидаемого после закрытия.
        const delta = (targetProfit - realProfit) + (targetSwap - realSwap);
        if (delta) {
          const bridge = getBridge();
          const cur = bridge.getAccountOffset();
          await bridge.setAccountOffset({
            ...cur,
            balance: (cur.balance || 0) + delta,
            equity: (cur.equity || 0) + delta,
            freeMargin: (cur.freeMargin || 0) + delta,
          });
        }
        console.log(`[trading] правка позиции #${ticket} перенесена в историю после закрытия`);
      }
      return;
    } catch (err) {
      console.error('[trading] carryOverrideToHistory error:', err.message);
      return;
    }
  }
  console.warn(`[trading] #${ticket}: не дождались синхронизации истории для переноса правки (${(ATTEMPTS * DELAY_MS) / 1000}с)`);
}

router.use(authRequired, requireRole('admin'));

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
    // Снимок отображаемой (с учётом правки) прибыли ДО закрытия — именно
    // её перенесём в историю, если правка была.
    const override = bridge.getPositionOverride(ticket);
    const hasOverride = override.openPriceOverride != null || override.profitOffset != null || override.swapOffset != null;
    let targetProfit = null;
    let targetSwap = null;
    if (hasOverride) {
      const pos = (await bridge.positions()).find((p) => p.id === ticket);
      if (pos) {
        targetProfit = pos.profit;
        targetSwap = pos.swap;
      }
    }

    const result = await bridge.closeTrade({ ticket, volume });
    console.log(`[trading] ${req.user.login} закрыл позицию #${ticket}`);

    if (hasOverride && targetProfit != null) {
      await bridge.clearPositionOverride(ticket); // позиция больше не открыта — витрина ей не нужна
      carryOverrideToHistory(ticket, targetProfit, targetSwap).catch(() => {});
    }

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
router.patch('/position/:ticket', async (req, res) => {
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
    const targetSwap = req.body?.swap != null ? Number(req.body.swap) : null;
    if (req.body?.openPrice != null && !Number.isFinite(openPriceOverride)) {
      return res.status(400).json({ error: 'Некорректная цена открытия' });
    }
    if (req.body?.profit != null && !Number.isFinite(targetProfit)) {
      return res.status(400).json({ error: 'Некорректная прибыль' });
    }
    if (req.body?.swap != null && !Number.isFinite(targetSwap)) {
      return res.status(400).json({ error: 'Некорректный своп' });
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

    // Своп не зависит от цены открытия — целевое число минус настоящий
    // текущий своп, тот же принцип "плывущей" фиксированной поправки.
    let swapOffset = existing.swapOffset;
    if (targetSwap != null) {
      swapOffset = targetSwap - p.swap;
    }

    await bridge.setPositionOverride(ticket, { openPriceOverride, profitOffset, swapOffset });
    console.log(`[trading] ${req.user.login} изменил витрину позиции #${ticket}`);
    res.json({ ticket, openPriceOverride, profitOffset, swapOffset });
  } catch (err) {
    console.error('[trading] position override error:', err.message);
    res.status(500).json({ error: err.message || 'Не удалось сохранить' });
  }
});

// DELETE /api/trading/position/:ticket — сброс правки, вернуть настоящие цифры.
router.delete('/position/:ticket', async (req, res) => {
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

// DELETE /api/trading/positions — сброс правок ВСЕХ позиций разом (заявка
// заказчика: раньше только по одной, через каждую позицию отдельно).
router.delete('/positions', async (req, res) => {
  try {
    const count = await getBridge().clearAllPositionOverrides();
    res.json({ cleared: count });
  } catch (err) {
    console.error('[trading] clear all overrides error:', err.message);
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
