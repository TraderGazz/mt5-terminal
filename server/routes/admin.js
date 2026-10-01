import { Router } from 'express';
import { query, requireDb } from '../db.js';
import { authRequired, requireRole, hashPassword } from './auth.js';
import { getBridge } from '../services/mt5-bridge/index.js';
import { ledgerReportRows } from '../services/deposit-ledger.js';

const router = Router();

// Express 4 does not catch async errors — wrap handlers.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// All admin endpoints require admin role.
router.use(authRequired, requireRole('admin'), requireDb);

// ---------- Users (roles: admin / trader / viewer) ----------

const ROLES = ['admin', 'trader', 'viewer'];

router.get('/users', wrap(async (req, res) => {
  const { rows } = await query(
    'SELECT id, login, role, name, active, created_at FROM users ORDER BY id'
  );
  res.json({ users: rows });
}));

router.post('/users', wrap(async (req, res) => {
  const { login, password, role = 'viewer', name = '' } = req.body || {};
  if (!login || !password) {
    return res.status(400).json({ error: 'login and password are required' });
  }
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${ROLES.join(', ')}` });
  }
  try {
    const { rows } = await query(
      'INSERT INTO users (login, password_hash, role, name) VALUES ($1, $2, $3, $4) RETURNING id, login, role, name, active, created_at',
      [login, hashPassword(password), role, name]
    );
    res.status(201).json({ user: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Логин уже занят' });
    throw err;
  }
}));

router.patch('/users/:id', wrap(async (req, res) => {
  const { role, name, password, active } = req.body || {};
  if (active === false && Number(req.params.id) === Number(req.user.sub)) {
    return res.status(400).json({ error: 'Cannot disable yourself' });
  }
  const updates = [];
  const params = [];
  if (role !== undefined) {
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${ROLES.join(', ')}` });
    }
    params.push(role);
    updates.push(`role = $${params.length}`);
  }
  if (name !== undefined) {
    params.push(name);
    updates.push(`name = $${params.length}`);
  }
  if (password) {
    params.push(hashPassword(password));
    updates.push(`password_hash = $${params.length}`);
  }
  if (active !== undefined) {
    params.push(Boolean(active));
    updates.push(`active = $${params.length}`);
  }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  params.push(req.params.id);
  const { rows } = await query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING id, login, role, name, active, created_at`,
    params
  );
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json({ user: rows[0] });
}));

router.delete('/users/:id', wrap(async (req, res) => {
  if (Number(req.params.id) === Number(req.user.sub)) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }
  const { rowCount } = await query('DELETE FROM users WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'User not found' });
  res.json({ deleted: true });
}));

// ---------- Sessions (кикнуть устройство / SOS — кикнуть всех) ----------

router.get('/sessions', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT s.id, s.ip, s.user_agent, s.created_at, s.last_seen_at,
            u.id AS user_id, u.login, u.role, u.name
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.revoked = false
     ORDER BY s.last_seen_at DESC`
  );
  res.json({ sessions: rows });
}));

