-- Настройки → Почта (заявка заказчика 2026-10-17): настоящие системные
-- сообщения вместо заглушки «Режим просмотра» — пишет админ через панель,
-- клиент видит список/читает текст (как «Новости», но содержимое своё).
CREATE TABLE IF NOT EXISTS mail_messages (
    id         SERIAL PRIMARY KEY,
    subject    VARCHAR(255) NOT NULL,
    body       TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mail_messages_created_at ON mail_messages (created_at DESC);
