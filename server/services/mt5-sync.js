// Синхронизатор: MT5-мост → PostgreSQL.
//   - счёт   → upsert в accounts (по account_number)
//   - позиции → полная перезапись таблицы positions
//   - история → upsert в trades по ticket, БЕЗ перезаписи строк с is_edited = TRUE
//
// Запускается при старте, по интервалу и по событию 'trade' от моста.
import { getBridge } from './mt5-bridge/index.js';
import { query, isDbReady } from '../db.js';

const INTERVAL_MS = Number(process.env.MT5_SYNC_INTERVAL_MS) || 30_000;
const HISTORY_MONTHS = Number(process.env.MT5_SYNC_HISTORY_MONTHS) || 12;

let running = false;
let timer = null;

const iso = (v) => (v ? new Date(v).toISOString() : null);
const tradeSide = (dealType) => (dealType === 'buy' || dealType === 'sell' ? dealType : null);

async function syncAccount(bridge) {
  const a = await bridge.account();
  if (!a.login) return;
  await query(
    `INSERT INTO accounts
       (account_number, holder, server, currency, balance, equity, margin, free_margin, margin_level, floating_profit, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
     ON CONFLICT (account_number) DO UPDATE SET
       balance = EXCLUDED.balance,
       equity = EXCLUDED.equity,
       margin = EXCLUDED.margin,
       free_margin = EXCLUDED.free_margin,
       margin_level = EXCLUDED.margin_level,
       floating_profit = EXCLUDED.floating_profit,
       holder = COALESCE(NULLIF(accounts.holder, ''), EXCLUDED.holder),
       server = COALESCE(NULLIF(accounts.server, ''), EXCLUDED.server),
       currency = COALESCE(NULLIF(accounts.currency, ''), EXCLUDED.currency),
       updated_at = now()`,
    [
      String(a.login), a.name || '', a.server || '', a.currency || 'RUB',
      a.balance, a.equity, a.margin, a.freeMargin, a.marginLevel, a.floatingProfit,
    ],
  );
}

async function syncPositions(bridge) {
  const positions = await bridge.positions();
  await query('BEGIN');
  try {
    if (positions.length) {
      const ids = positions.map((p) => p.id);
      await query(`DELETE FROM positions WHERE id <> ALL($1::bigint[])`, [ids]);
    } else {
      await query('DELETE FROM positions');
    }
    for (const p of positions) {
      await query(
        `INSERT INTO positions
           (id, symbol, type, volume, open_price, current_price, open_time, stop_loss, take_profit, profit, swap, commission, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
         ON CONFLICT (id) DO UPDATE SET
           current_price = EXCLUDED.current_price, profit = EXCLUDED.profit,
           swap = EXCLUDED.swap, commission = EXCLUDED.commission, updated_at = now()`,
        [
          p.id, p.symbol, p.type, p.volume, p.openPrice, p.currentPrice, iso(p.openTime),
          p.stopLoss, p.takeProfit, p.profit, p.swap, p.commission,
        ],
      );
    }
    await query('COMMIT');
  } catch (err) {
    await query('ROLLBACK');
    throw err;
  }
}

async function saveDeals(deals) {
  for (const d of deals) {
    await query(
      `INSERT INTO trades
         (ticket, symbol, type, deal_type, volume, open_price, close_price, stop_loss, take_profit,
          profit, swap, commission, open_time, close_time, comment, position_id, order_ticket, source, uploaded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'mt5-sync', now())
       ON CONFLICT (ticket) DO UPDATE SET
         symbol = EXCLUDED.symbol, type = EXCLUDED.type, deal_type = EXCLUDED.deal_type,
         volume = EXCLUDED.volume, open_price = EXCLUDED.open_price, close_price = EXCLUDED.close_price,
         stop_loss = EXCLUDED.stop_loss, take_profit = EXCLUDED.take_profit,
         profit = EXCLUDED.profit, swap = EXCLUDED.swap, commission = EXCLUDED.commission,
         open_time = EXCLUDED.open_time, close_time = EXCLUDED.close_time
       WHERE trades.is_edited = FALSE`,
      [
        d.ticket, d.symbol || null, tradeSide(d.dealType), d.dealType, d.volume,
        d.openPrice, d.closePrice, d.stopLoss, d.takeProfit,
        d.profit, d.swap, d.commission, iso(d.openTime), iso(d.closeTime),
        d.comment || '', d.positionId, d.orderTicket,
      ],
    );
  }
  return deals.length;
}

