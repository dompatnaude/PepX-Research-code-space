-- Account-disable support for the admin Customers section.
-- public.users (the app's own table) has no disable/ban column, so add one.
-- Null = active; a timestamp = the moment an admin disabled the account.
-- Mirrors the existing nullable-timestamp columns on this table.
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;
