import { Router } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { query, requireDb, isDbReady } from '../db.js';

const router = Router();

const JWT_SECRET = () => process.env.JWT_SECRET || 'dev-insecure-secret';
const JWT_EXPIRES_IN = () => process.env.JWT_EXPIRES_IN || '30d';

// --- password hashing (scrypt, no external deps) ---
// Format: scrypt$<salt_hex>$<hash_hex>
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, salt, hash] = String(stored).split('$');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const candidate = crypto.scryptSync(String(password), salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

// Seed initial admin from env if the users table is empty.
export async function ensureSeedAdmin() {
  if (!isDbReady()) return;
  try {
    const { rows } = await query('SELECT COUNT(*)::int AS n FROM users');
    if (rows[0].n > 0) return;
    const login = process.env.ADMIN_LOGIN || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    await query(
      'INSERT INTO users (login, password_hash, role, name) VALUES ($1, $2, $3, $4)',
      [login, hashPassword(password), 'admin', 'Администратор']
    );
    console.log(`[auth] seeded admin user "${login}" (change ADMIN_PASSWORD in .env!)`);
  } catch (err) {
    console.error('[auth] failed to seed admin:', err.message);
  }
}

// POST /api/auth/login
router.post('/login', requireDb, async (req, res) => {
  const { login, password } = req.body || {};
  if (!login || !password) {
    return res.status(400).json({ error: 'login and password are required' });
  }
  try {
    const { rows } = await query(
      'SELECT id, login, password_hash, role, name, active FROM users WHERE login = $1',
      [login]
    );
    const user = rows[0];
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    if (!user.active) {
      return res.status(403).json({ error: 'Ведутся технические работы', code: 'user_disabled' });
    }
    // sid зашивается в токен и живёт в БД отдельно от него — так можно
    // отозвать ОДНО конкретное устройство (или все разом, SOS в админке),
    // не дожидаясь истечения самого JWT (12ч).
    const { rows: sessionRows } = await query(
      'INSERT INTO sessions (user_id, ip, user_agent) VALUES ($1, $2, $3) RETURNING id',
      [user.id, req.ip || null, req.headers['user-agent'] || null]
    );
    const sid = sessionRows[0].id;
    const token = jwt.sign(
      { sub: user.id, login: user.login, role: user.role, name: user.name, sid },
      JWT_SECRET(),
      { expiresIn: JWT_EXPIRES_IN() }
    );
    res.json({
      token,
      user: { id: user.id, login: user.login, role: user.role, name: user.name },
    });
  } catch (err) {
    console.error('[auth] login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Middleware: verify JWT Bearer token.
export async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const [type, token] = header.split(' ');
  if (type !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Authorization required' });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET());
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  // Отключённый в админке пользователь теряет доступ сразу на следующем
  // запросе, не дожидаясь истечения JWT (12ч) — заявка заказчика. Роль тоже
  // берём живьём из БД, а не из токена: JWT подписан в момент логина и несёт
  // СТАРУЮ роль до истечения 12ч — иначе смена роли (например investor →
  // viewer) не применялась бы, пока человек сам не перезайдёт, а инвестору
  // такое лучше вообще не предлагать.
  if (isDbReady()) {
    try {
      const { rows } = await query('SELECT active, role FROM users WHERE id = $1', [req.user.sub]);
      if (!rows[0] || !rows[0].active) {
        return res.status(401).json({ error: 'Учётная запись отключена' });
      }
      req.user.role = rows[0].role;
      // Токены, выданные до перехода на sid (старые сессии в кэше браузера),
      // просто не проверяем — отвалятся сами по истечении 12ч.
      if (req.user.sid) {
        const { rows: sess } = await query(
          'UPDATE sessions SET last_seen_at = now() WHERE id = $1 AND revoked = false RETURNING id',
          [req.user.sid]
        );
        if (!sess.length) {
          return res.status(401).json({ error: 'Сессия завершена' });
        }
      }
    } catch {
      // Сбой БД не должен рвать авторизацию — пропускаем проверку.
    }
  }
  next();
}

// Middleware: restrict to given roles.
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authorization required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

// GET /api/auth/me — заодно отдаёт общие переключатели приложения
// (сейчас только historyVisibleToViewer), чтобы клиент подхватывал их
// в том же самом 20с поллинге, что уже есть для роли (authSession.ts),
// без отдельного цикла опроса. Если БД недоступна/запрос упал — по
// умолчанию true (не прячем Историю из-за случайного сбоя запроса).
router.get('/me', authRequired, async (req, res) => {
  let historyVisibleToViewer = true;
  try {
    const { rows } = await query('SELECT history_visible_to_viewer FROM app_settings WHERE id = 1');
    if (rows[0]) historyVisibleToViewer = !!rows[0].history_visible_to_viewer;
  } catch { /* оставить дефолт true */ }
  res.json({ user: req.user, historyVisibleToViewer });
});

export default router;
