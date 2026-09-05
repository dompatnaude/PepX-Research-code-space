-- 033_coa_file_blobs.sql
-- Durable storage for COA report files. Additive only: this creates one new
-- table and changes nothing that already exists.
--
-- Why: the COA upload path wrote report files to the local filesystem
-- (uploads/coas). Production runs as a Vercel serverless function, where the
-- filesystem is read-only and per-invocation, and uploads/ is not even in
-- vercel.json includeFiles. Those writes could never succeed in production.
--
-- Report bytes now live in Postgres next to their metadata, which also makes
-- an upload a single atomic transaction: there is no longer any way to end up
-- with a coas row pointing at a file that does not exist, or a stored file
-- with no row pointing at it.
CREATE TABLE IF NOT EXISTS coa_files (
  storage_key TEXT PRIMARY KEY,
  coa_id      INTEGER REFERENCES coas(id) ON DELETE CASCADE,
  mime_type   VARCHAR(100) NOT NULL,
  byte_size   INTEGER NOT NULL,
  data        BYTEA NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coa_files_coa_id ON coa_files(coa_id);
