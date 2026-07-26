-- 015_promo_codes.sql
-- Adds promo code management, redemptions audit trail, and order-level promo snapshot fields.

CREATE TABLE IF NOT EXISTS promo_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(80) NOT NULL,
    discount_percent NUMERIC(5,2) NOT NULL,
    minimum_order NUMERIC(12,2),
    usage_limit INTEGER,
    total_used INTEGER NOT NULL DEFAULT 0,
    total_discount_given NUMERIC(12,2) NOT NULL DEFAULT 0,
    starts_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT promo_codes_code_upper_chk CHECK (code = UPPER(BTRIM(code))),
    CONSTRAINT promo_codes_code_not_empty_chk CHECK (BTRIM(code) <> ''),
    CONSTRAINT promo_codes_discount_percent_chk CHECK (discount_percent > 0 AND discount_percent <= 100),
    CONSTRAINT promo_codes_minimum_order_chk CHECK (minimum_order IS NULL OR minimum_order >= 0),
    CONSTRAINT promo_codes_usage_limit_chk CHECK (usage_limit IS NULL OR usage_limit >= 0),
    CONSTRAINT promo_codes_total_used_chk CHECK (total_used >= 0),
    CONSTRAINT promo_codes_total_discount_given_chk CHECK (total_discount_given >= 0),
    CONSTRAINT promo_codes_date_window_chk CHECK (starts_at IS NULL OR expires_at IS NULL OR expires_at >= starts_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_codes_code_ci_unique ON promo_codes (LOWER(code));
CREATE INDEX IF NOT EXISTS idx_promo_codes_active ON promo_codes (active);
CREATE INDEX IF NOT EXISTS idx_promo_codes_expires_at ON promo_codes (expires_at);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code_id INTEGER REFERENCES promo_codes(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal_before_discount NUMERIC(12,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code VARCHAR(80);

CREATE INDEX IF NOT EXISTS idx_orders_promo_code_id ON orders(promo_code_id);

CREATE TABLE IF NOT EXISTS promo_code_redemptions (
    id SERIAL PRIMARY KEY,
    promo_code_id INTEGER NOT NULL REFERENCES promo_codes(id) ON DELETE RESTRICT,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    discount_amount NUMERIC(12,2) NOT NULL,
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT promo_code_redemptions_discount_amount_chk CHECK (discount_amount >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_code_redemptions_order_unique ON promo_code_redemptions(order_id);
CREATE INDEX IF NOT EXISTS idx_promo_code_redemptions_promo_code_id ON promo_code_redemptions(promo_code_id);
CREATE INDEX IF NOT EXISTS idx_promo_code_redemptions_user_id ON promo_code_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_promo_code_redemptions_redeemed_at ON promo_code_redemptions(redeemed_at);
