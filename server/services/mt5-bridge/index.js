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

    this.impl.on('event', (raw) => this.#onRaw(raw));
  }

  start() {
    this.impl.start();
    console.log(`[mt5-bridge] режим = ${this.mode}, символ = ${this.symbol}`);
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

  async account() {
    return N.normalizeAccount(await this.impl.getAccount());
  }

  async positions() {
    const res = await this.impl.getPositions();
    const list = Array.isArray(res) ? res : res.opened || res.positions || res.data || [];
    const normalized = list.map(N.normalizePosition).filter((p) => p.id);
    if (normalized.some((p) => p.type === 'sell' && p.symbol === this.symbol)) {
      await this.#ensureUsdRub();
    }
    return normalized.map((p) => this.#fixSellProfit(p));
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
  async openTrade({ symbol, type, volume, comment } = {}) {
    if (typeof this.impl.placeOrder !== 'function') {
      throw new Error('Мост не поддерживает открытие сделок');
    }
    return this.impl.placeOrder({ symbol: symbol || this.symbol, order_type: type, volume, comment });
  }

  async closeTrade({ ticket, volume } = {}) {
    if (typeof this.impl.closeOrder !== 'function') {
      throw new Error('Мост не поддерживает закрытие сделок');
    }
    return this.impl.closeOrder({ ticket, volume });
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
