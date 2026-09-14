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
// EA/сервер брокера трактует любые даты в запросах как СВОЁ локальное время
// (UTC+3), без пересчёта — зеркально normalize.js:toIso(), которая на выходе
// из EA вычитает этот же сдвиг. Поэтому исходящие from_date/to_date нужно
// сдвигать на +3ч (наши Date-объекты — истинный UTC), иначе EA считает
// "сейчас" на 3 часа раньше своего реального текущего момента.
const BROKER_UTC_OFFSET_MS = 3 * 3600 * 1000;
const brokerDate = (d) => new Date(d.getTime() + BROKER_UTC_OFFSET_MS);

async function get(path, params, timeoutMs = TIMEOUT_MS) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params || {})) if (v != null) url.searchParams.set(k, String(v));
  // EA's HTTP-параметры парсятся наивным StringSplit без URL-decode — %3A
  // (закодированное URLSearchParams двоеточие из ISO-дат) там не превращается
  // обратно в ':', и валидатор формата даты отклоняет запрос. ':' не входит
  // в reserved-набор RFC 3986 для query — безопасно отправить его как есть.
  url.search = url.search.replace(/%3A/gi, ':');
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
        from_date: brokerDate(fromDate).toISOString().slice(0, 10),
        to_date: brokerDate(toDate).toISOString().slice(0, 10),
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
        from_date: brokerDate(fromDate).toISOString().slice(0, 10),
        to_date: brokerDate(toDate).toISOString().slice(0, 10),
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
      // (а не фикс 90 дней) — на плотных таймфреймах (M1/M5) это тысячи
      // лишних баров, и однопоточный EA не успевает их сериализовать в JSON
      // за отведённый таймаут ("terminated"). 1.5x — запас на выходные/
      // закрытый рынок (5/7 календарных дней реально торговые), +1 день —
      // общий запас.
      const barMinutes = TF_MINUTES[timeframe] || 5;
      const neededDays = Math.ceil(((count * barMinutes) / (24 * 60)) * 1.5) + 1;
      fromDate = new Date(toDate.getTime() - Math.min(neededDays, 90) * 24 * 60 * 60 * 1000);
    }
    // Полный datetime, не только дата: StringToTime() у EA разбирает дату
    // без времени как полночь ("2026-09-14" -> "2026-09-14 00:00:00") — то
    // есть to_date=сегодня всегда обрезал бары полуночью вместо "сейчас".
    // Формат должен быть строго ISO8601 c литерой "T" (EA сам меняет её на
    // пробел перед StringToTime — если прислать уже с пробелом, валидатор
    // формата на стороне EA отклоняет запрос с HTTP 400).
    const fmt = (d) => brokerDate(d).toISOString().slice(0, 19);
    const res = await get(
      '/history/prices',
      {
        symbol: symbol || this.symbol,
        time_frame: timeframe,
        from_date: fmt(fromDate),
        to_date: fmt(toDate),
      },
      20_000,
    );
    // На случай, если EA всё же вернул больше баров, чем реально нужно —
    // обрезаем до count с конца (свежие бары), чтобы не гонять лишнее
    // по сети и не грузить клиент.
    if (res && Array.isArray(res.data) && res.data.length > count) {
      res.data = res.data.slice(-count);
    }
    return res;
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
