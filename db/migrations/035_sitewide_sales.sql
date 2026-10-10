-- 035_sitewide_sales.sql
--
-- Site-wide sales: a percentage discount the admin switches on from the admin
-- panel that applies to every product automatically -- no code for the
-- customer to type -- together with the announcement bar that advertises it.
--
-- A sale is "live" when it is active, inside its start/end window and has not
-- reached its usage limit. services/sitewide-sale.js is the single place that
-- decides this; the storefront, the checkout and the admin list all read it
-- from there.
--
-- Additive and safe to run repeatedly.

CREATE TABLE IF NOT EXISTS sitewide_sales (
    id SERIAL PRIMARY KEY,
    name VARCHAR(60) NOT NULL,
    discount_percent NUMERIC(5,2) NOT NULL,
    banner_text VARCHAR(240),
    show_banner BOOLEAN NOT NULL DEFAULT TRUE,
    banner_scroll BOOLEAN NOT NULL DEFAULT FALSE,
    starts_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    usage_limit INTEGER,
    total_used INTEGER NOT NULL DEFAULT 0,
    total_discount_given NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_revenue_generated NUMERIC(12,2) NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT sitewide_sales_name_not_empty_chk CHECK (BTRIM(name) <> ''),
    CONSTRAINT sitewide_sales_discount_percent_chk CHECK (discount_percent > 0 AND discount_percent <= 100),
    CONSTRAINT sitewide_sales_usage_limit_chk CHECK (usage_limit IS NULL OR usage_limit >= 0),
    CONSTRAINT sitewide_sales_total_used_chk CHECK (total_used >= 0),
    CONSTRAINT sitewide_sales_date_window_chk CHECK (starts_at IS NULL OR expires_at IS NULL OR expires_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS idx_sitewide_sales_active ON sitewide_sales (active);

-- Which sale, if any, priced an order. The sale's name is also snapshotted in
-- orders.promo_code (the existing discount label), so the confirmation page,
-- the emails and the admin order view keep showing "Discount (Fall Sale)" even
-- after the sale itself is deleted.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS sitewide_sale_id INTEGER REFERENCES sitewide_sales(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_sitewide_sale_id ON orders(sitewide_sale_id);
