-- 021_coas.sql
-- Certificate of Analysis records. Additive only; safe to re-run.
CREATE TABLE IF NOT EXISTS coas (
  id                    SERIAL PRIMARY KEY,
  product_id            INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id            INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
  batch_number          VARCHAR(100),
  lab_name              VARCHAR(255),
  test_type             VARCHAR(100),
  test_date             DATE,
  report_date           DATE,
  title                 VARCHAR(255),
  notes                 TEXT,
  file_storage_key      TEXT,
  file_name             VARCHAR(500),
  file_mime_type        VARCHAR(100),
  file_size             INTEGER,
  thumbnail_storage_key TEXT,
  status                VARCHAR(20) NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'published', 'archived')),
  created_by            TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by            TEXT REFERENCES users(id) ON DELETE SET NULL,
  published_by          TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at          TIMESTAMPTZ,
  archived_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_coas_product_id ON coas(product_id);
CREATE INDEX IF NOT EXISTS idx_coas_variant_id ON coas(variant_id);
CREATE INDEX IF NOT EXISTS idx_coas_status ON coas(status);
