// Автообмен (ТЗ 4.4, уточнение заказчика 08.09.2026): ОДНОСТОРОННИЙ —
// терминал → сайт заказчика (my-alfaforex.ru), передаётся баланс счёта.
// Раз в SYNC_INTERVAL_MIN минут (по умолчанию 5) читаем снапшот счёта из БД
// и POST-им на SYNC_TARGET_URL с ключом SYNC_API_KEY. Каждый цикл — в sync_log.
//
// Env:
//   SYNC_ENABLED=true|false
//   SYNC_TARGET_URL=https://my-alfaforex.ru/api/terminal/balance
//   SYNC_API_KEY=<общий секрет>
//   SYNC_INTERVAL_MIN=5
import cron from 'node-cron';
import { query, isDbReady } from '../db.js';

const cfg = () => ({
  enabled: process.env.SYNC_ENABLED === 'true',
  targetUrl: (process.env.SYNC_TARGET_URL || '').trim(),
  apiKey: process.env.SYNC_API_KEY || '',
  intervalMin: Math.max(1, Number(process.env.SYNC_INTERVAL_MIN) || 5),
});

// Совместимость со старым API (routes/*, тесты): вернуть цель как «пир».
export function parsePeers() {
  const { targetUrl } = cfg();
  return targetUrl ? { site: targetUrl } : {};
}

async function getSettings() {
  try {
    const { rows } = await query('SELECT * FROM sync_settings WHERE id = 1');
    if (rows[0]) return rows[0];
  } catch { /* БД не готова */ }
  const c = cfg();
  return { enabled: c.enabled, direction: 'terminal_to_site', reverse_enabled: false };
}

async function logSync(direction, peer, status, detail) {
  try {
    await query('INSERT INTO sync_log (direction, peer, status, detail) VALUES ($1,$2,$3,$4)', [
      direction, peer, status, detail ? String(detail).slice(0, 2000) : null,
    ]);
  } catch (err) {
    console.error('[sync] не записан sync_log:', err.message);
  }
}

async function pushBalance(targetUrl, apiKey) {
  const { rows } = await query(
    `SELECT account_number, currency, balance, equity, margin, free_margin,
            margin_level, floating_profit, updated_at
       FROM accounts ORDER BY id LIMIT 1`,
  );
  const a = rows[0];
  if (!a) {
    await logSync('terminal_to_site', targetUrl, 'skipped', 'нет счёта в БД');
    return;
  }
  const payload = {
    account_number: a.account_number,
    currency: a.currency,
    balance: Number(a.balance),
    equity: Number(a.equity),
    margin: Number(a.margin),
    free_margin: Number(a.free_margin),
    margin_level: Number(a.margin_level),
    floating_profit: Number(a.floating_profit),
    updated_at: a.updated_at,
    sent_at: new Date().toISOString(),
  };
  const res = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}`, 'X-Api-Key': apiKey } : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} от ${targetUrl}`);
  await logSync('terminal_to_site', targetUrl, 'ok', `баланс ${payload.balance} ${payload.currency}`);
  console.log(`[sync] баланс отправлен на ${targetUrl}`);
}

export async function runSyncCycle() {
  if (!isDbReady()) return;
  const c = cfg();
  const settings = await getSettings();
  const enabled = settings.enabled ?? c.enabled;
  if (!enabled) return;
  if (!c.targetUrl) {
    await logSync('terminal_to_site', null, 'skipped', 'SYNC_TARGET_URL не задан');
    return;
  }
  try {
    await pushBalance(c.targetUrl, c.apiKey);
  } catch (err) {
    await logSync('terminal_to_site', c.targetUrl, 'error', err.message);
    console.error('[sync] ошибка отправки:', err.message);
  }
}

let task = null;
export function startSyncScheduler() {
  const c = cfg();
  task?.stop();
  task = cron.schedule(`*/${c.intervalMin} * * * *`, () => {
    runSyncCycle().catch((err) => console.error('[sync] цикл упал:', err.message));
  });
  console.log(
    `[sync] планировщик: каждые ${c.intervalMin} мин, enabled=${c.enabled}, ` +
      `target=${c.targetUrl || '(не задан)'}`,
  );
}
