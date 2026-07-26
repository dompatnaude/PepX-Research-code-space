-- 016_promo_codes_v2.sql
-- Expands promo model to support percentage + fixed discounts, per-customer limits,
-- analytics counters, archival metadata, and richer redemption audit fields.

ALTER TABLE promo_codes
  ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) NOT NULL DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS discount_value NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS uses_per_customer INTEGER,
  ADD COLUMN IF NOT EXISTS total_revenue_generated NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS updated_by TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'promo_codes'
       AND column_name = 'discount_percent'
  ) THEN
    ALTER TABLE promo_codes
      ALTER COLUMN discount_percent DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE promo_codes DROP CONSTRAINT IF EXISTS promo_codes_discount_percent_chk;

-- Backfill discount_value from legacy discount_percent when needed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'promo_codes'
       AND column_name = 'discount_percent'
  ) THEN
    UPDATE promo_codes
       SET discount_value = COALESCE(discount_value, discount_percent)
     WHERE discount_value IS NULL;

    UPDATE promo_codes
       SET discount_percent = CASE
         WHEN discount_type = 'percentage' THEN discount_value
         ELSE NULL
       END;
  ELSE
    UPDATE promo_codes
       SET discount_value = COALESCE(discount_value, 0)
     WHERE discount_value IS NULL;
  END IF;
END $$;

-- Keep legacy discount_percent in place for backward compatibility with old rows/routes,
-- but enforce new canonical constraints on discount_type + discount_value.
ALTER TABLE promo_codes
  ALTER COLUMN discount_value SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'promo_codes_discount_type_chk'
  ) THEN
    ALTER TABLE promo_codes
      ADD CONSTRAINT promo_codes_discount_type_chk
      CHECK (discount_type IN ('percentage', 'fixed'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'promo_codes_discount_value_chk'
  ) THEN
    ALTER TABLE promo_codes
      ADD CONSTRAINT promo_codes_discount_value_chk
      CHECK (
        (discount_type = 'percentage' AND discount_value > 0 AND discount_value <= 100)
        OR
        (discount_type = 'fixed' AND discount_value > 0)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'promo_codes_uses_per_customer_chk'
  ) THEN
    ALTER TABLE promo_codes
      ADD CONSTRAINT promo_codes_uses_per_customer_chk
      CHECK (uses_per_customer IS NULL OR uses_per_customer >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'promo_codes_total_revenue_generated_chk'
  ) THEN
    ALTER TABLE promo_codes
      ADD CONSTRAINT promo_codes_total_revenue_generated_chk
      CHECK (total_revenue_generated >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'promo_codes_created_by_fk'
  ) THEN
    ALTER TABLE promo_codes
      ADD CONSTRAINT promo_codes_created_by_fk
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'promo_codes_updated_by_fk'
  ) THEN
    ALTER TABLE promo_codes
      ADD CONSTRAINT promo_codes_updated_by_fk
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_promo_codes_discount_type ON promo_codes(discount_type);
CREATE INDEX IF NOT EXISTS idx_promo_codes_archived_at ON promo_codes(archived_at);

ALTER TABLE promo_code_redemptions
  ADD COLUMN IF NOT EXISTS subtotal_before_discount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS final_total NUMERIC(12,2);

CREATE INDEX IF NOT EXISTS idx_promo_redemptions_promo_user ON promo_code_redemptions(promo_code_id, user_id);
