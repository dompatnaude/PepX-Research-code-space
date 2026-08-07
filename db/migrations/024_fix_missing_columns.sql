-- 024_fix_missing_columns.sql
-- Safety-net: ensures columns that may be missing due to schema drift are present.
-- All statements use IF NOT EXISTS so re-running is safe.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal_before_discount NUMERIC(12,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code_id INTEGER REFERENCES promo_codes(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code VARCHAR(80);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(80);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_country VARCHAR(120);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_phone VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS zelle_confirmed_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_service VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_rate_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_provider_shipment_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_delivery_days INTEGER;

-- Expand promo_code_redemptions with audit columns referenced in the order creation code.
ALTER TABLE promo_code_redemptions ADD COLUMN IF NOT EXISTS subtotal_before_discount NUMERIC(12,2);
ALTER TABLE promo_code_redemptions ADD COLUMN IF NOT EXISTS final_total NUMERIC(12,2);
