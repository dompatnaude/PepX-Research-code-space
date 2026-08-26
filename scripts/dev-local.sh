#!/usr/bin/env bash
# Runs this codebase against a throwaway LOCAL Postgres, on its own port.
#
# The hosted database is never contacted: DATABASE_URL is overwritten with a
# localhost URL before node starts, and scripts/assert-local-db.js aborts if it
# somehow is not local. Migrations run on boot as usual -- against the local
# container. Stop and delete the container with: npm run dev:local:down
set -euo pipefail

cd "$(dirname "$0")/.."
# shellcheck source=scripts/dev-local-env.sh
. scripts/dev-local-env.sh

ensure_local_db
node scripts/assert-local-db.js

echo "Starting the app on port ${PORT} against the LOCAL dev database."
exec node server.js
