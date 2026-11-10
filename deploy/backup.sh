#!/usr/bin/env bash
# Backs up the database (pg_dump) and uploaded product images.
# Keeps the 14 most recent backups. Safe to run from cron every night.
# Usage: ./deploy/backup.sh
set -euo pipefail

cd "$(dirname "$0")/.."
set -a
# shellcheck disable=SC1091
. ./.env
set +a

STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="backups/${STAMP}"
mkdir -p "${DEST}"

echo "[backup] database → ${DEST}/db.sql.gz"
docker compose exec -T db pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --no-owner --no-privileges \
  | gzip > "${DEST}/db.sql.gz"

echo "[backup] uploads → ${DEST}/uploads.tar.gz"
docker compose exec -T app tar czf - -C /app/data uploads > "${DEST}/uploads.tar.gz"

echo "${STAMP} $(du -sh "${DEST}" | cut -f1)" >> backups/log.txt

# Rotate: keep the newest 14.
mapfile -t OLD < <(ls -1t backups | grep -E '^[0-9]{8}-[0-9]{6}$' | tail -n +15 || true)
for dir in ${OLD[@]:-}; do
  rm -rf "backups/${dir}"
  echo "[backup] rotated out ${dir}"
done

echo "[backup] done: ${DEST}"
