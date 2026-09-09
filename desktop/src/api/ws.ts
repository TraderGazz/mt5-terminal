import { wsUrl } from '@/config';
import { getToken } from './auth';

type Handler = (data: unknown) => void;

class WsClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private channels = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private delay = 1000;

  private connect() {
    if (this.ws) return;
    const token = getToken();
    if (!token) return;
    let ws: WebSocket;
    try { ws = new WebSocket(wsUrl(token)); } catch { this.retry(); return; }
    this.ws = ws;
    ws.onopen = () => { this.delay = 1000; if (this.channels.size) this.send({ op: 'subscribe', channels: [...this.channels] }); };
    ws.onmessage = (e) => {
      let m: { channel?: string; data?: unknown };
      try { m = JSON.parse(e.data); } catch { return; }
      if (!m.channel) return;
      this.handlers.get(m.channel)?.forEach((h) => h(m.data));
    };
    ws.onclose = () => { this.ws = null; this.retry(); };
    ws.onerror = () => { try { ws.close(); } catch { /* */ } };
  }
  private retry() {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.delay = Math.min(this.delay * 1.6, 15000); this.connect(); }, this.delay);
  }
  private send(o: unknown) { if (this.ws?.readyState === WebSocket.OPEN) { try { this.ws.send(JSON.stringify(o)); } catch { /* */ } } }

  on(channel: string, h: Handler): () => void {
    let s = this.handlers.get(channel);
    if (!s) { s = new Set(); this.handlers.set(channel, s); }
    s.add(h);
    if (!this.channels.has(channel)) { this.channels.add(channel); this.connect(); this.send({ op: 'subscribe', channels: [channel] }); }
    return () => {
      const set = this.handlers.get(channel);
      set?.delete(h);
      if (set && set.size === 0) { this.handlers.delete(channel); this.channels.delete(channel); this.send({ op: 'unsubscribe', channels: [channel] }); }
    };
  }
  reconnect() { try { this.ws?.close(); } catch { /* */ } this.ws = null; this.connect(); }
}
export const wsClient = new WsClient();
