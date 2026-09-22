-- app_settings — общие переключатели приложения, один ряд id = 1 (по образцу
-- sync_settings). Первый флаг: видимость вкладки «История» для роли
-- viewer (инвестор) — заказчик несколько раз просил то включить, то
-- выключить целиком для инвестора, теперь это тумблер в админке, а не
-- правка кода на каждый запрос.
CREATE TABLE IF NOT EXISTS app_settings (
    id                        INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    history_visible_to_viewer BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
