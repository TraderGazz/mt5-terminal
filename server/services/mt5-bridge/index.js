// Единая точка доступа к MT5-мосту.
//   MT5_BRIDGE=mock  — встроенный имитатор (по умолчанию, разработка без Docker/MT5)
//   MT5_BRIDGE=real  — живой SocketBridgeEA (Этап 4)
//
// Наружу отдаёт НОРМАЛИЗОВАННЫЕ формы (см. normalize.js) и поток событий:
//   'quote'        { symbol, bid, ask, spread, digits, time }
//   'candle'       { timeframe, bars: [{time, open, high, low, close, volume}] }
//   'trade'        { symbol, ticket, side, reason, profit, grossProfit, swap, commission, at }
//   'status'       { connected }
import { EventEmitter } from 'node:events';
import { MockBridge } from './mock.js';
import { RealBridge } from './real.js';
import * as N from './normalize.js';
import { query } from '../../db.js';

const MODE = (process.env.MT5_BRIDGE || 'mock').toLowerCase();
const SYMBOL = process.env.MT5_SYMBOL || 'EURUSD';

class Bridge extends EventEmitter {
  constructor() {
    super();
    this.mode = MODE === 'real' ? 'real' : 'mock';
    this.impl = this.mode === 'real' ? new RealBridge() : new MockBridge();
    this.symbol = SYMBOL;
    this.connected = this.mode === 'mock';
    this.lastEventAt = null;
    // Последние живые котировки по символу (нужно для пересчёта profit —
    // см. #fixSellProfit). Push price_update по WS у EA ненадёжен (та же
    // история, что и с трейд-событиями — см. mt5-sync.js), поэтому это
    // только best-effort кэш; настоящее наполнение — активный REST-запрос
    // в #ensureUsdRub(), не зависящий от того, подписан ли кто-то из
    // клиентов на канал котировок.
    this.lastQuotes = new Map();
    this.usdRubFetchedAt = 0;

    // Косметические правки открытых позиций (заявка заказчика) — держим в
    // памяти, чтобы применять на каждый positions() без похода в БД; сама
    // БД — источник истины, переживающий рестарт сервера (см. setOverride).
    this.overrides = new Map();

    // Ручная правка сводных показателей счёта (админка → "Редактирование
    // баланса") — то же самое смещение, что у position_overrides, только
    // на уровне всего счёта, не одной позиции (см. account_overrides).
    this.accountOffset = { balance: 0, equity: 0, margin: 0, freeMargin: 0, marginLevel: 0 };

    this.impl.on('event', (raw) => this.#onRaw(raw));
  }

  start() {
    this.impl.start();
    this.#loadOverrides();
    this.#loadAccountOffset();
    console.log(`[mt5-bridge] режим = ${this.mode}, символ = ${this.symbol}`);
  }

  // ВАЖНО: не гейтим на isDbReady() — initDb()/bridge.start() в
  // server/index.js вызываются подряд синхронно, а подключение к БД
  // устанавливается асинхронно, так что на этот момент isDbReady() почти
  // ВСЕГДА ещё false (флаг просто не успел выставиться) — раньше это
  // тихо пропускало загрузку правок при КАЖДОМ рестарте процесса, хотя
  // сами данные в БД целы (баг-репорт: "позиции вернулись обратно" после
  // каждого деплоя). query() ниже и так безопасно ждёт установления
  // соединения пула (pg сам это умеет), а catch — реальные сбои.
  async #loadOverrides() {
    try {
      const { rows } = await query('SELECT ticket, open_price_override, profit_offset, swap_offset FROM position_overrides');
      for (const r of rows) {
        this.overrides.set(Number(r.ticket), {
          openPriceOverride: r.open_price_override != null ? Number(r.open_price_override) : null,
          profitOffset: r.profit_offset != null ? Number(r.profit_offset) : null,
          swapOffset: r.swap_offset != null ? Number(r.swap_offset) : null,
        });
      }
    } catch (err) {
      console.error('[mt5-bridge] не удалось загрузить position_overrides:', err.message);
    }
  }

