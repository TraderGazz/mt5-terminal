-- MT5 Mobile Terminal — PostgreSQL schema (TZ 4.2, 4.4, 5.4)
-- Usage: psql -U postgres -d terminal -f database/init.sql

BEGIN;

-- ---------- trades (точно по ТЗ 4.2) ----------
CREATE TABLE IF NOT EXISTS trades (
    id SERIAL PRIMARY KEY,
    ticket INTEGER UNIQUE,
    symbol VARCHAR(20),
    type VARCHAR(10),
    volume DECIMAL(10,2),
    open_price DECIMAL(15,5),
    close_price DECIMAL(15,5),
    profit DECIMAL(15,2),
    swap DECIMAL(15,2),
    commission DECIMAL(15,2),
    open_time TIMESTAMP,
    close_time TIMESTAMP,
    comment TEXT,
    position_id INTEGER,
    order_ticket INTEGER,
    is_edited BOOLEAN DEFAULT FALSE,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trades_close_time ON trades (close_time);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades (symbol);
CREATE INDEX IF NOT EXISTS idx_trades_position_id ON trades (position_id);

-- ---------- users (единая авторизация, роли admin/trader/viewer) ----------
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    login VARCHAR(64) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(10) NOT NULL DEFAULT 'viewer'
        CHECK (role IN ('admin', 'trader', 'viewer')),
    name VARCHAR(255) DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------- accounts (баланс счёта 50214896) ----------
CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    account_number VARCHAR(32) UNIQUE NOT NULL DEFAULT '50214896',
    balance DECIMAL(15,2) DEFAULT 0,
    equity DECIMAL(15,2) DEFAULT 0,
    margin DECIMAL(15,2) DEFAULT 0,
    free_margin DECIMAL(15,2) DEFAULT 0,
    margin_level DECIMAL(15,2) DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO accounts (account_number)
VALUES ('50214896')
ON CONFLICT (account_number) DO NOTHING;

-- ---------- import_log (лог импортов HTML-отчётов / автообмена) ----------
CREATE TABLE IF NOT EXISTS import_log (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255),
    trades_count INTEGER DEFAULT 0,
    source VARCHAR(64),
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------- sync_log (лог автообмена между сайтами) ----------
CREATE TABLE IF NOT EXISTS sync_log (
    id SERIAL PRIMARY KEY,
    direction VARCHAR(64),
    peer VARCHAR(255),
    status VARCHAR(16) DEFAULT 'ok'
        CHECK (status IN ('ok', 'error', 'skipped')),
    detail TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sync_log_created_at ON sync_log (created_at);

-- ---------- sync_settings (настройки автообмена, один ряд id=1) ----------
CREATE TABLE IF NOT EXISTS sync_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    enabled BOOLEAN DEFAULT FALSE,
    -- Основное направление: Русинвест -> АльфаФорекс
    direction VARCHAR(32) DEFAULT 'rusinvest_to_alfaforex'
        CHECK (direction IN ('rusinvest_to_alfaforex', 'alfaforex_to_rusinvest')),
    -- Обратное направление включается только флагом админа (ТЗ 4.4)
    reverse_enabled BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO sync_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Первый admin-пользователь создаётся сервером автоматически при старте
-- (env ADMIN_LOGIN / ADMIN_PASSWORD), чтобы не хранить хэш пароля в SQL.
