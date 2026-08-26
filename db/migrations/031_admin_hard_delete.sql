-- 031_admin_hard_delete.sql
-- Makes the admin "Delete" button on Products and Discount Codes a real,
-- permanent DELETE instead of a soft `active = false` flag.
--
-- Why a migration is needed at all
-- --------------------------------
-- Three foreign keys pointed at these rows with no ON DELETE action, so a
-- plain DELETE was rejected by Postgres (SQLSTATE 23503):
--
--   order_items.product_id            -> products(id)      NO ACTION  (blocked)
--   coas.product_id                   -> products(id)      RESTRICT   (blocked)
--   promo_code_redemptions.promo_code_id -> promo_codes(id) RESTRICT  (blocked)
--
-- Historical order data does NOT actually depend on those links:
--   * order_items already stores its own snapshot of name, price, quantity,
--     variant_name and variant_price, written at checkout time;
--   * orders already stores promo_code, discount_amount and
--     subtotal_before_discount alongside promo_code_id.
--
-- So the safe fix is to let the referencing rows survive with a NULL link plus
-- a text snapshot of what was deleted. Order totals, line items, invoices and
-- the redemption audit trail are all unchanged; only the pointer goes away.
--
-- These already cascade correctly and are left alone:
--   cart_items.product_id     -> ON DELETE CASCADE   (live carts drop the item)
--   product_variants.product_id -> ON DELETE CASCADE (variants go with the product)
--   order_items.variant_id    -> ON DELETE SET NULL  (variant_name snapshot kept)
--   orders.promo_code_id      -> ON DELETE SET NULL  (promo_code snapshot kept)
--
-- db/migrate.js already wraps each migration file in its own transaction.

-- ---------------------------------------------------------------------------
-- 1. order_items: keep the historical line, drop the product link on delete.
-- ---------------------------------------------------------------------------

ALTER TABLE order_items ALTER COLUMN product_id DROP NOT NULL;

-- Backfill the line-item name snapshot for any legacy row that relied on the
-- join instead of its own copy, so nothing loses its label when the FK nulls.
UPDATE order_items oi
   SET name = p.name
  FROM products p
 WHERE oi.product_id = p.id
   AND (oi.name IS NULL OR BTRIM(oi.name) = '');

DO $$
DECLARE
  fk_name TEXT;
BEGIN
  FOR fk_name IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'order_items'::regclass
       AND c.contype = 'f'
       AND c.confrelid = 'products'::regclass
  LOOP
    EXECUTE format('ALTER TABLE order_items DROP CONSTRAINT %I', fk_name);
  END LOOP;

  ALTER TABLE order_items
    ADD CONSTRAINT order_items_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2. coas: detach compliance records instead of blocking the delete.
--    A COA is a lab document that must outlive the catalog entry, so it keeps
--    a snapshot of the product it was issued for.
-- ---------------------------------------------------------------------------

ALTER TABLE coas
  ADD COLUMN IF NOT EXISTS product_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS product_slug VARCHAR(255);

UPDATE coas c
   SET product_name = p.name,
       product_slug = p.slug
  FROM products p
 WHERE c.product_id = p.id
   AND c.product_name IS NULL;

ALTER TABLE coas ALTER COLUMN product_id DROP NOT NULL;

DO $$
DECLARE
  fk_name TEXT;
BEGIN
  FOR fk_name IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'coas'::regclass
       AND c.contype = 'f'
       AND c.confrelid = 'products'::regclass
  LOOP
    EXECUTE format('ALTER TABLE coas DROP CONSTRAINT %I', fk_name);
  END LOOP;

  ALTER TABLE coas
    ADD CONSTRAINT coas_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_coas_product_slug ON coas(product_slug);

-- ---------------------------------------------------------------------------
-- 3. promo_code_redemptions: keep the audit row, snapshot the code text.
-- ---------------------------------------------------------------------------

ALTER TABLE promo_code_redemptions
  ADD COLUMN IF NOT EXISTS promo_code VARCHAR(80);

UPDATE promo_code_redemptions r
   SET promo_code = pc.code
  FROM promo_codes pc
 WHERE r.promo_code_id = pc.id
   AND r.promo_code IS NULL;

ALTER TABLE promo_code_redemptions ALTER COLUMN promo_code_id DROP NOT NULL;

DO $$
DECLARE
  fk_name TEXT;
BEGIN
  FOR fk_name IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'promo_code_redemptions'::regclass
       AND c.contype = 'f'
       AND c.confrelid = 'promo_codes'::regclass
  LOOP
    EXECUTE format('ALTER TABLE promo_code_redemptions DROP CONSTRAINT %I', fk_name);
  END LOOP;

  ALTER TABLE promo_code_redemptions
    ADD CONSTRAINT promo_code_redemptions_promo_code_id_fkey
    FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id) ON DELETE SET NULL;
END $$;

-- Orders already carry a promo_code text column; make sure it is populated for
-- any row that only had the id, before that id can be nulled by a delete.
UPDATE orders o
   SET promo_code = pc.code
  FROM promo_codes pc
 WHERE o.promo_code_id = pc.id
   AND (o.promo_code IS NULL OR BTRIM(o.promo_code) = '');
