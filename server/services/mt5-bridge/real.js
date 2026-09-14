// Клиент к реальному SocketBridgeEA (HTTP + WebSocket).
// Интерфейс идентичен MockBridge. Формы ответов EA будут выверены на Этапе 4
// против живого моста — здесь заложены ожидаемые эндпоинты по документации.
import { EventEmitter } from 'node:events';
import NodeWebSocket from 'ws';

const BASE = (process.env.MT5_BRIDGE_URL || 'http://mt5:8890/v1').replace(/\/$/, '');
const WS_URL = process.env.MT5_BRIDGE_WS || 'ws://mt5:8890';
const SYMBOL = process.env.MT5_SYMBOL || 'EURUSD';
const TIMEOUT_MS = Number(process.env.MT5_BRIDGE_TIMEOUT_MS) || 8000;
// Полный список котировок для Market Watch (первый — основной символ счёта).
const WATCH_SYMBOLS = (process.env.MT5_WATCH_SYMBOLS || `${SYMBOL},USDRUBrfd,XAUUSDrfd,GBPUSDrfd`)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const TF_MINUTES = { M1: 1, M5: 5, M15: 15, M30: 30, H1: 60, H4: 240, D1: 1440 };

async function get(path, params, timeoutMs = TIMEOUT_MS) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params || {})) if (v != null) url.searchParams.set(k, String(v));
  const ctl = AbortSignal.timeout(timeoutMs);
  const res = await fetch(url, { signal: ctl });
  if (!res.ok) throw new Error(`bridge ${path} → HTTP ${res.status}`);
  return res.json();
}

export class RealBridge extends EventEmitter {
  constructor() {
    super();
    this.symbol = SYMBOL;
    this.ws = null;
    this.connected = false;
    this.reconnectTimer = null;
    this.closing = false;
  }

  async getAccount() {
    return get('/account');
  }

  async getPositions() {
    return get('/order/list');
  }

  // Сырые deals за диапазон (без реконструкции в позиции на стороне EA —
  // там баг, теряет ~10-15% на плотных периодах). Использует mt5-sync для
  // полного бэкфилла: копит все deals по всему периоду и один раз сшивает
  // сам, без разрыва на границах суточных чанков.
  async getDealsRaw({ from, to }) {
    const toDate = new Date(to);
    const fromDate = new Date(from);
    const res = await get(
      '/history/orders',
      {
        mode: 'deals',
        from_date: fromDate.toISOString().slice(0, 10),
        to_date: toDate.toISOString().slice(0, 10),
      },
      45_000,
    );
    return Array.isArray(res) ? res : res.data || [];
  }

  async getHistory({ from, to } = {}) {
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 180 * 24 * 60 * 60 * 1000);
    return get(
      '/history/orders',
      {
        mode: 'positions',
        from_date: fromDate.toISOString().slice(0, 10),
        to_date: toDate.toISOString().slice(0, 10),
      },
      45_000, // очень плотные по сделкам дни EA считает заметно дольше обычного
    );
  }

  async getCandles({ symbol, timeframe = 'M5', from, to, count = 300 } = {}) {
    const toDate = to ? new Date(to) : new Date();
    let fromDate;
    if (from) {
      fromDate = new Date(from);
    } else {
      // Просить у EA только тот диапазон, что реально нужен под count баров
      // (а не фикс 90 дней) — на плотных таймфреймах (M5) это тысячи лишних
      // баров и заметно более медленный (иногда таймаутящийся) ответ EA.
      // *2.5 — запас на выходные/закрытый рынок, +2 дня — общий запас.
      const barMinutes = TF_MINUTES[timeframe] || 5;
      const neededDays = Math.ceil(((count * barMinutes) / (24 * 60)) * 2.5) + 2;
      fromDate = new Date(toDate.getTime() - Math.min(neededDays, 90) * 24 * 60 * 60 * 1000);
    }
    return get(
      '/history/prices',
      {
        symbol: symbol || this.symbol,
        time_frame: timeframe,
        from_date: fromDate.toISOString().slice(0, 10),
        to_date: toDate.toISOString().slice(0, 10),
      },
      20_000,
    );
  }

  async getQuote() {
    return get('/quote', { symbol: this.symbol });
  }

  // Котировки по всему списку Market Watch (не только основной символ).
  // Последовательно — EA однопоточный, параллельные запросы валит в 500.
  async getQuotes() {
    const out = [];
    for (const symbol of WATCH_SYMBOLS) {
      try {
        out.push(await get('/quote', { symbol }));
      } catch (err) {
        console.error(`[mt5-bridge] котировка ${symbol}:`, err.message);
      }
    }
    return out;
  }

  start() {
    if (this.ws || this.closing) return;
    const WS = globalThis.WebSocket || NodeWebSocket;
    try {
      this.ws = new WS(WS_URL);
    } catch (err) {
      console.error('[mt5-bridge] WS не создан:', err.message);
      this.#scheduleReconnect();
      return;
    }

    this.ws.addEventListener('open', () => {
      this.connected = true;
      console.log('[mt5-bridge] WS подключён', WS_URL);
      // подписки: цены всего Market Watch, свечи M5 основного символа, события сделок
      this.#send({ endpoint: '/v1/track/prices', symbols: WATCH_SYMBOLS });
      this.#send({ endpoint: '/v1/track/ohlc', ohlc: [{ time_frame: 'M5', symbol: this.symbol, depth: 2 }] });
      this.#send({ endpoint: '/v1/track/orders', enabled: 'true' });
      this.emit('event', { type: 'bridge_status', connected: true });
    });

    this.ws.addEventListener('message', (ev) => {
      let msg;
      try {
        // EA иногда дописывает лишнюю '}' в конец кадра — подчищаем.
        const text = String(ev.data).replace(/\}\s*\}\s*$/, '}');
        msg = JSON.parse(text);
      } catch {
        return;
      }
      this.emit('event', msg);
    });

    this.ws.addEventListener('close', () => {
      this.connected = false;
      this.ws = null;
      this.emit('event', { type: 'bridge_status', connected: false });
      this.#scheduleReconnect();
    });

    this.ws.addEventListener('error', () => {
      try { this.ws?.close(); } catch { /* noop */ }
    });
  }

  #send(obj) {
    try { this.ws?.send(JSON.stringify(obj)); } catch { /* noop */ }
  }

  #scheduleReconnect() {
    if (this.closing || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.start();
    }, 5000);
    this.reconnectTimer.unref?.();
  }

  stop() {
    this.closing = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    try { this.ws?.close(); } catch { /* noop */ }
    this.ws = null;
  }
}
