-- Customers admin section support.
-- Adds an admin-only internal notes table and supporting indexes for the
-- admin Customers list/profile aggregation queries.

-- Internal, admin-only notes about a customer. Never exposed to customers.
CREATE TABLE IF NOT EXISTS customer_notes (
  id BIGSERIAL PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup of a customer's notes on the profile page.
CREATE INDEX IF NOT EXISTS idx_customer_notes_customer_id
  ON customer_notes (customer_id, created_at DESC);

-- Speeds up per-customer order aggregation (order count, lifetime spend,
-- last/first order) used by the admin Customers list and profile.
CREATE INDEX IF NOT EXISTS idx_orders_user_id
  ON orders (user_id);
