-- Миграция v1 → v2 (ТЗ v2). Применять к БД, созданной прежним init.sql.
-- Идемпотентна. Для свежей БД миграция не нужна — используйте database/init.sql.
--   psql "<DSN>" -f database/migrations/001_v2_schema.sql

BEGIN;

-- ---- trades: расширение под ТЗ v2 ----
ALTER TABLE trades
    ADD COLUMN IF NOT EXISTS deal_type   VARCHAR(16) NOT NULL DEFAULT 'buy',
    ADD COLUMN IF NOT EXISTS stop_loss   DECIMAL(15,5) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS take_profit DECIMAL(15,5) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS source      VARCHAR(32) DEFAULT 'manual';

-- Тикеты MT5 бывают > int4 — расширяем до BIGINT.
ALTER TABLE trades ALTER COLUMN ticket       TYPE BIGINT USING ticket::bigint;
ALTER TABLE trades ALTER COLUMN position_id  TYPE BIGINT USING position_id::bigint;
ALTER TABLE trades ALTER COLUMN order_ticket TYPE BIGINT USING order_ticket::bigint;

-- Бэкфилл deal_type из старого type, где возможно.
UPDATE trades SET deal_type = type
    WHERE type IN ('buy', 'sell', 'balance', 'withdrawal', 'cfd')
      AND deal_type = 'buy';

DO $$ BEGIN
    ALTER TABLE trades ADD CONSTRAINT trades_deal_type_chk
        CHECK (deal_type IN ('buy', 'sell', 'balance', 'withdrawal', 'cfd'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_trades_deal_type ON trades (deal_type);

-- ---- positions: новая таблица (страница «Торговля») ----
CREATE TABLE IF NOT EXISTS positions (
    id            BIGINT PRIMARY KEY,
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

-- ---- accounts: поля снимка счёта из принятого дизайна ----
ALTER TABLE accounts
    ADD COLUMN IF NOT EXISTS holder          VARCHAR(255)  DEFAULT '',
    ADD COLUMN IF NOT EXISTS company         VARCHAR(255)  DEFAULT '',
    ADD COLUMN IF NOT EXISTS server          VARCHAR(64)   DEFAULT '',
    ADD COLUMN IF NOT EXISTS access_server   VARCHAR(64)   DEFAULT '',
    ADD COLUMN IF NOT EXISTS currency        VARCHAR(8)    DEFAULT 'RUB',
    ADD COLUMN IF NOT EXISTS floating_profit DECIMAL(15,2) DEFAULT 0;

-- ---- sync_settings: снять старый CHECK направления (переработка на Этапе 5) ----
DO $$ BEGIN
    ALTER TABLE sync_settings DROP CONSTRAINT IF EXISTS sync_settings_direction_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
ALTER TABLE sync_settings ALTER COLUMN direction TYPE VARCHAR(64);
ALTER TABLE sync_settings ALTER COLUMN direction SET DEFAULT 'terminal_to_site';

COMMIT;
