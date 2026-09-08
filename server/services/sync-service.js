// Auto-exchange service between sites (TZ 4.4).
// Main direction: Rusinvest -> AlfaForex. Reverse direction only when the
// flag in the sync_settings table is enabled by an admin.
// Runs every 5 minutes via node-cron; every cycle is written to sync_log.
import cron from 'node-cron';
import { query, isDbReady } from '../db.js';

const SYNC_API_KEY = () => process.env.SYNC_API_KEY || '';

export function parsePeers() {
  // SYNC_PEERS="rusinvest=https://a.example.com,alfaforex=https://b.example.com"
  const peers = {};
  for (const pair of String(process.env.SYNC_PEERS || '').split(',')) {
    const [name, url] = pair.split('=').map((s) => s && s.trim());
    if (name && url) peers[name] = url.replace(/\/$/, '');
  }
  return peers;
}

async function getSettings() {
  const { rows } = await query('SELECT * FROM sync_settings WHERE id = 1');
  return (
    rows[0] || {
      enabled: process.env.SYNC_ENABLED === 'true',
      direction: process.env.SYNC_DIRECTION || 'rusinvest_to_alfaforex',
      reverse_enabled: false,
    }
  );
}

async function logSync(direction, peer, status, detail) {
  try {
    await query(
      'INSERT INTO sync_log (direction, peer, status, detail) VALUES ($1, $2, $3, $4)',
      [direction, peer, status, detail ? String(detail).slice(0, 2000) : null]
    );
  } catch (err) {
    console.error('[sync] failed to write sync_log:', err.message);
  }
}

async function postJson(url, body) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SYNC_API_KEY()}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} from ${url}`);
  }
  return resp.json().catch(() => ({}));
}

async function getJson(url) {
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${SYNC_API_KEY()}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} from ${url}`);
  }
  return resp.json();
}

// Pull data from a peer and store locally.
async function pullFromPeer(peerName, peerUrl) {
  // Balance -> accounts (account 50214896 by TZ).
  const balance = await getJson(`${peerUrl}/api/sync/balance`);
  if (balance && typeof balance === 'object' && balance.balance !== undefined) {
    await query(
      `UPDATE accounts SET balance = $1, equity = $2, margin = $3,
         free_margin = $4, margin_level = $5, updated_at = now()
       WHERE account_number = $6`,
      [
        balance.balance, balance.equity ?? balance.balance,
        balance.margin ?? 0, balance.free_margin ?? 0,
        balance.margin_level ?? 0, balance.account_number || '50214896',
      ]
    );
  }
  // Trades -> trades (upsert by ticket, never touch edited rows).
  const data = await getJson(`${peerUrl}/api/sync/trades`);
  const trades = Array.isArray(data?.trades) ? data.trades : [];
  let n = 0;
  for (const t of trades) {
    if (t.ticket == null) continue;
    const { rowCount } = await query(
      `INSERT INTO trades
         (ticket, symbol, type, volume, open_price, close_price, profit, swap,
          commission, open_time, close_time, comment, position_id, order_ticket)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (ticket) DO NOTHING`,
      [
        t.ticket, t.symbol, t.type, t.volume, t.open_price, t.close_price,
        t.profit, t.swap, t.commission, t.open_time, t.close_time,
        t.comment, t.position_id, t.order_ticket,
      ]
    );
    n += rowCount;
  }
  return n;
}

// Push local data to a peer.
async function pushToPeer(peerName, peerUrl) {
  const { rows: accounts } = await query('SELECT * FROM accounts LIMIT 1');
  if (accounts[0]) {
    await postJson(`${peerUrl}/api/sync/balance`, accounts[0]);
  }
  const { rows: trades } = await query(
    'SELECT * FROM trades ORDER BY close_time DESC NULLS LAST LIMIT 500'
  );
  await postJson(`${peerUrl}/api/sync/positions`, { trades });
  return trades.length;
}

export async function runSyncCycle() {
  if (!isDbReady()) {
    console.warn('[sync] DB not ready — cycle skipped');
    return;
  }
  let settings;
  try {
    settings = await getSettings();
  } catch (err) {
    console.error('[sync] failed to read settings:', err.message);
    return;
  }
  if (!settings.enabled) return; // silently disabled

  const peers = parsePeers();
  const direction = settings.direction || 'rusinvest_to_alfaforex';
  const [from, to] = direction.split('_to_');
  const jobs = [];
  // Main direction: pull from source peer.
  if (peers[from]) jobs.push({ kind: 'pull', peer: from, url: peers[from] });
  // Reverse direction only when explicitly enabled by admin flag.
  if (settings.reverse_enabled && peers[to]) {
    jobs.push({ kind: 'push', peer: to, url: peers[to] });
  }
  if (!jobs.length) {
    await logSync(direction, null, 'skipped', 'no peers configured (SYNC_PEERS)');
    return;
  }

  for (const job of jobs) {
    try {
      const n =
        job.kind === 'pull'
          ? await pullFromPeer(job.peer, job.url)
          : await pushToPeer(job.peer, job.url);
      await logSync(`${job.kind}:${job.peer}`, job.url, 'ok', `${n} records`);
      console.log(`[sync] ${job.kind} ${job.peer}: ok (${n} records)`);
    } catch (err) {
      await logSync(`${job.kind}:${job.peer}`, job.url, 'error', err.message);
      console.error(`[sync] ${job.kind} ${job.peer}:`, err.message);
    }
  }
}

export function startSyncScheduler() {
  // Every 5 minutes per TZ 4.4.
  cron.schedule('*/5 * * * *', () => {
    runSyncCycle().catch((err) => console.error('[sync] cycle failed:', err.message));
  });
  console.log('[sync] scheduler started (every 5 min), enabled =', process.env.SYNC_ENABLED === 'true');
}
