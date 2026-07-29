-- Replace the old test order schema (from 002) with the production-ready schema.
-- The previous orders/order_items tables held only test data and are dropped.
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;

CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id),
    status VARCHAR(50) DEFAULT 'pending_payment',
    subtotal NUMERIC(10,2),
    shipping_cost NUMERIC(10,2) DEFAULT 0,
    total NUMERIC(10,2),
    shipping_name VARCHAR(255),
    shipping_email VARCHAR(255),
    shipping_address TEXT,
    shipping_city VARCHAR(100),
    shipping_state VARCHAR(100),
    shipping_zip VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    name VARCHAR(255),
    price NUMERIC(10,2),
    quantity INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shipments (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL DEFAULT 'easypost',
    provider_shipment_id TEXT NOT NULL,
    provider_tracker_id TEXT,
    rate_id TEXT,
    carrier VARCHAR(100),
    service VARCHAR(100),
    tracking_number VARCHAR(255),
    tracking_url TEXT,
    label_url TEXT,
    label_format VARCHAR(20) NOT NULL DEFAULT 'PDF',
    label_cost NUMERIC(10,2),
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    shipment_status VARCHAR(50) NOT NULL DEFAULT 'rated',
    is_voided BOOLEAN NOT NULL DEFAULT FALSE,
    voided_at TIMESTAMP,
    purchased_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT shipments_provider_shipment_id_key UNIQUE (provider, provider_shipment_id)
);

CREATE INDEX IF NOT EXISTS shipments_order_id_created_at_idx ON shipments (order_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS shipments_provider_tracker_id_idx ON shipments (provider_tracker_id);
CREATE INDEX IF NOT EXISTS shipments_tracking_number_idx ON shipments (tracking_number);
CREATE INDEX IF NOT EXISTS shipments_purchased_at_idx ON shipments (order_id, purchased_at DESC);

CREATE TABLE IF NOT EXISTS shipment_webhook_events (
    id SERIAL PRIMARY KEY,
    event_id TEXT NOT NULL UNIQUE,
    provider VARCHAR(50) NOT NULL DEFAULT 'easypost',
    event_type VARCHAR(100),
    tracker_status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
