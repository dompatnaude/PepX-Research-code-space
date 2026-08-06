-- 022_age_confirmation.sql
-- Replace birthday collection with explicit 21+ age confirmation. Additive; safe to re-run.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS age_confirmed_21_plus BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS age_confirmed_at TIMESTAMPTZ;
