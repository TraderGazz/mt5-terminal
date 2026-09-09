// Клиент к реальному SocketBridgeEA (HTTP + WebSocket).
// Интерфейс идентичен MockBridge. Формы ответов EA будут выверены на Этапе 4
// против живого моста — здесь заложены ожидаемые эндпоинты по документации.
import { EventEmitter } from 'node:events';

const BASE = (process.env.MT5_BRIDGE_URL || 'http://mt5:8890/v1').replace(/\/$/, '');
const WS_URL = process.env.MT5_BRIDGE_WS || 'ws://mt5:8890';
const SYMBOL = process.env.MT5_SYMBOL || 'EURUSD';
const TIMEOUT_MS = Number(process.env.MT5_BRIDGE_TIMEOUT_MS) || 8000;

async function get(path, params) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params || {})) if (v != null) url.searchParams.set(k, String(v));
  const ctl = AbortSignal.timeout(TIMEOUT_MS);
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

  async getHistory({ from, to } = {}) {
    return get('/history/orders', {
      mode: 'positions',
      from_date: from ? String(from).slice(0, 10) : undefined,
      to_date: to ? String(to).slice(0, 10) : undefined,
    });
  }

  async getCandles({ timeframe = 'M5', from, to } = {}) {
    return get('/history/prices', {
      symbol: this.symbol,
      time_frame: timeframe,
      from_date: from ? String(from).slice(0, 10) : undefined,
      to_date: to ? String(to).slice(0, 10) : undefined,
    });
  }

  async getQuote() {
    return get('/quote', { symbol: this.symbol });
  }

  start() {
    if (this.ws || this.closing) return;
    let WS;
    try {
      WS = globalThis.WebSocket; // Node 22+/24
    } catch { /* noop */ }
    if (!WS) {
      console.error('[mt5-bridge] global WebSocket недоступен — обнови Node или добавь ws');
      return;
    }
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
      // подписки: цены EURUSD, свечи M5, события сделок
      this.#send({ endpoint: '/v1/track/prices', symbols: [this.symbol] });
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
