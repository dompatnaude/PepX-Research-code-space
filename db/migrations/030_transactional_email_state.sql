-- 030_transactional_email_state.sql
-- Durable, per-email send guards for the two customer transactional emails.
-- NULL  = that email has not been sent for this order yet.
-- Value = the moment a send was claimed (see services/transactional-email.js).
-- Additive and idempotent; existing order data is untouched.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_confirmation_sent_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_confirmation_sent_at TIMESTAMPTZ;
