-- 032_card_payment.sql
-- Card rail: the parent-minted session token, the processor reference, and a
-- NEUTRAL order reference. The neutral ref exists because the store's own order
-- number carries the brand stem, and anything sent upstream must not.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS maef_session_token TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS maef_ref TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_maef_ref ON orders(maef_ref);
