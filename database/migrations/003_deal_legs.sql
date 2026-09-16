-- Сырые сделки MT5 (без сшивания open+close) — нужны, чтобы вкладка «Сделки»
-- на сайте показывала ровно то же, что и оригинальный MT5 (там открытие и
-- закрытие — РАЗНЫЕ строки: "buy, in" / "sell, out"). `trades` хранит уже
-- слитые записи под «Позиции» — этого достаточно для того экрана и для
-- редактирования в админке, но не для честной копии вкладки «Сделки».
-- Идемпотентна.
--   psql "<DSN>" -f database/migrations/003_deal_legs.sql

BEGIN;

CREATE TABLE IF NOT EXISTS deal_legs (
    id            SERIAL PRIMARY KEY,
    ticket        BIGINT UNIQUE NOT NULL,
    position_id   BIGINT,
    order_ticket  BIGINT,
    symbol        VARCHAR(20),
    type          VARCHAR(10),
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

COMMIT;
