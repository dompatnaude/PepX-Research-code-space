#!/usr/bin/env bash
# Seeds obviously-labelled test data into the LOCAL dev database only.
set -euo pipefail

cd "$(dirname "$0")/.."
# shellcheck source=scripts/dev-local-env.sh
. scripts/dev-local-env.sh

ensure_local_db
node scripts/assert-local-db.js
exec node scripts/seed-dev-data.js
