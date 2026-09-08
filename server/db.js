// PostgreSQL connection pool.
// If the DB is unavailable the server still starts; data routes answer 503.
import pg from 'pg';

const { Pool } = pg;

let pool = null;
let dbReady = false;
let lastError = null;

export function initDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.warn('[db] DATABASE_URL is not set — server will answer 503 on data routes');
    return;
  }
  pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  pool.on('error', (err) => {
    dbReady = false;
    lastError = err;
    console.error('[db] pool error:', err.message);
  });

  // Probe connection without crashing the process.
  pool
    .query('SELECT 1')
    .then(() => {
      dbReady = true;
      lastError = null;
      console.log('[db] PostgreSQL connected');
    })
    .catch((err) => {
      dbReady = false;
      lastError = err;
      console.error('[db] initial connection failed (server keeps running):', err.message);
    });
}

export function isDbReady() {
  return dbReady;
}

export function dbStatus() {
  return { ready: dbReady, error: lastError ? lastError.message : null };
}

export async function query(text, params) {
  if (!pool) {
    const err = new Error('Database is not configured');
    err.code = 'DB_UNAVAILABLE';
    throw err;
  }
  try {
    const res = await pool.query(text, params);
    dbReady = true;
    return res;
  } catch (err) {
    dbReady = false;
    lastError = err;
    throw err;
  }
}

// Express middleware: reject data routes with 503 when DB is down.
export function requireDb(req, res, next) {
  if (!pool || !dbReady) {
    return res.status(503).json({
      error: 'Database unavailable',
      detail: lastError ? lastError.message : 'DATABASE_URL not set or connection failed',
    });
  }
  next();
}
