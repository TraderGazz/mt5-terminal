// Синхронизатор: MT5-мост → PostgreSQL.
//   - счёт   → upsert в accounts (по account_number)
//   - позиции → полная перезапись таблицы positions
//   - история → upsert в trades по ticket, БЕЗ перезаписи строк с is_edited = TRUE
//
// Запускается при старте, по интервалу и по событию 'trade' от моста.
import { getBridge } from './mt5-bridge/index.js';
import { normalizeDeal } from './mt5-bridge/normalize.js';
import { query, isDbReady } from '../db.js';

const INTERVAL_MS = Number(process.env.MT5_SYNC_INTERVAL_MS) || 30_000;
const HISTORY_MONTHS = Number(process.env.MT5_SYNC_HISTORY_MONTHS) || 120; // вся история счёта, не только год

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

// EA принимает from_date/to_date как полный ISO8601 datetime (не только
// дату — ValidateDateRange у EA общая для /history/prices и /history/orders
// и разбирает "YYYY-MM-DDTHH:MM:SS" одинаково для обоих), так что дробить
// можно по ЛЮБОЙ границе, а не только по целым суткам.
//
// Настоящая причина зависаний на плотных днях (проверено напрямую curl'ом
// в обход backend): у EA фиксированный буфер ответа — ЛЮБОЙ запрос, чей
// результат не влезает в него, обрывается РОВНО на одной и той же длине
// (109949 байт что для целого дня, что для его половины — совпадение
// байт-в-байт исключает "медленно строит JSON", это переполнение буфера).
// Тело при этом отдаётся с HTTP 200 и Content-Length на полный (не
// обрезанный) размер, поэтому Node/undici видит недостачу байт и роняет
// fetch с "terminated" — curl молча возвращает то же самое как невалидный
// обрубленный JSON. Раньше это лечили отказом от дня целиком (дробить
// мельче было "некуда" при допущении "только даты") — реальный fix:
// продолжать дробить временными окнами и НИЖЕ суток, пока каждый кусок не
// поместится в буфер.
const DAY_MS = 24 * 60 * 60 * 1000;
// Ниже этого окна не дробим — при подтверждённой пустой/малой плотности
// дальше почти всегда бессмысленно (upstream-сбой, а не переполнение).
const MIN_CHUNK_MS = 15 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const atUtcMidnight = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

// Замечено: буфер EA (~110КБ) иногда обрывается РОВНО на границе записи —
// тогда JSON получается формально валидным, но НЕПОЛНЫМ, без единой ошибки.
// ~380 байт/запись → предел примерно 289 записей. Поэтому любой ответ
// длиной >= SUSPICIOUS_LEN считаем потенциально урезанным и дробим дальше
// принудительно, даже если он успешно распарсился.
const SUSPICIOUS_LEN = 250;

// Дни, на которых бэкфилл сдался даже на минимальной гранулярности
// (MIN_CHUNK_MS) — значит проблема не в переполнении буфера, а в чём-то
// ином (EA недоступен и т.п.). Частый синк не должен их перепроверять —
// иначе одно и то же зависание/500 повторяется каждые 30с и кладёт
// однопоточный EA, ломая заодно live-пуш баланса/позиций через WS.
// Заполняется backfillHistory().
const KNOWN_BAD_DAYS = new Set();

async function fetchHistoryChunked(bridge, from, to, retry = true) {
  await sleep(120); // EA однопоточный — не бомбим его запросами впритык
  const spanMs = to.getTime() - from.getTime();
  let result;
  try {
    result = await bridge.history({ from: from.toISOString(), to: to.toISOString() });
    if (result.length < SUSPICIOUS_LEN || spanMs <= MIN_CHUNK_MS) return result;
    // Похоже на тихий обрыв буфера — раздробим и сверим со сложенной суммой,
    // на всякий случай берём то, что даёт больше строк.
  } catch (err) {
    if (retry) {
      await sleep(300);
      return fetchHistoryChunked(bridge, from, to, false);
    }
    if (spanMs <= MIN_CHUNK_MS) {
      KNOWN_BAD_DAYS.add(from.toISOString().slice(0, 10));
      console.error(`[mt5-sync] история: окно не влезает (${from.toISOString()}..${to.toISOString()}):`, err.message);
      return [];
    }
  }
  const mid = new Date(from.getTime() + Math.floor(spanMs / 2));
  // Последовательно (не Promise.all) — EA не тянет параллельные запросы.
  const a = await fetchHistoryChunked(bridge, from, mid);
  const b = await fetchHistoryChunked(bridge, mid, to);
  const split = [...a, ...b];
  return result && result.length > split.length ? result : split;
}

