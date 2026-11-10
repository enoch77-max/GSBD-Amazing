#!/usr/bin/env bash
# Read-only deployment preflight. Prints fixes without exposing secrets.
# Usage: ./deploy/doctor.sh [--online]
set -euo pipefail
cd "$(dirname "$0")/.."

FAILURES=0
warn() { echo "  [WARN] $*"; }
fail() { echo "  [FAIL] $*"; FAILURES=$((FAILURES + 1)); }
ok() { echo "  [OK] $*"; }

echo "== Runtime =="
if command -v docker >/dev/null 2>&1; then
  ok "docker $(docker --version | cut -d' ' -f3 | tr -d ',')"
  if docker compose version >/dev/null 2>&1; then
    ok "$(docker compose version | head -1)"
  else
    fail "Docker Compose v2 is missing. Install the docker-compose-plugin package."
  fi
  if ! docker info >/dev/null 2>&1; then
    fail "Docker daemon is not running or this user cannot access it. Start Docker or add the user to the docker group, then log in again."
  fi
else
  fail "Docker is missing. Install Docker Engine and Compose v2 first."
fi

if command -v openssl >/dev/null 2>&1; then ok "openssl available"; else fail "openssl missing (needed by make-env.sh)."; fi

echo "== Environment =="
if [[ ! -f .env ]]; then
  fail ".env is missing. Run ./deploy/make-env.sh first."
else
  ok ".env exists"
  MODE="$(stat -c '%a' .env 2>/dev/null || stat -f '%Lp' .env)"
  if [[ "$MODE" == "600" || "$MODE" == "400" ]]; then ok ".env permissions are $MODE"; else warn ".env permissions are $MODE; run chmod 600 .env"; fi
  set -a; # shellcheck disable=SC1091
  . ./.env
  set +a
  : "${DOMAIN:=}"; : "${SESSION_SECRET:=}"; : "${POSTGRES_PASSWORD:=}"; : "${CRON_SECRET:=}"
  [[ -n "$DOMAIN" ]] && ok "domain is configured" || fail "DOMAIN is empty"
  if [[ "${#SESSION_SECRET}" -ge 32 && "$SESSION_SECRET" != change-me* ]]; then ok "session secret is strong"; else fail "SESSION_SECRET is missing, weak or unchanged"; fi
  if [[ "${#POSTGRES_PASSWORD}" -ge 32 && "$POSTGRES_PASSWORD" != change-me* ]]; then ok "database password is strong"; else fail "POSTGRES_PASSWORD is missing, weak or unchanged"; fi
  if [[ "${#CRON_SECRET}" -ge 32 && "$CRON_SECRET" != change-me* ]]; then ok "cron secret is strong"; else fail "CRON_SECRET is missing, weak or unchanged"; fi
  if [[ "$POSTGRES_PASSWORD" == *['/'+'=']* ]]; then
    fail "POSTGRES_PASSWORD contains URL-reserved characters. Regenerate with ./deploy/make-env.sh --force or URL-encode it in docker-compose.yml."
  fi
fi

echo "== Compose =="
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  if docker compose config --quiet; then ok "docker-compose.yml and variables are valid"; else fail "docker compose config failed; read the error above"; fi
fi

echo "== Network =="
if [[ -n "${DOMAIN:-}" ]]; then
  if command -v getent >/dev/null 2>&1 && getent hosts "$DOMAIN" >/dev/null 2>&1; then
    ok "$DOMAIN resolves in DNS"
  else
    warn "$DOMAIN does not resolve from this machine yet. Point its A record at this VPS before requesting TLS."
  fi
fi
for port in 80 443; do
  if command -v ss >/dev/null 2>&1 && ss -ltn "sport = :$port" | tail -n +2 | grep -q .; then
    ok "TCP $port has a listener (normally Caddy after deployment)"
  else
    warn "no listener on TCP $port yet; ensure the VPS firewall/provider firewall allows it"
  fi
done

if [[ "${1:-}" == "--online" ]]; then
  echo "== Live service =="
  HEALTH="$(curl -fsS --max-time 10 "https://${DOMAIN}/api/health" 2>/dev/null || true)"
  if [[ "$HEALTH" == *'"ok":true'* ]]; then ok "public API is healthy"; else fail "https://${DOMAIN}/api/health did not return ok"; fi
  ADMIN_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "https://${DOMAIN}/api/admin/overview" || true)"
  if [[ "$ADMIN_STATUS" == "401" ]]; then ok "owner API rejects anonymous access"; else fail "anonymous owner API returned $ADMIN_STATUS, expected 401"; fi
fi

if [[ "$FAILURES" -gt 0 ]]; then
  echo
  echo "$FAILURES blocking check(s) failed. Fix them before taking orders."
  exit 1
fi
echo
echo "Preflight passed. Build with: docker compose up -d --build"
