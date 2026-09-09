// WebSocket-хаб: раздаёт live-данные MT5-моста всем клиентам терминала.
//
// Подключение:  ws://<host>/ws?token=<JWT>
// Клиент → сервер:
//   { "op": "subscribe",   "channels": ["quote","account","positions","trade","candle:M5"] }
//   { "op": "unsubscribe", "channels": [...] }
//   { "op": "ping" }
// Сервер → клиент:
//   { "channel": "welcome",   "data": { symbol, serverTime } }
//   { "channel": "status",    "data": { connected, stale, mode } }
//   { "channel": "quote",     "data": { symbol, bid, ask, spread, digits, time } }
//   { "channel": "account",   "data": { ...нормализованный счёт... } }
//   { "channel": "positions", "data": [ ...позиции... ] }
//   { "channel": "trade",     "data": { ticket, side, reason, profit, ... } }
//   { "channel": "candle:M5", "data": { timeframe, bars: [...] } }
//   { "op": "pong" }
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { getBridge } from './mt5-bridge/index.js';

const JWT_SECRET = () => process.env.JWT_SECRET || 'dev-insecure-secret';
const SNAPSHOT_THROTTLE_MS = 1500;
const HEARTBEAT_MS = 30_000;

export function attachWsHub(server) {
  const bridge = getBridge();
  const wss = new WebSocketServer({ server, path: '/ws' });

  /** @type {Set<import('ws').WebSocket>} */
  const clients = new Set();

  function verify(req) {
    try {
      const url = new URL(req.url, 'http://x');
      const token = url.searchParams.get('token');
      if (!token) return null;
      return jwt.verify(token, JWT_SECRET());
    } catch {
      return null;
    }
  }

  function send(ws, obj) {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(JSON.stringify(obj)); } catch { /* noop */ }
    }
  }

  function broadcast(channel, data) {
    const payload = JSON.stringify({ channel, data });
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN && ws.channels.has(channel)) {
        try { ws.send(payload); } catch { /* noop */ }
      }
    }
  }

  function anySubscribed(channel) {
    for (const ws of clients) if (ws.channels.has(channel)) return true;
    return false;
  }

  wss.on('connection', (ws, req) => {
    const user = verify(req);
    if (!user) {
      ws.close(4401, 'Unauthorized');
      return;
    }
    ws.user = user;
    ws.channels = new Set();
    ws.isAlive = true;
    clients.add(ws);

    send(ws, { channel: 'welcome', data: { symbol: bridge.symbol, serverTime: new Date().toISOString() } });
    send(ws, { channel: 'status', data: bridge.status() });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.op === 'ping') return send(ws, { op: 'pong' });
      if (msg.op === 'subscribe' && Array.isArray(msg.channels)) {
        for (const c of msg.channels) ws.channels.add(String(c));
        // сразу отдать текущее состояние по подписанным снапшот-каналам
        if (ws.channels.has('account')) pushAccount(ws);
        if (ws.channels.has('positions')) pushPositions(ws);
      }
      if (msg.op === 'unsubscribe' && Array.isArray(msg.channels)) {
        for (const c of msg.channels) ws.channels.delete(String(c));
      }
    });

    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });

  // ---- снапшоты счёта/позиций (троттлинг) ----
  let lastSnapshotAt = 0;
  let snapshotInFlight = false;

  async function pushAccount(target) {
    try {
      const acc = await bridge.account();
      if (target) send(target, { channel: 'account', data: acc });
      else broadcast('account', acc);
    } catch { /* мост недоступен — молчим, статус отдельно */ }
  }

  async function pushPositions(target) {
    try {
      const pos = await bridge.positions();
      if (target) send(target, { channel: 'positions', data: pos });
      else broadcast('positions', pos);
    } catch { /* noop */ }
  }

  async function pushSnapshotThrottled() {
    const now = Date.now();
    if (snapshotInFlight || now - lastSnapshotAt < SNAPSHOT_THROTTLE_MS) return;
    if (!anySubscribed('account') && !anySubscribed('positions')) return;
    snapshotInFlight = true;
    lastSnapshotAt = now;
    try {
      if (anySubscribed('positions')) await pushPositions();
      if (anySubscribed('account')) await pushAccount();
    } finally {
      snapshotInFlight = false;
    }
  }

  // ---- события моста ----
  bridge.on('quote', (q) => {
    broadcast('quote', q);
    pushSnapshotThrottled(); // цена сдвинулась → P/L позиций и equity тоже
  });

  bridge.on('candle', (c) => {
    broadcast(`candle:${c.timeframe}`, c);
  });

  bridge.on('trade', async (t) => {
    broadcast('trade', t);
    // сделка изменила позиции и баланс — обновить немедленно
    lastSnapshotAt = 0;
    await pushPositions();
    await pushAccount();
  });

  bridge.on('status', (s) => broadcast('status', { ...bridge.status(), ...s }));

  // ---- heartbeat ----
  const hb = setInterval(() => {
    for (const ws of clients) {
      if (!ws.isAlive) { ws.terminate(); clients.delete(ws); continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch { /* noop */ }
    }
  }, HEARTBEAT_MS);
  hb.unref?.();

  wss.on('close', () => clearInterval(hb));

  console.log('[ws-hub] /ws подключён');
  return wss;
}
