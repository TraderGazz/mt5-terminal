import { Router } from 'express';
import { query, requireDb } from '../db.js';
import { authRequired, requireRole, hashPassword } from './auth.js';

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

const BALANCE_FIELDS = ['balance', 'equity', 'margin', 'free_margin', 'margin_level'];

router.get('/balance', wrap(async (req, res) => {
  const { rows } = await query('SELECT * FROM accounts ORDER BY id LIMIT 1');
  res.json({ account: rows[0] || null });
}));

router.patch('/balance', wrap(async (req, res) => {
  const updates = [];
  const params = [];
  for (const field of BALANCE_FIELDS) {
    if (req.body[field] !== undefined) {
      params.push(Number(req.body[field]));
      updates.push(`${field} = $${params.length}`);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  const { rows } = await query(
    `UPDATE accounts SET ${updates.join(', ')}, updated_at = now()
     WHERE id = (SELECT id FROM accounts ORDER BY id LIMIT 1) RETURNING *`,
    params
  );
  if (!rows[0]) return res.status(404).json({ error: 'Account not found (run init.sql)' });
  res.json({ account: rows[0] });
}));

// ---------- Sync settings (auto-exchange) ----------

router.get('/sync-settings', wrap(async (req, res) => {
  const { rows } = await query('SELECT * FROM sync_settings WHERE id = 1');
  res.json({ settings: rows[0] || null });
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

function toHtml(rows) {
  const esc = (v) =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const trs = rows
    .map(
      (t) => `<tr>
<td>${esc(t.ticket)}</td><td>${esc(t.symbol)}</td><td>${esc(t.type)}</td>
<td>${esc(t.volume)}</td><td>${esc(t.open_price)}</td><td>${esc(t.close_price)}</td>
<td>${esc(t.profit)}</td><td>${esc(t.swap)}</td><td>${esc(t.commission)}</td>
<td>${t.open_time ? esc(new Date(t.open_time).toISOString()) : ''}</td>
<td>${t.close_time ? esc(new Date(t.close_time).toISOString()) : ''}</td>
<td>${esc(t.comment)}</td></tr>`
    )
    .join('\n');
  return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><title>Торговый отчёт</title>
<style>body{font-family:Tahoma,sans-serif}table{border-collapse:collapse;width:100%}
td,th{border:1px solid #ccc;padding:4px 8px;font-size:13px}th{background:#f5f5f5}</style>
</head><body>
<h2>Торговый отчёт</h2>
<table><thead><tr>
<th>Тикет</th><th>Символ</th><th>Тип</th><th>Объём</th><th>Цена открытия</th>
<th>Цена закрытия</th><th>Прибыль</th><th>Своп</th><th>Комиссия</th>
<th>Время открытия</th><th>Время закрытия</th><th>Комментарий</th>
</tr></thead><tbody>
${trs}
</tbody></table>
</body></html>`;
}

// GET /api/admin/report?format=html|csv&from=&to=&symbol=
router.get('/report', wrap(async (req, res) => {
  const { format = 'html', from, to, symbol } = req.query;
  const where = [];
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
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT * FROM trades ${whereSql} ORDER BY close_time ASC NULLS LAST`,
    params
  );

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="report.csv"');
    return res.send(toCsv(rows));
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="report.html"');
  res.send(toHtml(rows));
}));

export default router;
