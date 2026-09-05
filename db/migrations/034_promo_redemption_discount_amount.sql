-- 034_promo_redemption_discount_amount.sql
--
-- Checkout with a discount code returned 500 on any database whose
-- promo_code_redemptions table predates 015_promo_codes.sql.
--
-- 015 creates that table WITH discount_amount, but only inside
-- CREATE TABLE IF NOT EXISTS. Where the table already existed from an
-- alternate schema variant (the same drift 017 patches for promo_codes),
-- the CREATE was a no-op and the column was never added. 024 is the
-- safety net for exactly this drift, but it adds only
-- subtotal_before_discount and final_total -- not discount_amount.
--
-- routes/orders.js inserts discount_amount on every redemption, so an
-- order placed WITH a promo code failed with
--   42703: column "discount_amount" of relation
--          "promo_code_redemptions" does not exist
-- which rolled the whole order transaction back. Orders WITHOUT a code
-- never reach that INSERT, which is why only discounted checkouts broke.
--
-- Additive and safe to run repeatedly.

ALTER TABLE promo_code_redemptions
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2);

-- Backfill any rows written before the column existed. The order row is the
-- authority; the recorded subtotal/total pair is the fallback.
UPDATE promo_code_redemptions r
   SET discount_amount = COALESCE(o.discount_amount, 0)
  FROM orders o
 WHERE o.id = r.order_id
   AND r.discount_amount IS NULL;

UPDATE promo_code_redemptions
   SET discount_amount = GREATEST(
         COALESCE(subtotal_before_discount, 0) - COALESCE(final_total, 0), 0)
 WHERE discount_amount IS NULL
   AND subtotal_before_discount IS NOT NULL;

UPDATE promo_code_redemptions
   SET discount_amount = 0
 WHERE discount_amount IS NULL;

ALTER TABLE promo_code_redemptions
  ALTER COLUMN discount_amount SET DEFAULT 0;

ALTER TABLE promo_code_redemptions
  ALTER COLUMN discount_amount SET NOT NULL;

-- Match the constraint 015 installs on a freshly created table.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'promo_code_redemptions_discount_amount_chk'
  ) THEN
    ALTER TABLE promo_code_redemptions
      ADD CONSTRAINT promo_code_redemptions_discount_amount_chk
      CHECK (discount_amount >= 0);
  END IF;
END $$;

-- One redemption row per order. 015 installs this on a fresh table; a drifted
-- table may be missing it, and without it a retried checkout could credit the
-- same promo twice. Only created when the existing rows already satisfy it, so
-- a database with historical duplicates still boots.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = 'idx_promo_code_redemptions_order_unique'
  ) AND NOT EXISTS (
    SELECT 1 FROM promo_code_redemptions
     WHERE order_id IS NOT NULL
     GROUP BY order_id
    HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX idx_promo_code_redemptions_order_unique
      ON promo_code_redemptions(order_id);
  END IF;
END $$;
