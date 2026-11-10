# Deploying Glowing Space BD on one VPS

Everything the shop needs — storefront, API, owner console, database, TLS —
runs on a **single VPS** with three containers. This document takes you from an
empty server to taking orders, usually in under an hour.

> **Should the backend live on the same VPS?** Yes — at this scale it is the
> right call. One machine means no network between the app and the database
> (fast, free, and nothing to secure in transit), one backup story, one bill
> (roughly $6–12/month), and one mental model. Split services across machines
> only when a single VPS can no longer keep up (tens of thousands of daily
> visitors) or when you need high availability. The Compose layout below makes
> that split easy later: the `db` service can move to managed Postgres by
> changing one URL.

## Folder map

```
.                          project root — this is what you deploy
├── backend/               the production backend (Node + PostgreSQL, zero framework deps)
│   ├── index.ts           entry point: migrate → seed → listen
│   ├── app.ts             route assembly (shop + admin + pages)
│   ├── http.ts            router, cookies, rate limits, CSRF, static files
│   ├── db.ts              pooled queries, transactions, migration runner
│   ├── auth.ts            passwords, sessions, OTP, claim tokens, audit
│   ├── shop.ts            public API: catalogue, OTP, orders, tracking, webhooks, cron, SEO
│   ├── admin.ts           owner API: orders, products, uploads, promos, settings, exports…
│   ├── pages.ts           serves the built storefront with live SEO meta
│   ├── settings.ts        validated store settings (DB-backed)
│   ├── providers.ts       Meta CAPI, SMS, bKash, SSLCommerz, Pathao/Steadfast
│   ├── notify.ts          message outbox, cart recovery, order expiry
│   ├── seed.ts            catalogue + promos + settings seeding (idempotent)
│   ├── cli.ts             operator commands (migrate, seed, create-admin, stats)
│   ├── migrations/        SQL schema, applied in order, exactly once each
│   └── tests/             API suite, run against real PostgreSQL
├── src/                   the React storefront (Vite build → served by backend)
│   ├── owner/             owner console UI (talks to /api/admin/*)
│   └── …                  shop pages, components, local preview stores
├── scripts/               build + sitemap + test runners
│   ├── build-server.mjs   bundles backend/* with esbuild
│   ├── live-e2e.mjs       12-step browser suite against the live stack
│   └── smoke*.mjs         preview-mode regression suites
├── deploy/                operations scripts (run on the VPS, not in containers)
│   ├── make-env.sh        generates .env with strong secrets
│   ├── backup.sh          database + uploads backup with rotation
│   ├── restore.sh         destructive restore from a backup
│   └── update.sh          pull → backup → rebuild → health-check
├── docker-compose.yml     app + db + caddy, volumes, health checks
├── Dockerfile             multi-stage build (dev deps never reach production)
├── Caddyfile              automatic HTTPS + security headers + www redirect
├── .env.example           every variable, documented (copy of what make-env writes)
└── dist/                  built storefront (created by `npm run build`)
```

## 1. Prepare the VPS

- **Size:** 2 vCPU / 4 GB RAM / 40 GB disk minimum (Hetzner CX22, DigitalOcean
  basic, or any Dhaka VPS provider). The stack idles under 1 GB.
- **OS:** Ubuntu 24.04 LTS. Point `yourdomain.com` and `www.yourdomain.com`
  (A records) at the server IP and wait for DNS to resolve.
- **Firewall:** allow 22, 80, 443 — nothing else:
  `sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw --force enable`
- **Docker:** `curl -fsSL https://get.docker.com | sh` then log out/in.
  Verify with `docker compose version`.
- **Updates:** `sudo apt install -y unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades`

## 2. Ship the code

```bash
# on the VPS, as your deploy user:
git clone <your-repo-url> gsbd && cd gsbd
# …or upload this directory with scp/rsync if you have no git remote yet.
```

## 3. Configure and start

```bash
./deploy/make-env.sh          # answers 2 questions, writes .env (mode 600)
docker compose up -d --build  # builds, migrates, seeds, starts all three services
docker compose exec app node backend/dist/cli.mjs create-admin \
  --email=you@yourdomain.com --password='a-long-unique-password'
```

Open `https://yourdomain.com` (Caddy issues the certificate on first request —
allow ~60 seconds) and sign in at `https://yourdomain.com/admin`.

Verify the stack:

```bash
curl -s https://yourdomain.com/api/health
# {"ok":true,"live":true,...}
docker compose exec app node backend/dist/cli.mjs stats
```

## 4. Go-live checklist (in the owner console)

The Overview tab shows a live readiness checklist. Clear every **blocker**:

1. **Settings → Payments** — switch each gateway from sandbox to live and paste
   merchant credentials. Methods stay hidden from checkout until both keys exist.
2. **Settings → Marketing** — paste the Meta Pixel ID (and the Conversions API
   token so server-side events flow). Verify in Meta Events Manager → Test
   Events with a test order, then remove the test code.
3. **Settings → Business** — confirm the trading name, domain, trade licence
   and BIN (gateways check these during onboarding).
