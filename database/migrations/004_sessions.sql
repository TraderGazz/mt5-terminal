-- Сессии входа — нужны, чтобы можно было выборочно "выкинуть" одно
-- устройство на экран входа, или все разом (кнопка SOS в админке). JWT сам
-- по себе не отслеживается на сервере (stateless) — session_id, зашитый в
-- токен при логине, даёт точку, за которую можно отозвать доступ, не
-- дожидаясь истечения токена (12ч).
-- Идемпотентна.
--   psql "<DSN>" -f database/migrations/004_sessions.sql

BEGIN;

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

COMMIT;