  // Текущая сохранённая правка (или пустая) — нужна маршруту, чтобы при
  // PATCH одного поля (например только цены) не затирать null'ом уже
  // сохранённое другое (например profit_offset от предыдущей правки).
  getPositionOverride(ticket) {
    return this.overrides.get(Number(ticket)) ?? { openPriceOverride: null, profitOffset: null, swapOffset: null };
  }

  // Правка сохраняется сразу и в памяти (эффект мгновенный), и в БД
  // (переживает рестарт сервера). Реальная позиция у брокера не трогается.
  async setPositionOverride(ticket, { openPriceOverride, profitOffset, swapOffset }) {
    this.overrides.set(Number(ticket), {
      openPriceOverride: openPriceOverride ?? null,
      profitOffset: profitOffset ?? null,
      swapOffset: swapOffset ?? null,
    });
    // Не гейтим на isDbReady() (см. #loadOverrides) — если запрос реально
    // упадёт, пусть бросает наверх: маршрут (routes/trading.js) вернёт
    // админу настоящую ошибку вместо тихого "как будто сохранилось", пока
    // на деле в БД ничего не записалось.
    await query(
      `INSERT INTO position_overrides (ticket, open_price_override, profit_offset, swap_offset, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (ticket) DO UPDATE SET
         open_price_override = EXCLUDED.open_price_override,
         profit_offset = EXCLUDED.profit_offset,
         swap_offset = EXCLUDED.swap_offset,
         updated_at = now()`,
      [ticket, openPriceOverride ?? null, profitOffset ?? null, swapOffset ?? null],
    );
  }

  async clearPositionOverride(ticket) {
    this.overrides.delete(Number(ticket));
    await query('DELETE FROM position_overrides WHERE ticket = $1', [ticket]);
  }

