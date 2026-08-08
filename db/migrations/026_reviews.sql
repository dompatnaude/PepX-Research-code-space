-- Customer reviews with admin moderation.
-- New reviews are always created unapproved (approved = FALSE) by the server.
-- Only approved reviews are shown publicly. Email is never exposed publicly.
CREATE TABLE IF NOT EXISTS reviews (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_reviews_approved_created_at
  ON reviews (approved, created_at DESC);
