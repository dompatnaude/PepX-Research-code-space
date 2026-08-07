-- 025_age_confirmation.sql
-- Records that a user affirmed they are 21 years of age or older at registration.
-- Idempotent and non-destructive. The birthday column is intentionally left in place.
-- Column name matches the existing production schema (age_confirmed_21_plus).
-- (Renumbered from the original 022_age_confirmation.sql to avoid a filename
--  collision with 022_zelle_payment.sql already present on main.)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS age_confirmed_21_plus BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS age_confirmed_at TIMESTAMPTZ;
