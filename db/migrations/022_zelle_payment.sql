-- 022_zelle_payment.sql
-- Adds Zelle-specific payment tracking fields to orders.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS zelle_confirmed_by TEXT REFERENCES users(id) ON DELETE SET NULL;
