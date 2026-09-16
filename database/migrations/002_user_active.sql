-- Флаг активности пользователя (заявка заказчика: мгновенно отключать доступ
-- без удаления учётки — только страница входа, попытка войти видит
-- "Ведутся технические работы").
-- Идемпотентна.
--   psql "<DSN>" -f database/migrations/002_user_active.sql

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

COMMIT;
