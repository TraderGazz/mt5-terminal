-- MT5 Terminal — PostgreSQL schema (ТЗ v2, разделы 4.2, 4.4, 5.4)
-- Свежая установка:  psql "<DSN>" -f database/init.sql
-- Обновление v1 → v2 существующей БД:  database/migrations/001_v2_schema.sql

BEGIN;

-- ============================================================================
-- trades — сделки / ордера / балансовые операции (ТЗ 4.2)
-- Одна таблица под все строки истории. Категория строки — в deal_type.
-- ============================================================================
CREATE TABLE IF NOT EXISTS trades (
    id            SERIAL PRIMARY KEY,
    ticket        BIGINT UNIQUE,
    symbol        VARCHAR(20),
    -- Направление buy/sell. Для balance/withdrawal/cfd не заполняется.
    type          VARCHAR(10),
    -- Категория строки (ТЗ v2 4.2): нужна для строк «Снятие» и «CFD» в итогах.
    deal_type     VARCHAR(16) NOT NULL DEFAULT 'buy'
        CHECK (deal_type IN ('buy', 'sell', 'balance', 'withdrawal', 'cfd')),
    volume        DECIMAL(10,2),
    open_price    DECIMAL(15,5),
    close_price   DECIMAL(15,5),
    stop_loss     DECIMAL(15,5) DEFAULT 0,
    take_profit   DECIMAL(15,5) DEFAULT 0,
    profit        DECIMAL(15,2),
    swap          DECIMAL(15,2) DEFAULT 0,
    commission    DECIMAL(15,2) DEFAULT 0,
    open_time     TIMESTAMPTZ,
    close_time    TIMESTAMPTZ,
    comment       TEXT DEFAULT '',
    position_id   BIGINT,
    order_ticket  BIGINT,
    -- Правка через экран редактирования. В UI флаг НЕ выводится (ТЗ v2 4.3),
    -- хранится только в БД.
    is_edited     BOOLEAN DEFAULT FALSE,
    -- Источник строки: mt5-sync | html-report | manual | seed
    source        VARCHAR(32) DEFAULT 'manual',
    uploaded_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trades_close_time  ON trades (close_time DESC);
CREATE INDEX IF NOT EXISTS idx_trades_symbol      ON trades (symbol);
CREATE INDEX IF NOT EXISTS idx_trades_deal_type   ON trades (deal_type);
CREATE INDEX IF NOT EXISTS idx_trades_position_id ON trades (position_id);

-- ============================================================================
-- deal_legs — сырые сделки MT5, БЕЗ сшивания (открытие и закрытие — разные
-- строки, как в оригинальной вкладке «Сделки»: "buy, in" отдельно от
-- "sell, out"). `trades` выше хранит уже слитые open+close записи — это
-- нужно для «Позиций» и для редактирования в админке, но не совпадает по
-- смыслу с оригинальной вкладкой «Сделки» (там ровно вдвое больше строк).
-- Прямой passthrough сырых deals из EA, без реконструкции.
-- ============================================================================
CREATE TABLE IF NOT EXISTS deal_legs (
    id            SERIAL PRIMARY KEY,
    ticket        BIGINT UNIQUE NOT NULL,
    position_id   BIGINT,
    order_ticket  BIGINT,
    symbol        VARCHAR(20),
    -- Направление ЭТОЙ сделки (не позиции) — buy/sell, как в raw EA type.
    type          VARCHAR(10),
    -- in | out | inout (DEAL_ENTRY_*) — открытие, закрытие или разворот нетто-позиции.
    entry         VARCHAR(10),
    deal_type     VARCHAR(16) NOT NULL DEFAULT 'buy'
        CHECK (deal_type IN ('buy', 'sell', 'balance', 'withdrawal', 'cfd')),
    volume        DECIMAL(10,2),
    price         DECIMAL(15,5),
    stop_loss     DECIMAL(15,5) DEFAULT 0,
    take_profit   DECIMAL(15,5) DEFAULT 0,
    profit        DECIMAL(15,2) DEFAULT 0,
    swap          DECIMAL(15,2) DEFAULT 0,
    commission    DECIMAL(15,2) DEFAULT 0,
    time          TIMESTAMPTZ,
    comment       TEXT DEFAULT '',
    is_edited     BOOLEAN DEFAULT FALSE,
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_legs_time        ON deal_legs (time DESC);
CREATE INDEX IF NOT EXISTS idx_deal_legs_symbol      ON deal_legs (symbol);
CREATE INDEX IF NOT EXISTS idx_deal_legs_position_id ON deal_legs (position_id);
CREATE INDEX IF NOT EXISTS idx_deal_legs_deal_type   ON deal_legs (deal_type);

-- ============================================================================
-- positions — открытые позиции (страница «Торговля», только просмотр).
-- Полностью перезаписываются каждой синхронизацией с MT5.
-- ============================================================================
CREATE TABLE IF NOT EXISTS positions (
    id            BIGINT PRIMARY KEY,               -- тикет позиции
    symbol        VARCHAR(20)   NOT NULL,
    type          VARCHAR(10)   NOT NULL CHECK (type IN ('buy', 'sell')),
    volume        DECIMAL(10,2) NOT NULL,
    open_price    DECIMAL(15,5) NOT NULL,
    current_price DECIMAL(15,5),
    open_time     TIMESTAMPTZ,
    stop_loss     DECIMAL(15,5) DEFAULT 0,
    take_profit   DECIMAL(15,5) DEFAULT 0,
    profit        DECIMAL(15,2) DEFAULT 0,
    swap          DECIMAL(15,2) DEFAULT 0,
    commission    DECIMAL(15,2) DEFAULT 0,
    updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- users — единая авторизация, роли admin / trader / viewer (ТЗ 4.1)
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    login         VARCHAR(64) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          VARCHAR(10) NOT NULL DEFAULT 'viewer'
        CHECK (role IN ('admin', 'trader', 'viewer')),
    name          VARCHAR(255) DEFAULT '',
    active        BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- sessions — сессии входа (см. database/migrations/004_sessions.sql):
-- session_id зашивается в JWT при логине, отзыв (revoked=true) даёт кикнуть
-- одно устройство или все разом (кнопка SOS в админке), не дожидаясь
-- истечения самого токена (12ч).
-- ============================================================================
CREATE TABLE IF NOT EXISTS sessions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip            VARCHAR(64),
    user_agent    TEXT,
    revoked       BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ DEFAULT now(),
    last_seen_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_revoked ON sessions (revoked);

-- ============================================================================
-- accounts — снимок счёта (страницы «Торговля», «Настройки», «Логин»).
-- Один ряд на счёт; значения обновляет синхронизация с MT5 / админ вручную.
-- ============================================================================
CREATE TABLE IF NOT EXISTS accounts (
    id              SERIAL PRIMARY KEY,
    account_number  VARCHAR(32) UNIQUE NOT NULL,
    holder          VARCHAR(255)  DEFAULT '',
    company         VARCHAR(255)  DEFAULT '',
    server          VARCHAR(64)   DEFAULT '',
    access_server   VARCHAR(64)   DEFAULT '',
    currency        VARCHAR(8)    DEFAULT 'RUB',
    balance         DECIMAL(15,2) DEFAULT 0,
    equity          DECIMAL(15,2) DEFAULT 0,
    margin          DECIMAL(15,2) DEFAULT 0,
    free_margin     DECIMAL(15,2) DEFAULT 0,
    margin_level    DECIMAL(15,2) DEFAULT 0,
    floating_profit DECIMAL(15,2) DEFAULT 0,
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Номер счёта из принятого дизайна (client/src/mocks/account.ts).
-- Расходится с прежним init.sql (50214896) — подтвердить у заказчика.
INSERT INTO accounts (account_number, currency)
VALUES ('2000108452', 'RUB')
ON CONFLICT (account_number) DO NOTHING;

-- ============================================================================
-- import_log — лог загрузок HTML-отчётов MT5 и импортов (ТЗ 4.2, админка)
-- ============================================================================
CREATE TABLE IF NOT EXISTS import_log (
    id           SERIAL PRIMARY KEY,
    filename     VARCHAR(255),
    trades_count INTEGER DEFAULT 0,
    source       VARCHAR(64),
    user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- sync_log — лог автообмена с сайтом заказчика (ТЗ 4.4)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sync_log (
    id         SERIAL PRIMARY KEY,
    direction  VARCHAR(64),
    peer       VARCHAR(255),
    status     VARCHAR(16) DEFAULT 'ok'
        CHECK (status IN ('ok', 'error', 'skipped')),
    detail     TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_log_created_at ON sync_log (created_at DESC);

-- ============================================================================
-- sync_settings — настройки автообмена, один ряд id = 1 (ТЗ 4.4)
-- ВНИМАНИЕ: по уточнению заказчика (08.09.2026) автообмен односторонний —
-- терминал → сайт заказчика (передача баланса). Модуль sync будет переработан
-- на Этапе 5; здесь пока свободная строка direction без CHECK.
-- ============================================================================
CREATE TABLE IF NOT EXISTS sync_settings (
    id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    enabled         BOOLEAN DEFAULT FALSE,
    direction       VARCHAR(64) DEFAULT 'terminal_to_site',
    reverse_enabled BOOLEAN DEFAULT FALSE,
    updated_at      TIMESTAMPTZ DEFAULT now()
);

INSERT INTO sync_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- position_overrides — косметическая правка ОТКРЫТЫХ позиций (заявка
-- заказчика, см. database/migrations/005_position_overrides.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS position_overrides (
    ticket              BIGINT PRIMARY KEY,
    open_price_override DECIMAL(18, 5),
    profit_offset       DECIMAL(18, 2),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;

-- Первый admin создаётся сервером при старте из env ADMIN_LOGIN / ADMIN_PASSWORD
-- (чтобы не держать хэш пароля в SQL).
