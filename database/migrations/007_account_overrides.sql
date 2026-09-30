-- account_overrides — ручная правка сводных показателей счёта (Баланс/
-- Средства/Маржа/Свободная маржа/Уровень маржи), один ряд id = 1 (по
-- образцу app_settings/sync_settings). Старая админ-форма "Редактирование
-- баланса" писала абсолютные значения в таблицу `accounts`, которую
-- bridge.account() никогда не читал — правка выглядела сохранённой, но ни
-- на что не влияла (баг-репорт заказчика: "не применялось"). Здесь
-- хранится не абсолютное значение, а СМЕЩЕНИЕ от реального показания
-- моста — тот же принцип, что у position_overrides: заказчик вводит
-- целевое число, сервер считает разницу с текущим реальным и запоминает
-- её, дальше показатель продолжает жить вместе с рынком/сделками от этой
-- сдвинутой точки, а не замирает на введённом числе навсегда.
CREATE TABLE IF NOT EXISTS account_overrides (
    id                   INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    balance_offset       DECIMAL(15,2) NOT NULL DEFAULT 0,
    equity_offset        DECIMAL(15,2) NOT NULL DEFAULT 0,
    margin_offset        DECIMAL(15,2) NOT NULL DEFAULT 0,
    free_margin_offset   DECIMAL(15,2) NOT NULL DEFAULT 0,
    margin_level_offset  DECIMAL(15,2) NOT NULL DEFAULT 0,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO account_overrides (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
