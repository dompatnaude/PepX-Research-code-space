-- 018_google_oauth_profile_fields.sql
-- Adds optional Google OAuth profile metadata fields.
-- Idempotent and non-destructive.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_avatar_url TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_email_verified_at TIMESTAMPTZ;
