ALTER TABLE app_settings
    ADD COLUMN IF NOT EXISTS mobile_history_edit_visible BOOLEAN NOT NULL DEFAULT TRUE;
