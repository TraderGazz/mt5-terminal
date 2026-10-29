-- New edits only: do not backfill historical changes already reconciled in
-- account_overrides. Apply before deploying the updated backend.
CREATE TABLE IF NOT EXISTS closed_trade_edits (
    id BIGSERIAL PRIMARY KEY,
    trade_id INTEGER NOT NULL,
    actor TEXT NOT NULL,
    old_profit NUMERIC NOT NULL,
    new_profit NUMERIC NOT NULL,
    old_swap NUMERIC NOT NULL,
    new_swap NUMERIC NOT NULL,
    old_commission NUMERIC NOT NULL,
    new_commission NUMERIC NOT NULL,
    delta NUMERIC NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_closed_trade_edits_trade_id ON closed_trade_edits (trade_id);