  async #loadAccountOffset() {
    try {
      const { rows } = await query(
        'SELECT balance_offset, equity_offset, margin_offset, free_margin_offset, margin_level_offset FROM account_overrides WHERE id = 1',
      );
      const r = rows[0];
      if (r) {
        this.accountOffset = {
          balance: Number(r.balance_offset) || 0,
          equity: Number(r.equity_offset) || 0,
          margin: Number(r.margin_offset) || 0,
          freeMargin: Number(r.free_margin_offset) || 0,
          marginLevel: Number(r.margin_level_offset) || 0,
        };
      }
    } catch (err) {
      console.error('[mt5-bridge] не удалось загрузить account_overrides:', err.message);
    }
  }

  getAccountOffset() {
    return { ...this.accountOffset };
  }

  // offset — уже посчитанное вызывающим смещение (routes/admin.js: целевое
  // значение минус текущее эффективное), сохраняется целиком (не патчем).
  async setAccountOffset(offset) {
    this.accountOffset = { ...offset };
    await query(
      `INSERT INTO account_overrides (id, balance_offset, equity_offset, margin_offset, free_margin_offset, margin_level_offset, updated_at)
       VALUES (1, $1, $2, $3, $4, $5, now())
       ON CONFLICT (id) DO UPDATE SET
         balance_offset = EXCLUDED.balance_offset,
         equity_offset = EXCLUDED.equity_offset,
         margin_offset = EXCLUDED.margin_offset,
         free_margin_offset = EXCLUDED.free_margin_offset,
         margin_level_offset = EXCLUDED.margin_level_offset,
         updated_at = now()`,
      [offset.balance || 0, offset.equity || 0, offset.margin || 0, offset.freeMargin || 0, offset.marginLevel || 0],
    );
  }

  async clearAccountOffset() {
    this.accountOffset = { balance: 0, equity: 0, margin: 0, freeMargin: 0, marginLevel: 0 };
    await query(
      `UPDATE account_overrides SET balance_offset = 0, equity_offset = 0, margin_offset = 0,
         free_margin_offset = 0, margin_level_offset = 0, updated_at = now() WHERE id = 1`,
    );
  }

  stop() {
    this.impl.stop();
  }

  #onRaw(raw) {
    this.lastEventAt = Date.now();
    const t = raw && raw.type;
    if (t === 'price_update') {
      const q = N.normalizeQuote(raw);
      this.lastQuotes.set(q.symbol, q);
      this.emit('quote', q);
    } else if (t === 'ohlc_update') {
      this.emit('candle', {
        timeframe: raw.timeframe || 'M5',
        bars: (raw.bars || []).map(N.normalizeCandle),
      });
    } else if (t === 'trade_event') {
      this.emit('trade', N.normalizeTradeEvent(raw));
    } else if (t === 'bridge_status') {
      this.connected = !!raw.connected;
      this.emit('status', { connected: this.connected });
    }
  }

  // ---- нормализованные снапшоты ----

  // Заявка заказчика: косметическая правка позиции должна тянуть за собой
  // и зависимые общие показатели (Прибыль итого, Средства, Свободная
  // маржа), не только саму строку позиции в списке — раньше account()
  // был полностью независимым снапшотом от брокера, applyOverride() из
  // positions() его вообще не касался (баг-репорт: "поменялись позиции, но
  // не поменялись прибыль/средства/маржа"). Маржа (margin) саму НЕ трогаем —
  // она считается от объёма/плеча, не от прибыли, реальному брокеру
  // косметика не передаётся, поэтому это число остаётся настоящим.
  async account() {
    let acc = N.normalizeAccount(await this.impl.getAccount());

    if (this.overrides.size > 0) {
      // Один поход к брокеру (rawPositions), не два — positions() внутри себя
      // тоже вызывает rawPositions(), дублировать запрос незачем. Своп
      // тоже входит в дельту (не только прибыль) — floating P/L на счету
      // считается как profit+swap+commission по каждой позиции (см.
      // mock.js #floatingProfit), а комиссию не правим — не изменится,
      // сама с собой сократится.
      const raw = await this.rawPositions();
      const delta = raw.reduce((s, p) => {
        const o = this.#applyOverride(p);
        return s + (o.profit - p.profit) + (o.swap - p.swap);
      }, 0);
      if (delta !== 0) {
        acc = { ...acc, floatingProfit: acc.floatingProfit + delta, equity: acc.equity + delta, freeMargin: acc.freeMargin + delta };
      }
    }

    // Заявка заказчика (2026-09-29): ручные записи из админки — не только
    // депозит/снятие, но и сделки buy/sell/CFD задним числом ("Добавить
    // сделку" в HistoryEditor) — должны двигать "Баланс" везде на сайте,
    // не только сумму в Истории. Первая версия фикса учитывала только
    // balance/withdrawal и пропускала ручные buy/sell: баг-репорт —
    // "Баланс" в Истории и на Торговле разошлись (в Истории уже сидит
    // прибыль ручных сделок с символом "EURUSDrfd", их в реальном
    // терминале никогда не было, брокер о них не знает). Признак тот же,
    // что и в client History.tsx / admin TradesSection.tsx: тикет < 0 —
    // синтетический (-Date.now()), у EA-синка тикет всегда положительный,
    // так что реальные сделки под эту дельту не попадают ни при каком
    // deal_type. Своп/комиссия для ручных депозита/снятия/CFD в БД всегда
    // 0 (см. admin submitAdd), так что суммировать их вместе с profit
    // безопасно для любого deal_type — реальные ("живые") сделки эту
    // сумму никак не удваивают, дельта только "довешивает" то, чего
    // брокер не видел.
    const manualDelta = await this.#manualEntriesDelta();
    if (manualDelta !== 0) {
      acc = {
        ...acc,
        balance: acc.balance + manualDelta,
        equity: acc.equity + manualDelta,
        freeMargin: acc.freeMargin + manualDelta,
      };
    }

    // Ручная правка сводных показателей (админка → "Редактирование
    // баланса") — раньше писала в таблицу accounts, которую здесь никто
    // не читал: сохранялось, но ни на что не влияло (баг-репорт: "не
    // применялось"). Теперь хранит СМЕЩЕНИЕ (посчитанное в routes/admin.js
    // при сохранении: целевое значение минус текущее эффективное) и
    // прибавляется здесь же, как и остальные дельты — показатель дальше
    // продолжает жить вместе с рынком/сделками от сдвинутой точки.
    const o = this.accountOffset;
    if (o.balance || o.equity || o.margin || o.freeMargin || o.marginLevel) {
      acc = {
        ...acc,
        balance: acc.balance + o.balance,
        equity: acc.equity + o.equity,
        margin: acc.margin + o.margin,
        freeMargin: acc.freeMargin + o.freeMargin,
        marginLevel: acc.marginLevel + o.marginLevel,
      };
    }

    return acc;
  }

  async #manualEntriesDelta() {
    try {
      const { rows } = await query(
        `SELECT COALESCE(SUM(profit + swap + commission), 0) AS delta FROM trades WHERE ticket < 0`,
      );
      return Number(rows[0]?.delta) || 0;
    } catch (err) {
      console.error('[mt5-bridge] manualEntriesDelta error:', err.message);
      return 0;
    }
  }

  async positions() {
    const real = await this.rawPositions();
    return real.map((p) => this.#applyOverride(p));
  }

  // Позиции ДО косметической правки (заявка заказчика) — нужны при СОХРАНЕНИИ
  // новой правки в routes/trading.js: пересчитывать "целевую прибыль -> offset"
  // нужно от НАСТОЯЩИХ цифр брокера, а не от уже подменённых предыдущей
  // правкой — иначе повторное редактирование накапливало бы ошибку.
  async rawPositions() {
    const res = await this.impl.getPositions();
    const list = Array.isArray(res) ? res : res.opened || res.positions || res.data || [];
    const normalized = list.map(N.normalizePosition).filter((p) => p.id);
    if (normalized.some((p) => p.type === 'sell' && p.symbol === this.symbol)) {
      await this.#ensureUsdRub();
    }
    return normalized.map((p) => this.#fixSellProfit(p));
  }

  // Косметическая правка (заявка заказчика): открытую цену можно подменить —
  // тогда прибыль пересчитывается ТАК, КАК БУДТО позиция открыта по ней
  // (текущая цена и объём настоящие). Коэффициент "прибыль на единицу
  // движения цены" берём из уже посчитанной РЕАЛЬНОЙ прибыли — та же
  // линейная зависимость, что использует клиент для live-анимации, так не
  // нужно заново реализовывать формулу контракта/конвертации валюты здесь.
  // profit_offset поверх — фиксированная поправка, "плывёт" вместе с рынком
  // дальше, не заморожена.
  #applyOverride(p) {
    const ov = this.overrides.get(p.id);
    if (!ov) return p;
    let profit = p.profit;
    let openPrice = p.openPrice;
    if (ov.openPriceOverride != null) {
      const dir = p.type === 'buy' ? 1 : -1;
      const realMove = dir * (p.currentPrice - p.openPrice);
      const k = realMove !== 0 ? p.profit / realMove : 0;
      const newMove = dir * (p.currentPrice - ov.openPriceOverride);
      profit = k * newMove;
      openPrice = ov.openPriceOverride;
    }
    if (ov.profitOffset != null) profit += ov.profitOffset;
    let swap = p.swap;
    if (ov.swapOffset != null) swap += ov.swapOffset;
    return { ...p, openPrice, profit, swap };
  }

  // Активно подтягивает курс USDRUB REST-запросом (с коротким TTL-кэшем),
  // не полагаясь на WS push — тот ненадёжен, а курс нужен даже когда никто
  // из клиентов сейчас не смотрит на вкладку Котировки.
  async #ensureUsdRub() {
    if (Date.now() - this.usdRubFetchedAt < 5000) return;
    if (typeof this.impl.getQuoteFor !== 'function') return;
    this.usdRubFetchedAt = Date.now();
    try {
      const q = N.normalizeQuote(await this.impl.getQuoteFor('USDRUBrfd'));
      this.lastQuotes.set(q.symbol, q);
    } catch { /* используем то, что уже есть в кэше (если есть) */ }
  }

  // EA's /order/list считает profit для SELL-позиций по битой формуле —
  // подтверждено напрямую сырыми данными: у BUY-позиций (тот же аккаунт,
  // тот же символ) отношение profit / ((current-open)*volume*100000)
  // стабильно ~курсу USDRUB на ЛЮБОЙ строке; у SELL то же отношение
  // скачет на 10-20% между соседними тикетами с похожими ценами открытия.
  // Реальный терминал (расчёт не через этот эндпоинт EA) при этом даёт
  // ровно ту же формулу/курс, что и у buy — то есть верна одна формула
  // для buy/sell, просто у EA в этом конкретном поле баг именно на sell.
  // Пересчитываем сами по проверенной формуле, только для основного
  // символа счёта (где это подтверждено) и только когда есть живой курс
  // USDRUB — иначе (символ незнакомый / курса ещё нет) отдаём как есть.
  #fixSellProfit(p) {
    if (p.type !== 'sell' || p.symbol !== this.symbol) return p;
    const usdrub = this.lastQuotes.get('USDRUBrfd');
    if (!usdrub) return p;
    const rate = (usdrub.bid + usdrub.ask) / 2;
    const CONTRACT_SIZE = 100000;
    const profit = (p.openPrice - p.currentPrice) * p.volume * CONTRACT_SIZE * rate;
    return { ...p, profit };
  }

  // Реальная сделка (заявка заказчика: открывать/закрывать из админки) —
  // рыночный ордер, только 'buy'/'sell'. Возвращает как есть то, что даёт
  // EA/мок (тикет сделки/ордера, цену исполнения) — это результат действия,
  // не снапшот, глубокая нормализация тут не нужна.
  async openTrade({ symbol, type, volume, comment, stopLoss, takeProfit } = {}) {
    if (typeof this.impl.placeOrder !== 'function') {
      throw new Error('Мост не поддерживает открытие сделок');
    }
    return this.impl.placeOrder({
      symbol: symbol || this.symbol,
      order_type: type,
      volume,
      comment,
      sl: stopLoss,
      tp: takeProfit,
    });
  }

  async closeTrade({ ticket, volume } = {}) {
    if (typeof this.impl.closeOrder !== 'function') {
      throw new Error('Мост не поддерживает закрытие сделок');
    }
    return this.impl.closeOrder({ ticket, volume });
  }

  // Правка SL/TP уже открытой позиции — настоящий ордер брокеру (заявка
  // заказчика "изменить позицию как в оригинале MT5"), в отличие от
  // setPositionOverride() выше (косметика, без реального ордера).
  async modifyPosition({ ticket, stopLoss, takeProfit } = {}) {
    if (typeof this.impl.modifyOrder !== 'function') {
      throw new Error('Мост не поддерживает правку SL/TP');
    }
    return this.impl.modifyOrder({ ticket, sl: stopLoss, tp: takeProfit });
  }

  async history({ from, to } = {}) {
    const res = await this.impl.getHistory({ from, to });
    const list = Array.isArray(res) ? res : res.data || res.history || res.deals || [];
    return list.map(N.normalizeDeal).filter((d) => d.ticket);
  }

  // Сырые deals (без реконструкции в позиции на стороне EA — там баг).
  // Только для реального моста; для мока просто нет смысла (свои моки уже
  // готовые "позиции", реконструкция им не нужна).
  async dealsRaw({ from, to } = {}) {
    if (typeof this.impl.getDealsRaw !== 'function') return [];
    return this.impl.getDealsRaw({ from, to });
  }

  async candles({ symbol, timeframe = 'M5', from, to, count } = {}) {
    const res = await this.impl.getCandles({ symbol, timeframe, from, to, count });
    const list = Array.isArray(res) ? res : res.bars || res.data || res.rates || [];
    return list.map(N.normalizeCandle).filter((b) => b.time);
  }

  async quote() {
    return N.normalizeQuote(await this.impl.getQuote());
  }

  // Котировки всего Market Watch (реальный мост — несколько символов; мок —
  // просто основной символ, у него отдельный список не нужен).
  async quotes() {
    if (typeof this.impl.getQuotes === 'function') {
      return (await this.impl.getQuotes()).map(N.normalizeQuote);
    }
    return [await this.quote()];
  }

  status() {
    const staleMs = this.lastEventAt ? Date.now() - this.lastEventAt : null;
    return {
      mode: this.mode,
      symbol: this.symbol,
      connected: this.mode === 'mock' ? true : this.connected,
      lastEventAgoMs: staleMs,
      stale: staleMs != null && staleMs > 30_000,
    };
  }
}

let singleton = null;
export function getBridge() {
  if (!singleton) singleton = new Bridge();
  return singleton;
}
