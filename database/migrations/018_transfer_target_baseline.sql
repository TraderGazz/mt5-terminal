-- Isolated hybrid rehearsal only; no production runtime uses this table.
CREATE TABLE IF NOT EXISTS transfer_target_baselines (
 snapshot_id BIGINT PRIMARY KEY REFERENCES transfer_snapshots(id),
 target_login TEXT NOT NULL,
 started_at TIMESTAMPTZ NOT NULL,
 currency TEXT NOT NULL,
 broker_balance_excluded NUMERIC(15,2) NOT NULL,
 account_snapshot JSONB NOT NULL,
 CHECK (target_login <> '')
);