// Кикнуть одно устройство — следующий же запрос с этим токеном получит 401.
router.post('/sessions/:id/revoke', wrap(async (req, res) => {
  const { rowCount } = await query(
    'UPDATE sessions SET revoked = true WHERE id = $1 AND revoked = false',
    [req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Session not found' });
  res.json({ revoked: true });
}));

// SOS — кикнуть буквально всех разом, включая того, кто нажал кнопку
// (заявка заказчика: моментально на экран входа).
router.post('/sessions/revoke-all', wrap(async (req, res) => {
  const { rowCount } = await query('UPDATE sessions SET revoked = true WHERE revoked = false');
  res.json({ revoked: rowCount });
}));

// ---------- Import log ----------

router.get('/imports', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT il.*, u.login AS user_login
     FROM import_log il LEFT JOIN users u ON u.id = il.user_id
     ORDER BY il.created_at DESC LIMIT 200`
  );
  res.json({ imports: rows });
}));

// ---------- Manual balance edit ----------
// Раньше PATCH писал абсолютные значения в таблицу `accounts`, которую
// bridge.account() никогда не читал — сохранение выглядело успешным, но
// ни на что не влияло (баг-репорт заказчика: "не применялось"). Теперь
// GET отдаёт текущие ЭФФЕКТИВНЫЕ показатели (с моста + уже сохранённое
// смещение), а PATCH считает НОВОЕ смещение как разницу между введённым
// значением и этими эффективными — так же, как правка позиции: показатель
// продолжает жить вместе с рынком/сделками от сдвинутой точки, а не
// замирает на введённом числе.
const toAccountResponse = (acc) => ({
  balance: acc.balance,
  equity: acc.equity,
  margin: acc.margin,
  free_margin: acc.freeMargin,
  margin_level: acc.marginLevel,
});

const BALANCE_FIELD_MAP = {
  balance: 'balance',
  equity: 'equity',
  margin: 'margin',
  free_margin: 'freeMargin',
  margin_level: 'marginLevel',
};

router.get('/balance', wrap(async (req, res) => {
  const acc = await getBridge().account();
  res.json({ account: toAccountResponse(acc) });
}));

router.patch('/balance', wrap(async (req, res) => {
  const bridge = getBridge();
  const acc = await bridge.account();
  const existing = bridge.getAccountOffset();
  const newOffset = { ...existing };
  let touched = false;
  for (const [bodyKey, accKey] of Object.entries(BALANCE_FIELD_MAP)) {
    if (req.body[bodyKey] === undefined) continue;
    const target = Number(req.body[bodyKey]);
    if (!Number.isFinite(target)) continue;
    newOffset[accKey] = existing[accKey] + (target - acc[accKey]);
    touched = true;
  }
  if (!touched) return res.status(400).json({ error: 'Nothing to update' });
  await bridge.setAccountOffset(newOffset);
  const updated = await bridge.account();
  res.json({ account: toAccountResponse(updated) });
}));

// Сброс ручной правки счёта к настоящим показаниям моста (как "Сбросить
// к реальным" у позиции).
router.delete('/balance', wrap(async (req, res) => {
  const bridge = getBridge();
  await bridge.clearAccountOffset();
  const acc = await bridge.account();
  res.json({ account: toAccountResponse(acc) });
}));

// ---------- Sync settings (auto-exchange) ----------

router.get('/sync-settings', wrap(async (req, res) => {
  const { rows } = await query('SELECT * FROM sync_settings WHERE id = 1');
  res.json({ settings: rows[0] || null });
}));

router.get('/sync-log', wrap(async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM sync_log ORDER BY created_at DESC LIMIT 100'
  );
  res.json({ log: rows });
}));

router.patch('/sync-settings', wrap(async (req, res) => {
  const { enabled, direction, reverse_enabled } = req.body || {};
  const updates = [];
  const params = [];
  if (enabled !== undefined) {
    params.push(Boolean(enabled));
    updates.push(`enabled = $${params.length}`);
  }
  if (direction !== undefined) {
    // Автообмен односторонний: терминал → сайт заказчика (ТЗ v3).
    params.push(String(direction).slice(0, 64));
    updates.push(`direction = $${params.length}`);
  }
  if (reverse_enabled !== undefined) {
    params.push(Boolean(reverse_enabled));
    updates.push(`reverse_enabled = $${params.length}`);
  }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  await query('INSERT INTO sync_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
  const { rows } = await query(
    `UPDATE sync_settings SET ${updates.join(', ')}, updated_at = now() WHERE id = 1 RETURNING *`,
    params
  );
  res.json({ settings: rows[0] });
}));

// ---------- App settings (общие переключатели, напр. видимость Истории для инвестора) ----------

router.get('/app-settings', wrap(async (req, res) => {
  const { rows } = await query('SELECT * FROM app_settings WHERE id = 1');
  res.json({ settings: rows[0] || null });
}));

router.patch('/app-settings', wrap(async (req, res) => {
  const { history_visible_to_viewer: historyVisibleToViewer, trade_maintenance_mode: tradeMaintenanceMode } = req.body || {};
  if (historyVisibleToViewer === undefined && tradeMaintenanceMode === undefined) {
    return res.status(400).json({ error: 'Nothing to update' });
  }
  await query('INSERT INTO app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
  const updates = [];
  const params = [];
  if (historyVisibleToViewer !== undefined) {
    params.push(Boolean(historyVisibleToViewer));
    updates.push(`history_visible_to_viewer = $${params.length}`);
  }
  if (tradeMaintenanceMode !== undefined) {
    params.push(Boolean(tradeMaintenanceMode));
    updates.push(`trade_maintenance_mode = $${params.length}`);
  }
  const { rows } = await query(
    `UPDATE app_settings SET ${updates.join(', ')}, updated_at = now() WHERE id = 1 RETURNING *`,
    params
  );
  res.json({ settings: rows[0] });
}));

// ---------- Report export (HTML / CSV) ----------

function toCsv(rows) {
  const header = 'ticket;symbol;type;volume;open_price;close_price;profit;swap;commission;open_time;close_time;comment';
  const esc = (v) => (v == null ? '' : String(v).replace(/;/g, ','));
  const lines = rows.map((t) =>
    [
      t.ticket, t.symbol, t.type, t.volume, t.open_price, t.close_price,
      t.profit, t.swap, t.commission,
      t.open_time ? new Date(t.open_time).toISOString() : '',
      t.close_time ? new Date(t.close_time).toISOString() : '',
      esc(t.comment),
    ].join(';')
  );
  return [header, ...lines].join('\n');
}

// Храним отметки времени как "брокерские цифры в UTC-полях" (см.
// client/src/lib/format.ts toBroker()) — чтобы время в отчёте совпадало с
// тем, что пользователь уже видит в Истории/Торговле, повторяем тот же
// сдвиг +3ч и читаем через getUTC*, а не локальные геттеры/toLocaleString.
const BROKER_OFFSET_MS = 3 * 3600 * 1000;
const pad2 = (n) => String(n).padStart(2, '0');
function fmtDateTime(d) {
  if (!d) return '';
  const dt = new Date(new Date(d).getTime() + BROKER_OFFSET_MS);
  if (Number.isNaN(dt.getTime())) return '';
  return `${dt.getUTCFullYear()}.${pad2(dt.getUTCMonth() + 1)}.${pad2(dt.getUTCDate())} ${pad2(dt.getUTCHours())}:${pad2(dt.getUTCMinutes())}:${pad2(dt.getUTCSeconds())}`;
}

// Числа как в настоящем MT5-отчёте: пробел между тройками разрядов,
// две цифры после точки (точка, не запятая — см. reference-отчёт заказчика).
function fmtNum(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '';
  const num = Number(n);
  const neg = num < 0;
  const [intPart, dec] = Math.abs(num).toFixed(2).split('.');
  const spaced = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${neg ? '-' : ''}${spaced}.${dec}`;
}

// Цены FX — 5 знаков после точки, без разделителя тысяч.
function fmtPrice(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '';
  return Number(n).toFixed(5);
}

const LEDGER_LABELS = { balance: 'Пополнение', withdrawal: 'Снятие', cfd: 'CFD' };

/**
 * meta: { holder, login, currency, company, server, account: { balance,
 * equity, margin, freeMargin, marginLevel, floatingProfit } } — см. GET
 * /api/account для источника этих же полей.
 */
function toHtml(rows, meta = {}) {
  const esc = (v) =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const acc = meta.account || {};

  const tradeRows = rows.filter((t) => t.deal_type === 'buy' || t.deal_type === 'sell');
  const ledgerRows = rows.filter((t) => t.deal_type !== 'buy' && t.deal_type !== 'sell');

  let swapSum = 0;
  let profitSum = 0;
  const positionTrs = tradeRows
    .map((t, i) => {
      swapSum += Number(t.swap) || 0;
      profitSum += Number(t.profit) || 0;
      const bg = i % 2 === 0 ? '#FFFFFF' : '#F7F7F7';
      return `<tr bgcolor="${bg}" align="right"><td>${fmtDateTime(t.open_time)}</td><td>${esc(t.ticket)}</td><td>${esc(t.symbol)}</td><td>${esc(t.type)}</td><td>${fmtNum(t.volume)}</td><td>${fmtPrice(t.open_price)}</td><td></td><td></td><td>${fmtDateTime(t.close_time)}</td><td>${fmtPrice(t.close_price)}</td><td>${fmtNum(t.commission)}</td><td>${fmtNum(t.swap)}</td><td colspan="2"><b>${fmtNum(t.profit)}</b></td></tr>`;
    })
    .join('\n');

  const ledgerTrs = ledgerRows
    .map((t, i) => {
      const bg = i % 2 === 0 ? '#FFFFFF' : '#F7F7F7';
      const label = LEDGER_LABELS[t.deal_type] || t.deal_type;
      return `<tr bgcolor="${bg}" align="right"><td>${fmtDateTime(t.close_time)}</td><td>${esc(t.ticket)}</td><td colspan="2">${esc(label)}</td><td colspan="8"></td><td colspan="2"><b>${fmtNum(t.profit)}</b></td></tr>`;
    })
    .join('\n');

  const profits = tradeRows.map((t) => Number(t.profit) || 0);
  const wins = profits.filter((p) => p > 0);
  const losses = profits.filter((p) => p < 0);
  const grossProfit = wins.reduce((a, b) => a + b, 0);
  const grossLoss = losses.reduce((a, b) => a + b, 0);
  const netProfit = grossProfit + grossLoss;
  const profitFactor = grossLoss !== 0 ? Math.abs(grossProfit / grossLoss) : 0;
  const expectedPayoff = profits.length ? netProfit / profits.length : 0;
  const winRate = profits.length ? (wins.length / profits.length) * 100 : 0;
  const lossRate = profits.length ? (losses.length / profits.length) * 100 : 0;
  const bestTrade = profits.length ? Math.max(...profits) : 0;
  const worstTrade = profits.length ? Math.min(...profits) : 0;
  const avgWin = wins.length ? grossProfit / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">
<html>
<head>
<meta charset="utf-8">
<title>${esc(meta.login)}: ${esc(meta.holder)} - Торговый отчет</title>
<style type="text/css">
<!--
@media screen { td { font: 8pt Tahoma,Arial; } th { font: 10pt Tahoma,Arial; } }
@media print { td { font: 7pt Tahoma,Arial; } th { font: 9pt Tahoma,Arial; } }
body { margin: 1px; }
//-->
</style>
</head>
<body>
<div align="center">
<table cellspacing="1" cellpadding="3" border="0">
<tr align="center"><td colspan="13"><div style="font: 14pt Tahoma"><b>Торговый отчет</b></div></td></tr>
<tr align="left"><th colspan="3" nowrap align="right">Имя:</th><th colspan="10" nowrap align="left"><b>${esc(meta.holder)}</b></th></tr>
<tr align="left"><th colspan="3" nowrap align="right">Торговый счет:</th><th colspan="10" nowrap align="left"><b>${esc(meta.login)}&nbsp;(${esc(meta.currency)},&nbsp;${esc(meta.server)})</b></th></tr>
<tr align="left"><th colspan="3" nowrap align="right">Компания:</th><th colspan="10" nowrap align="left"><b>${esc(meta.company)}</b></th></tr>
<tr align="left"><th colspan="3" nowrap align="right">Дата:</th><th colspan="10" nowrap align="left"><b>${fmtDateTime(new Date())}</b></th></tr>
<tr align="center"><th colspan="13" style="height: 25px"><div style="font: 10pt Tahoma"><b>Позиции</b></div></th></tr>
<tr align="right" bgcolor="#E5F0FC">
<td nowrap><b>Время</b></td><td nowrap><b>Позиция</b></td><td nowrap><b>Символ</b></td><td nowrap><b>Тип</b></td>
<td nowrap><b>Объем</b></td><td nowrap><b>Цена</b></td><td nowrap><b>S / L</b></td><td nowrap><b>T / P</b></td>
<td nowrap><b>Время закрытия</b></td><td nowrap><b>Цена закрытия</b></td><td nowrap><b>Комиссия</b></td>
<td nowrap><b>Своп</b></td><td nowrap colspan="2"><b>Прибыль</b></td>
</tr>
${positionTrs}
<tr align="right"><td colspan="11" style="height: 30px"></td><td nowrap><b>${fmtNum(swapSum)}</b></td><td nowrap colspan="2"><b>${fmtNum(profitSum)}</b></td></tr>
${ledgerTrs ? `<tr><td colspan="13" style="height: 10px"></td></tr>
<tr align="center"><th colspan="13" style="height: 25px"><div style="font: 10pt Tahoma"><b>Балансовые операции</b></div></th></tr>
${ledgerTrs}` : ''}
<tr align="right"><td colspan="13" style="height: 10px"></td></tr>
<tr align="right">
<td colspan="3" style="height: 20px">Баланс:</td><td colspan="2"><b>${fmtNum(acc.balance)}</b></td><td></td>
<td colspan="3">Свободная маржа:</td><td colspan="2"><b>${fmtNum(acc.freeMargin)}</b></td>
</tr>
<tr align="right">
<td colspan="3" style="height: 20px">Плавающая прибыль/убыток:</td><td colspan="2"><b>${fmtNum(acc.floatingProfit)}</b></td><td></td>
<td colspan="3">Маржа:</td><td colspan="2"><b>${fmtNum(acc.margin)}</b></td>
</tr>
<tr align="right">
<td colspan="3" style="height: 20px">Средства:</td><td colspan="2"><b>${fmtNum(acc.equity)}</b></td><td></td>
<td colspan="3">Уровень маржи:</td><td colspan="2"><b>${acc.marginLevel != null ? `${fmtNum(acc.marginLevel)}%` : ''}</b></td>
</tr>
</table>
<table cellspacing="1" cellpadding="3" border="0">
<tr><td colspan="13" align="center" style="height:30px"><div style="font: 10pt Tahoma"><b>Результаты</b></div></td></tr>
<tr align="right">
<td nowrap colspan="3">Чистая прибыль:</td><td nowrap><b>${fmtNum(netProfit)}</b></td>
<td nowrap colspan="3">Общая прибыль:</td><td nowrap><b>${fmtNum(grossProfit)}</b></td>
<td nowrap colspan="3">Общий убыток:</td><td nowrap colspan="2"><b>${fmtNum(grossLoss)}</b></td>
</tr>
<tr align="right">
<td nowrap colspan="3">Прибыльность:</td><td nowrap><b>${profitFactor.toFixed(2)}</b></td>
<td nowrap colspan="3">Матожидание выигрыша:</td><td nowrap><b>${fmtNum(expectedPayoff)}</b></td>
</tr>
<tr><td nowrap style="height: 10px"></td></tr>
<tr align="right">
<td nowrap colspan="3">Всего трейдов:</td><td nowrap><b>${profits.length}</b></td>
<td nowrap colspan="3">Прибыльные трейды (% от всех):</td><td nowrap><b>${wins.length} (${winRate.toFixed(2)}%)</b></td>
<td nowrap colspan="3">Убыточные трейды (% от всех):</td><td nowrap colspan="2"><b>${losses.length} (${lossRate.toFixed(2)}%)</b></td>
</tr>
<tr align="right">
<td nowrap colspan="4"></td>
<td nowrap colspan="3">Самый большой прибыльный трейд:</td><td nowrap><b>${fmtNum(bestTrade)}</b></td>
<td nowrap colspan="3">Самый большой убыточный трейд:</td><td nowrap colspan="2"><b>${fmtNum(worstTrade)}</b></td>
</tr>
<tr align="right">
<td nowrap colspan="4"></td>
<td nowrap colspan="3">Средний прибыльный трейд:</td><td nowrap><b>${fmtNum(avgWin)}</b></td>
<td nowrap colspan="3">Средний убыточный трейд:</td><td nowrap colspan="2"><b>${fmtNum(avgLoss)}</b></td>
</tr>
</table>
</div>
</body>
</html>`;
}

// GET /api/admin/report?format=html|csv&from=&to=&symbol=
router.get('/report', wrap(async (req, res) => {
  const { format = 'html', from, to, symbol } = req.query;
  const where = [
    // EA-синхронизированные balance/withdrawal (тикет > 0) — известный
    // мусор терминала (напр. "demo deposit"), в отчёт не идут; вместо них
    // ниже подмешивается официальная выписка + ручные записи из админки
    // (тикет < 0), см. ledgerReportRows и заявку заказчика в
    // deposit-ledger.js. Сами сделки/CFD этот фильтр не трогает.
    `NOT (deal_type IN ('balance', 'withdrawal') AND ticket > 0)`,
  ];
  const params = [];
  if (symbol && symbol !== 'all') {
    params.push(symbol);
    where.push(`symbol = $${params.length}`);
  }
  if (from) {
    params.push(new Date(from));
    where.push(`close_time >= $${params.length}`);
  }
  if (to) {
    params.push(new Date(to));
    where.push(`close_time <= $${params.length}`);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const { rows: tradeRows } = await query(
    `SELECT * FROM trades ${whereSql} ORDER BY close_time ASC NULLS LAST`,
    params
  );

  // Строки из выписки — только когда не выбран конкретный символ (у
  // депозита/снятия символа нет, как и в Истории на сайте/в админке).
  const fromMs = from ? new Date(from).getTime() : -Infinity;
  const toMs = to ? new Date(to).getTime() : Infinity;
  const ledgerRows = symbol && symbol !== 'all' ? [] : ledgerReportRows(fromMs, toMs);

  const rows = [...tradeRows, ...ledgerRows].sort(
    (a, b) => new Date(a.close_time ?? 0).getTime() - new Date(b.close_time ?? 0).getTime(),
  );

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="report.csv"');
    return res.send(toCsv(rows));
  }

  // Шапка/подвал отчёта — те же реквизиты и живой снимок счёта, что и в
  // GET /api/account (заявка заказчика: отчёт должен выглядеть как
  // оригинальный MT5-экспорт, с "Имя/Торговый счёт/Компания/Дата" наверху
  // и "Баланс/Средства/Маржа/Уровень маржи" внизу).
  let meta = { holder: '', login: '', currency: 'RUB', company: 'ООО «Альфа-Форекс»', server: '', account: {} };
  try {
    const { rows: accRows } = await query(
      'SELECT account_number, holder, company, server, currency FROM accounts ORDER BY id LIMIT 1'
    );
    const stored = accRows[0] || null;
    const bridge = getBridge();
    const acc = await bridge.account();
    meta = {
      holder: stored?.holder || acc.name || '',
      login: acc.login || stored?.account_number || '',
      currency: acc.currency || stored?.currency || 'RUB',
      company: stored?.company || 'ООО «Альфа-Форекс»',
      server: acc.server || stored?.server || '',
      account: acc,
    };
  } catch (err) {
    console.error('[report] account snapshot unavailable:', err.message);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="report.html"');
  res.send(toHtml(rows, meta));
}));

export default router;
