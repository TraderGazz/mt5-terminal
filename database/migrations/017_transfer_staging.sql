-- Preparation storage only. Runtime trading continues to use the existing bridge.
BEGIN;
CREATE TABLE IF NOT EXISTS transfer_snapshots (
    id BIGSERIAL PRIMARY KEY,
    snapshot_hash TEXT NOT NULL UNIQUE,
    source_login TEXT NOT NULL,
    target_login TEXT NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL,
    account_view JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (source_login <> target_login)
);

CREATE TABLE IF NOT EXISTS transferred_positions (
    id BIGSERIAL PRIMARY KEY,
    snapshot_id BIGINT NOT NULL REFERENCES transfer_snapshots(id),
    original_ticket BIGINT NOT NULL,
    model JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    UNIQUE (snapshot_id, original_ticket)
);

CREATE TABLE IF NOT EXISTS transferred_position_closures (
    position_id BIGINT PRIMARY KEY REFERENCES transferred_positions(id),
    closed_at TIMESTAMPTZ NOT NULL,
    actor TEXT NOT NULL,
    close_price NUMERIC NOT NULL,
    profit NUMERIC(15,2) NOT NULL,
    swap NUMERIC(15,2) NOT NULL,
    commission NUMERIC(15,2) NOT NULL,
    total NUMERIC(15,2) NOT NULL,
    quote_snapshot JSONB NOT NULL,
    CHECK (total = profit + swap + commission)
);
COMMIT;
