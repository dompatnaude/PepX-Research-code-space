-- 019_easypost_shipments.sql
-- shipments table for the EasyPost integration. Additive only; safe to re-run.
CREATE TABLE IF NOT EXISTS shipments (
  id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      provider TEXT,
        provider_shipment_id TEXT,
          provider_tracker_id TEXT,
            rate_id TEXT,
              carrier TEXT,
                service TEXT,
                  tracking_number TEXT,
                    tracking_url TEXT,
  label_url TEXT,
  label_format TEXT,
  label_cost NUMERIC(12,2),
  currency TEXT,
  shipment_status TEXT NOT NULL DEFAULT 'unknown',
  is_voided BOOLEAN NOT NULL DEFAULT FALSE,
  voided_at TIMESTAMPTZ,
  purchased_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shipments_order_id ON shipments (order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_provider_shipment_id ON shipments (provider_shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipments_provider_tracker_id ON shipments (provider_tracker_id);
CREATE INDEX IF NOT EXISTS idx_shipments_tracking_number ON shipments (tracking_number);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS ship_weight_oz NUMERIC(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ship_length_in NUMERIC(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ship_width_in NUMERIC(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ship_height_in NUMERIC(10,2);
