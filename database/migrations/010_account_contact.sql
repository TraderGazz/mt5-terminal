-- Заявка заказчика 2026-10-17 (смена брендинга на FxPro): "Телефон и почту
-- не нужно указывать [на сайте], но в админке сделайте возможность" —
-- хранить email/телефон держателя счёта, не показывая их на самом сайте
-- (там эти поля и так всегда пустые, см. Account.tsx/live.js).
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email VARCHAR(255) DEFAULT '';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS phone VARCHAR(64) DEFAULT '';
