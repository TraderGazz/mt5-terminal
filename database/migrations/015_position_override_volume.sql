-- Display-only lot size. No broker order or position is modified.
ALTER TABLE position_overrides
  ADD COLUMN IF NOT EXISTS volume_override NUMERIC(10, 2)
  CHECK (volume_override > 0);
