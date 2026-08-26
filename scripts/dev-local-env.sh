# Shared environment for the local-only dev commands. Sourced, not executed.
#
# DATABASE_URL is exported here, before node starts. dotenv does not overwrite
# variables that are already set, so this always wins over .env -- the hosted
# database cannot be reached by anything that sources this file.

DEV_DB_CONTAINER="${DEV_DB_CONTAINER:-pepx-dev-db}"
DEV_DB_PORT="${DEV_DB_PORT:-5433}"
DEV_DB_NAME="${DEV_DB_NAME:-pepxdev}"
DEV_DB_PASSWORD="${DEV_DB_PASSWORD:-devpass}"

export DATABASE_URL="postgresql://postgres:${DEV_DB_PASSWORD}@127.0.0.1:${DEV_DB_PORT}/${DEV_DB_NAME}"
export PORT="${DEV_LOCAL_PORT:-3010}"
export NODE_ENV=development

ensure_local_db() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "docker is required for the local dev database (npm run dev:local)." >&2
    return 1
  fi

  if [ -z "$(docker ps -q -f "name=^/${DEV_DB_CONTAINER}$")" ]; then
    if [ -n "$(docker ps -aq -f "name=^/${DEV_DB_CONTAINER}$")" ]; then
      echo "Starting existing local dev database container ${DEV_DB_CONTAINER}..."
      docker start "$DEV_DB_CONTAINER" >/dev/null
    else
      echo "Creating local dev database container ${DEV_DB_CONTAINER} on port ${DEV_DB_PORT}..."
      docker run -d --name "$DEV_DB_CONTAINER" \
        -e POSTGRES_PASSWORD="$DEV_DB_PASSWORD" \
        -e POSTGRES_DB="$DEV_DB_NAME" \
        -p "${DEV_DB_PORT}:5432" \
        postgres:16 >/dev/null
    fi
  fi

  printf 'Waiting for local Postgres on port %s' "$DEV_DB_PORT"
  for _ in $(seq 1 90); do
    # A real query over TCP, not `pg_isready` over the unix socket. The official
    # postgres image runs a socket-only server while it initialises the data
    # directory, so a socket check reports ready too early and the first real
    # connection is dropped with "Connection terminated unexpectedly".
    if docker exec "$DEV_DB_CONTAINER" psql -h 127.0.0.1 -U postgres -d "$DEV_DB_NAME" -tAc 'SELECT 1' >/dev/null 2>&1; then
      echo ' ready.'
      return 0
    fi
    printf '.'
    sleep 1
  done
  echo
  echo "Local Postgres did not become ready in time." >&2
  return 1
}
