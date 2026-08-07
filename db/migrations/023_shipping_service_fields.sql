-- 023_shipping_service_fields.sql
-- Adds customer-selected shipping service details to orders.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_service VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_rate_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_provider_shipment_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_delivery_days INTEGER;