// EA обрезает ответ /history/orders на ~110КБ (не JSON-ошибка, а именно
// усечение строки на полпути) — на плотных по сделкам днях годовой запрос
// не помещается целиком. Делим диапазон пополам, пока запрос не влезет.
const MIN_CHUNK_MS = 15 * 60 * 1000; // мельче 15 минут не дробим — отдаём как есть

async function fetchHistoryChunked(bridge, from, to) {
  try {
    return await bridge.history({ from: from.toISOString(), to: to.toISOString() });
  } catch (err) {
    const span = to.getTime() - from.getTime();
    if (span <= MIN_CHUNK_MS) {
      console.error(`[mt5-sync] история: диапазон не влезает даже мелкими частями (${from.toISOString()}–${to.toISOString()}):`, err.message);
      return [];
    }
    const mid = new Date(from.getTime() + Math.floor(span / 2));
    const [a, b] = await Promise.all([
      fetchHistoryChunked(bridge, from, mid),
      fetchHistoryChunked(bridge, mid, to),
    ]);
    return [...a, ...b];
  }
}

// Обычная (частая) синхронизация — узкое окно, дешёво и почти всегда без дробления.
const SYNC_WINDOW_DAYS = Number(process.env.MT5_SYNC_WINDOW_DAYS) || 3;

async function syncHistory(bridge) {
  const to = new Date();
  const from = new Date(to.getTime() - SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const deals = await fetchHistoryChunked(bridge, from, to);
  return saveDeals(deals);
}

// Полная выгрузка истории за HISTORY_MONTHS — один раз при старте (не по таймеру),
// чтобы «зеркалить» терминал полностью, а не только последние несколько дней.
let backfilled = false;
export async function backfillHistory() {
  if (backfilled || !isDbReady()) return;
  backfilled = true;
  const bridge = getBridge();
  const to = new Date();
  const from = new Date(to);
  from.setMonth(from.getMonth() - HISTORY_MONTHS);
  try {
    const deals = await fetchHistoryChunked(bridge, from, to);
    const n = await saveDeals(deals);
    console.log(`[mt5-sync] бэкфилл истории за ${HISTORY_MONTHS} мес. — ${n} строк`);
  } catch (err) {
    console.error('[mt5-sync] ошибка бэкфилла истории:', err.message);
  }
}

export async function syncNow(reason = 'manual') {
  if (!isDbReady() || running) return;
  running = true;
  const bridge = getBridge();
  try {
    await syncAccount(bridge);
    await syncPositions(bridge);
    const n = await syncHistory(bridge);
    console.log(`[mt5-sync] ok (${reason}) — история: ${n} строк`);
  } catch (err) {
    console.error(`[mt5-sync] ошибка (${reason}):`, err.message);
  } finally {
    running = false;
  }
}

export function startMt5Sync() {
  const bridge = getBridge();
  // первый прогон — после того, как проба БД завершится
  setTimeout(() => syncNow('startup'), 4000).unref?.();
  setTimeout(() => backfillHistory(), 6000).unref?.();
  timer = setInterval(() => syncNow('interval'), INTERVAL_MS);
  timer.unref?.();
  bridge.on('trade', () => syncNow('trade-event'));
  console.log(`[mt5-sync] запущен, интервал ${INTERVAL_MS / 1000}с`);
}
