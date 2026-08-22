-- 029_order_confirmation_email.sql
-- Durable guard against sending a customer more than one order receipt.
-- NULL  = no confirmation email has been sent for this order yet.
-- Value = the moment a send was claimed (see services/order-confirmation.js).
-- Idempotent and non-destructive, matching the other migrations here.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_confirmation_sent_at TIMESTAMPTZ;
