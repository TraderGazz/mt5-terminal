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
      this.emit('quote', N.normalizeQuote(raw));
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
    return list.map(N.normalizePosition).filter((p) => p.id);
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
