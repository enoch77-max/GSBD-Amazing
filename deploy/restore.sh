#!/usr/bin/env bash
# Restores a backup created by deploy/backup.sh. DESTRUCTIVE: the current
# database is dropped first. The app is stopped and restarted automatically.
# Usage: ./deploy/restore.sh backups/20260214-030000
set -euo pipefail

cd "$(dirname "$0")/.."
SRC="${1:-}"
if [[ -z "${SRC}" || ! -f "${SRC}/db.sql.gz" ]]; then
  echo "Usage: $0 backups/<timestamp>"
  echo "Available:"; ls -1 backups 2>/dev/null || echo "  (none)"
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

echo "This will REPLACE the live database and uploads with ${SRC}."
read -rp "Type the domain (${DOMAIN}) to continue: " CONFIRM
if [[ "${CONFIRM}" != "${DOMAIN}" ]]; then
  echo "Aborted."
  exit 1
fi

docker compose stop app
docker compose exec -T db psql -U "${POSTGRES_USER}" -d postgres \
  -c "DROP DATABASE IF EXISTS \"${POSTGRES_DB}\" WITH (FORCE)" \
  -c "CREATE DATABASE \"${POSTGRES_DB}\" OWNER \"${POSTGRES_USER}\""
gunzip -c "${SRC}/db.sql.gz" | docker compose exec -T db psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -q
cat "${SRC}/uploads.tar.gz" | docker compose exec -T app tar xzf - -C /app/data || true
docker compose start app

echo "[restore] done. Verify with: docker compose exec app node backend/dist/cli.mjs stats"