4. **Settings → Messaging** — connect BulkSMSBD or GreenWeb so confirmations,
   OTP codes and courier updates actually deliver.
5. **Settings → Courier** — connect Pathao/Steadfast or keep manual entry with
   the one-click manifest export.
6. **Growth → Product feed** — upload the catalogue CSV to Meta/Google for
   shopping ads, and tag every ad link with the campaign builder.

Then place a **real test order yourself** (a cheap item, then cancel it in the
console to confirm the refund/restock path), and confirm the order SMS arrives.

## 5. Scheduled jobs (on the VPS host, not in containers)

```cron
# Nightly backup at 03:00, maintenance tick every 30 minutes.
0 3 * * * cd /home/deploy/gsbd && ./deploy/backup.sh >> backups/cron.log 2>&1
*/30 * * * * curl -sS -H "Authorization: Bearer $CRON_SECRET" https://yourdomain.com/api/cron/tick >> /home/deploy/gsbd/backups/cron.log 2>&1
```

The tick flushes the message outbox, sends due cart-recovery SMS, and cancels
unpaid pending orders older than 24 hours (restocking them). Get the secret
with `grep CRON_SECRET .env`.

## 6. Daily operations

| Task | How |
| --- | --- |
| Fulfil orders | `/admin` → Orders: screen flags → bulk pack/ship → manifest or auto-book |
| Check health | `docker compose ps` and `/api/health` |
| Read logs | `docker compose logs -f app` (or `db`, `caddy`) |
| Quick figures | `docker compose exec app node backend/dist/cli.mjs stats` |
| Deploy new code | `./deploy/update.sh` (backs up first) |
| Restore | `./deploy/restore.sh backups/<timestamp>` |
| Add staff | `/admin` → Settings → Team (staff never see secrets) |

## 7. Security posture

- Admin sessions are signed, httpOnly, `SameSite=Lax`, `Secure` cookies (8 h).
  Deleting or deactivating an account revokes it immediately.
- Passwords are scrypt-hashed (verified in constant time); owner-only routes
  guard settings, users and the audit log; the store keeps working with at
  least one active owner enforced.
- Every privileged mutation writes to `audit_log` with actor, target and IP;
  secrets are redacted before writing.
- Mutations require the `x-requested-with: fetch` marker (CSRF); login,
  checkout, OTP and the event relay are rate-limited per IP.
- All SQL is parameterised; uploads are type-checked by magic bytes (JPG/PNG/
  WebP only, 4 MB cap) and served as inert static files.
- Money becomes *paid* in exactly one place — the provider webhook — after
  signature verification and an amount match against our own ledger. A typed
  TrxID is a *claim* until the owner confirms it.
- The database enforces `stock >= 0`, so concurrent checkouts cannot oversell;
  claim tokens (not guessable URLs) guard the confirmation page.
- TLS is automatic via Caddy with HSTS; security headers are set at both the
  edge and the app; the containers run as a non-root user and only Caddy
  exposes ports to the internet.

## 8. Troubleshooting

| Symptom | Look at |
| --- | --- |
| `502` / connection refused | `docker compose ps` — is `app` healthy? `docker compose logs app` |
| Certificate errors | DNS must resolve to this server first; `docker compose logs caddy` |
| `relation does not exist` | Migrations run on boot; check the app log for `[db] applied migration` |
| Uploads vanish after rebuild | They live in the `uploads` volume — never `docker compose down -v` |
| Out of disk | `docker image prune -f`; backups rotate automatically (14 kept) |
| SMS not delivering | Growth → Outbox shows the provider error per message |
| Forgot admin password | `docker compose exec app node backend/dist/cli.mjs create-admin --email=<same> --password='<new>'` (upserts) |

## 8.1 Running the test suites

```bash
# Backend API suites, against a throwaway PostgreSQL.
node scripts/dev-db.mjs &                     # real Postgres 16 on 127.0.0.1:5433 (no sudo needed)
DATABASE_URL=postgresql://postgres:gsbd@127.0.0.1:5433/gsbd_features \
  SESSION_SECRET=test-secret-minimum-32-chars NODE_ENV=test PORT=3211 \
  npm run server:test:features
DATABASE_URL=postgresql://postgres:gsbd@127.0.0.1:5433/gsbd_prod_test \
  SESSION_SECRET=test-secret-minimum-32-chars NODE_ENV=production PORT=3212 \
  npm run server:test:production

# Full browser suite (needs Chrome deps + a seeded gsbd_browser database).
BASE=http://127.0.0.1:4301 node scripts/features-e2e.mjs
```

The feature suite proves, against a real database, that a forged pack price is
replaced by the server's catalogue price, that a pack order reserves its cells,
BMS and nickel (and cancels restore them), that helpful votes are idempotent,
and that activity feed entries never leak names, addresses or phones.

## 9. When you outgrow one VPS

In order of likelihood: (1) bigger VPS, (2) move `db` to managed Postgres and
point `DATABASE_URL` at it, (3) serve `/uploads` from object storage + CDN,
(4) move the in-memory rate limiter/OTP store to Redis and run two `app`
replicas. Nothing in the code assumes a single machine except the two
in-memory stores, which are marked in the source.
