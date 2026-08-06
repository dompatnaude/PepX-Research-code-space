-- 022_age_confirmation.sql
-- Records that a user affirmed they are 21 years of age or older at registration.
-- Idempotent and non-destructive. The birthday column is intentionally left in place.
-- Column name matches the existing production schema (age_confirmed_21_plus).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS age_confirmed_21_plus BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS age_confirmed_at TIMESTAMPTZ;