// EA-реконструкция "positions" из deals теряет ~10-15% на плотных периодах
// (проверено: 159 закрытий в сырых deals vs 136 у EA в mode=positions за тот
// же день) — баг в MQL5-коде EA (O(n²) сопоставление IN/OUT по position_id).
// Поэтому для полного бэкфилла тянем СЫРЫЕ deals и сшиваем позиции сами —
// здесь такой ошибки нет. Копим ВСЕ deals по всему периоду в один массив и
// сшиваем один раз в конце — так открытие и закрытие, попавшие в разные
// суточные чанки, всё равно корректно находят друг друга по position_id.
async function fetchDealsChunked(bridge, from, to, retry = true) {
  await sleep(120);
  const spanMs = to.getTime() - from.getTime();
  let result;
  try {
    result = await bridge.dealsRaw({ from: from.toISOString(), to: to.toISOString() });
    if (result.length < SUSPICIOUS_LEN || spanMs <= MIN_CHUNK_MS) return result;
  } catch (err) {
    if (retry) {
      await sleep(300);
      return fetchDealsChunked(bridge, from, to, false);
    }
    if (spanMs <= MIN_CHUNK_MS) {
      KNOWN_BAD_DAYS.add(from.toISOString().slice(0, 10));
      console.error(`[mt5-sync] deals: окно не влезает (${from.toISOString()}..${to.toISOString()}):`, err.message);
      return [];
    }
  }
  const mid = new Date(from.getTime() + Math.floor(spanMs / 2));
  const a = await fetchDealsChunked(bridge, from, mid);
  const b = await fetchDealsChunked(bridge, mid, to);
  const split = [...a, ...b];
  return result && result.length > split.length ? result : split;
}

// Сшивает сырые deals (DEAL_ENTRY_IN/OUT по position_id) в записи в формате
// исходного mode=positions — дальше идёт через тот же normalizeDeal.
function buildPositionsFromDeals(deals) {
  const byPos = new Map();
  const out = [];
  for (const d of deals) {
    const pid = Number(d.position_id) || 0;
    if (!pid) {
      // Балансовые операции (пополнение/снятие) — не привязаны к позиции,
      // но нужны для итогов "Депозит/Прибыль/Баланс" на странице Истории.
      const type = String(d.type || '');
      if (type.includes('BALANCE') || type.includes('DEPOSIT') || type.includes('WITHDRAW') || type.includes('CREDIT')) {
        out.push({
          ticket: d.ticket,
          position_id: 0,
          symbol: '',
          type: d.type,
          volume: 0,
          open_price: 0,
          close_price: 0,
          sl_price: 0,
          tp_price: 0,
          swap: 0,
          commission: 0,
          profit: d.profit,
          open_time: d.time,
          close_time: d.time,
          comment: d.comment,
        });
      }
      continue;
    }
    if (!byPos.has(pid)) byPos.set(pid, []);
    byPos.get(pid).push(d);
  }
  for (const group of byPos.values()) {
    const ins = group.filter((d) => d.entry === 'DEAL_ENTRY_IN');
    const outs = group.filter((d) => d.entry === 'DEAL_ENTRY_OUT');
    if (!ins.length || !outs.length) continue; // ещё открыта, либо не нашли пару
    const openDeal = ins.reduce((a, b) => (a.time < b.time ? a : b));
    for (const closeDeal of outs) {
      out.push({
        ticket: closeDeal.ticket,
        position_id: closeDeal.position_id,
        symbol: closeDeal.symbol || openDeal.symbol,
        // Направление ПОЗИЦИИ, не закрывающей сделки: MT5 закрывает buy
        // противоположной (sell) транзакцией и наоборот — closeDeal.type
        // всегда обратный реальному направлению позиции. Подтверждено
        // напрямую сырыми данными EA: позиция с closeDeal.type=SELL имела
        // openDeal.type=BUY, и профит (реальный убыток на падении цены)
        // сходился именно с BUY, а не с тем, что показывал closeDeal.type.
        type: openDeal.type,
        volume: closeDeal.volume,
        open_price: openDeal.price,
        close_price: closeDeal.price,
        sl_price: closeDeal.sl_price,
        tp_price: closeDeal.tp_price,
        swap: closeDeal.swap,
        commission: closeDeal.commission,
        profit: closeDeal.profit,
        open_time: openDeal.time,
        close_time: closeDeal.time,
        comment: closeDeal.comment,
      });
    }
  }
  return out;
}

// Обычная (частая) синхронизация — узкое окно (последние SYNC_WINDOW_DAYS
// дней). Использует те же fetchDealsChunked/fetchHistoryChunked, что и
// бэкфилл: для обычного (не плотного) дня это ровно ОДИН быстрый запрос —
// дробление включается только если день действительно не влезает в буфер
// EA, и тогда именно этот день займёт больше времени, а не весь цикл
// синхронизации (KNOWN_BAD_DAYS всё ещё коротко замыкает уже подтверждённо
// безнадёжные окна). Известные "плохие" дни (после исчерпания MIN_CHUNK_MS)
// пропускаются, не блокируя остальные SYNC_WINDOW_DAYS дней и не мешая
// счёту/позициям (те синкаются отдельно, до истории — см. syncNow).
const SYNC_WINDOW_DAYS = Number(process.env.MT5_SYNC_WINDOW_DAYS) || 3;

