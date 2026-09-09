import { wsUrl } from '@/config';
import { getToken } from './auth';

type Handler = (data: unknown) => void;

/**
 * Единый WebSocket-клиент к хабу backend (/ws).
 * Используется только в режиме VITE_DATA_SOURCE=api.
 * Каналы: quote | account | positions | trade | candle:<TF> | status.
 */
class WsClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private desiredChannels = new Set<string>();
  private reconnectDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closedByUs = false;

  private ensureConnected() {
    if (this.ws || this.closedByUs) return;
    const token = getToken();
    if (!token) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl(token));
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectDelay = 1000;
      if (this.desiredChannels.size) {
        this.rawSend({ op: 'subscribe', channels: [...this.desiredChannels] });
      }
    };
    ws.onmessage = (ev) => {
      let msg: { channel?: string; data?: unknown; op?: string };
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (!msg.channel) return;
      const set = this.handlers.get(msg.channel);
      if (set) for (const h of set) h(msg.data);
    };
    ws.onclose = () => {
      this.ws = null;
      if (!this.closedByUs) this.scheduleReconnect();
    };
    ws.onerror = () => {
      try { ws.close(); } catch { /* noop */ }
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.closedByUs) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.6, 15000);
      this.ensureConnected();
    }, this.reconnectDelay);
  }

  private rawSend(obj: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try { this.ws.send(JSON.stringify(obj)); } catch { /* noop */ }
    }
  }

  /** Подписаться на канал. Возвращает функцию отписки. */
  on(channel: string, handler: Handler): () => void {
    let set = this.handlers.get(channel);
    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
    }
    set.add(handler);

    if (!this.desiredChannels.has(channel)) {
      this.desiredChannels.add(channel);
      this.closedByUs = false;
      this.ensureConnected();
      this.rawSend({ op: 'subscribe', channels: [channel] });
    }

    return () => {
      const s = this.handlers.get(channel);
      if (!s) return;
      s.delete(handler);
      if (s.size === 0) {
        this.handlers.delete(channel);
        this.desiredChannels.delete(channel);
        this.rawSend({ op: 'unsubscribe', channels: [channel] });
      }
    };
  }

  /** Явно переустановить соединение (после логина). */
  reconnect() {
    this.closedByUs = false;
    try { this.ws?.close(); } catch { /* noop */ }
    this.ws = null;
    this.ensureConnected();
  }

  close() {
    this.closedByUs = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    try { this.ws?.close(); } catch { /* noop */ }
    this.ws = null;
  }
}

export const wsClient = new WsClient();
