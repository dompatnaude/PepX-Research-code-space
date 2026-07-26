-- 017_promo_schema_compat.sql
-- Compatibility patch for environments where promo_codes was created from an
-- alternate schema variant missing legacy/backward-compatible columns.

ALTER TABLE promo_codes
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS total_discount_given NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Keep legacy discount_percent synced for percentage rows so older queries
-- and compatibility logic continue to work.
UPDATE promo_codes
   SET discount_percent = CASE
     WHEN discount_type = 'percentage' THEN discount_value
     ELSE NULL
   END
 WHERE discount_percent IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'promo_codes_total_discount_given_chk'
  ) THEN
    ALTER TABLE promo_codes
      ADD CONSTRAINT promo_codes_total_discount_given_chk
      CHECK (total_discount_given >= 0);
  END IF;
END $$;
