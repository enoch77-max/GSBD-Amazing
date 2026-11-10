#!/usr/bin/env bash
# Deploys the latest code with a fresh backup taken first.
# Usage: ./deploy/update.sh
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -d .git ]]; then
  echo "[update] pulling latest code…"
  git pull --ff-only
else
  echo "[update] no git checkout — deploying the code in this directory."
fi

echo "[update] safety backup…"
./deploy/backup.sh

echo "[update] rebuilding…"
docker compose build app
docker compose up -d --no-deps app

echo "[update] waiting for health…"
for _ in $(seq 1 24); do
  if docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))" 2>/dev/null; then
    echo "[update] healthy."
    break
  fi
  sleep 5
done

docker compose ps
docker image prune -f >/dev/null || true
echo "[update] done. If anything looks wrong: ./deploy/restore.sh backups/<previous-timestamp>"
