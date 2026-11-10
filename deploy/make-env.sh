#!/usr/bin/env bash
# Generates a production .env with strong, URL-safe random secrets.
# Usage: ./deploy/make-env.sh [--force]
# Automation: DOMAIN=shop.example TLS_EMAIL=owner@example ./deploy/make-env.sh
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -f .env && "${1:-}" != "--force" ]]; then
  echo ".env already exists. Re-run with --force to overwrite it (this logs everyone out)."
  exit 1
fi

command -v openssl >/dev/null || { echo "openssl is required (apt install openssl)."; exit 1; }

DOMAIN="${DOMAIN:-}"
TLS_EMAIL="${TLS_EMAIL:-}"
if [[ -z "$DOMAIN" ]]; then
  read -rp "Domain (e.g. glowingspacebd.com): " DOMAIN
  DOMAIN="${DOMAIN:-glowingspacebd.com}"
fi
if [[ ! "$DOMAIN" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ ]] || [[ "$DOMAIN" == *..* ]]; then
  echo "Invalid domain. Use a hostname such as shop.example.com, without protocol or path."
  exit 1
fi
DOMAIN="${DOMAIN,,}"
if [[ -z "$TLS_EMAIL" ]]; then
  read -rp "Email for TLS certificates [owner@${DOMAIN}]: " TLS_EMAIL
  TLS_EMAIL="${TLS_EMAIL:-owner@${DOMAIN}}"
fi
if [[ ! "$TLS_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then
  echo "Invalid TLS contact email."
  exit 1
fi

# Hex avoids '/', '+' and '=' in PostgreSQL's connection URI. Base64 is fine for
# the other secrets because they are never placed in a URL.
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
SESSION_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
CRON_SECRET="$(openssl rand -hex 32)"

umask 077
cat > .env <<EOF
DOMAIN="${DOMAIN}"
TLS_EMAIL="${TLS_EMAIL}"
SITE_URL="https://${DOMAIN}"
BUILD_ID="prod"

POSTGRES_USER="gsbd"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"
POSTGRES_DB="gsbd"

SESSION_SECRET="${SESSION_SECRET}"
CRON_SECRET="${CRON_SECRET}"
EOF
chmod 600 .env

echo
echo ".env written (mode 600). Next:"
echo "  1. ./deploy/doctor.sh"
echo "  2. docker compose up -d --build"
echo "  3. docker compose exec app node backend/dist/cli.mjs create-admin --email=you@${DOMAIN} --password='a-long-unique-password'"
echo "  4. Open https://${DOMAIN} and sign in at https://${DOMAIN}/admin"