// Только для мока (mode=positions уже отдаёт завершённые записи, сшивать
// open/close самим не нужно) — реальный путь собран отдельно в syncHistory().
async function fetchDayFast(bridge, day) {
  const dateStr = day.toISOString().slice(0, 10);
  if (KNOWN_BAD_DAYS.has(dateStr)) return [];
  const next = new Date(day.getTime() + DAY_MS);
  try {
    return await fetchHistoryChunked(bridge, day, next);
  } catch (err) {
    console.error(`[mt5-sync] история (${dateStr}) пропущена:`, err.message);
    return [];
  }
}

async function syncHistory(bridge) {
  const to = atUtcMidnight(new Date());
  const real = bridge.mode === 'real';

  if (real) {
    // ВАЖНО: сшивать open/close в позицию нужно ПОСЛЕ того, как собраны сырые
    // deals за ВЕСЬ оконный период, а не по одному дню за раз — иначе любая
    // позиция, открытая в один календарный день и закрытая в другой (обычное
    // дело), не находит пару ни в одном из двух дневных чанков и тихо
    // выбрасывается как "незавершённая" (см. buildPositionsFromDeals). Раньше
    // buildPositionsFromDeals вызывался внутри fetchDayFast на КАЖДЫЙ день —
    // копим сырьё сначала, сшиваем один раз в конце, как в backfillHistory().
    let rawAll = [];
    for (let i = 0; i < SYNC_WINDOW_DAYS; i++) {
      const day = new Date(to.getTime() - i * DAY_MS);
      const dateStr = day.toISOString().slice(0, 10);
      if (KNOWN_BAD_DAYS.has(dateStr)) continue;
      await sleep(120); // EA однопоточный — не бомбим впритык
      const next = new Date(day.getTime() + DAY_MS);
      rawAll = rawAll.concat(await fetchDealsChunked(bridge, day, next));
    }
    const positions = buildPositionsFromDeals(rawAll).map(normalizeDeal).filter((d) => d.ticket);
    return saveDeals(positions);
  }

  let all = [];
  for (let i = 0; i < SYNC_WINDOW_DAYS; i++) {
    const day = new Date(to.getTime() - i * DAY_MS);
    await sleep(120);
    all = all.concat(await fetchDayFast(bridge, day));
  }
  return saveDeals(all);
}

// Полная выгрузка истории за HISTORY_MONTHS — один раз при старте (не по таймеру),
// чтобы «зеркалить» терминал полностью, а не только последние несколько дней.
let backfilled = false;
export async function backfillHistory() {
  if (backfilled || !isDbReady()) return;
  backfilled = true;
  // Занимаем тот же замок, что и syncNow: обычный интервальный синк (каждые
  // 30с) не должен дёргать EA параллельно с бэкфиллом — EA однопоточный и
  // валится в HTTP 500 от одновременных запросов, даже с ретраями внутри
  // самого бэкфилла.
  while (running) await sleep(500);
  running = true;
  const bridge = getBridge();
  const to = atUtcMidnight(new Date(Date.now() + DAY_MS)); // включая сегодня целиком
  const from = new Date(to);
  from.setUTCMonth(from.getUTCMonth() - HISTORY_MONTHS);
  try {
    if (bridge.mode === 'real') {
      const rawDeals = await fetchDealsChunked(bridge, from, to);
      const positions = buildPositionsFromDeals(rawDeals);
      const deals = positions.map(normalizeDeal).filter((d) => d.ticket);
      const n = await saveDeals(deals);
      console.log(
        `[mt5-sync] бэкфилл истории (deals) за ${HISTORY_MONTHS} мес. — ${rawDeals.length} deals → ${positions.length} позиций → ${n} строк в БД`,
      );
    } else {
      const deals = await fetchHistoryChunked(bridge, from, to);
      const n = await saveDeals(deals);
      console.log(`[mt5-sync] бэкфилл истории за ${HISTORY_MONTHS} мес. — ${n} строк`);
    }
  } catch (err) {
    console.error('[mt5-sync] ошибка бэкфилла истории:', err.message);
  } finally {
    running = false;
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
  // Бэкфилл — тяжёлая одноразовая операция (сотни запросов к однопоточному
  // EA с ретраями на "плотных" днях). Раньше запускался при КАЖДОМ рестарте
  // backend (флаг backfilled сбрасывается в памяти), что при частых рестартах
  // (например, во время отладки) перегружало EA повторно и роняло даже
  // обычные REST-запросы по таймауту. История уже собрана один раз — включать
  // явно через MT5_RUN_BACKFILL=1, когда действительно нужно дособрать заново.
  if (process.env.MT5_RUN_BACKFILL === '1') {
    setTimeout(() => backfillHistory(), 6000).unref?.();
  }
  timer = setInterval(() => syncNow('interval'), INTERVAL_MS);
  timer.unref?.();
  bridge.on('trade', () => syncNow('trade-event'));
  console.log(`[mt5-sync] запущен, интервал ${INTERVAL_MS / 1000}с`);
}
