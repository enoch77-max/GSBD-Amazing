# Going live — Glowing Space BD

This document covers day-to-day trading operations: payments, ads, fulfilment
rhythm and security. For putting the shop on a server, start with
**[DEPLOY.md](./DEPLOY.md)** — the VPS runbook (Docker Compose, TLS, backups).
Everything below assumes the shop is already deployed.

---

## 1. What already works

| Area | State |
| --- | --- |
| Catalogue, search, facets, pagination, product pages, reviews | Complete |
| Bag, promo codes, delivery pricing, district rules | Complete |
| Checkout with phone OTP, gateway verification, fraud screening | Complete |
| Order confirmation, tracking by number + phone | Complete |
| **Merchant console** (`/admin`) — orders, inventory, customers, growth, settings | Complete |
| **Ad measurement** — Meta Pixel + Conversions API, GA4, TikTok, consent, attribution | Complete |
| **Legal** — privacy, terms, returns/refunds/warranty | Complete |
| **SEO** — sitemap, robots, Organisation + WebSite JSON-LD, OG tags | Complete |
| Server API — admin auth, orders, payments, webhooks, courier, cron, events | Complete |

Open `/admin` (preview PIN `246810`) to see the console. It opens with six weeks
of generated trading history so the reports are readable; **Settings → Sample
history** switches it off, and real orders are never mixed with it.

---

## 2. Before you spend a taka on ads

The console shows a live readiness checklist on the Overview tab. Clear every
**blocker** first:

1. **Payment gateway credentials.** bKash, Nagad and SSLCommerz ship in sandbox.
   Add merchant keys in **Settings → Payments** and switch the method to *Live*.
   A gateway is only offered at checkout when both keys are present.
2. **Meta Pixel ID.** Without it, campaigns cannot optimise for purchases.
   **Settings → Marketing.**
3. **Trade licence + BIN.** Required by Bangladeshi gateways during onboarding.
   **Settings → Business.**

Warnings (GA4, SMS provider, courier API) do not block launch but degrade
measurement or force manual work.

---

## 3. Infrastructure

Deploy with Docker Compose on a single VPS — see **[DEPLOY.md](./DEPLOY.md)**.
In short: `./deploy/make-env.sh`, `docker compose up -d --build`, create the
owner account, open the shop. The backend runs migrations and seeds the
catalogue automatically on first boot.

---

## 4. Payment provider setup

**bKash (Tokenized Checkout)**
Set `BKASH_BASE_URL` to the live host, plus app key, secret, username and
password. Register the callback as
`https://your-domain/api/webhooks/payments?provider=bkash`.

**SSLCommerz (cards, Nagad, internet banking)**
Set `SSLC_SANDBOX=false`, store ID and store password. Register the IPN URL
`https://your-domain/api/webhooks/payments?provider=sslcommerz&result=ipn`.

**How money is confirmed.** An order becomes *paid* in exactly one place: the
webhook, after the signature is verified and the provider's amount matches the
amount on our own ledger. A transaction ID typed by a customer only ever sets
the order to **Claimed** until you confirm it in the order drawer. Never change
this — it is the single most common way small shops get defrauded.

---

## 5. Advertising

1. **Verify the domain** in Meta Business Manager and replace
   `facebook-domain-verification` in `index.html`.
2. **Connect the pixel** and set `META_CAPI_TOKEN`. Browser and server events
   share an `event_id`, so Meta deduplicates them — this recovers conversions
   lost to ad blockers and iOS.
3. **Verify in Test Events.** Set `META_TEST_EVENT_CODE`, place a test order,
   and confirm `ViewContent → AddToCart → InitiateCheckout → Purchase` arrive
   once each. Remove the test code afterwards. The console's **Growth → Pixel
   inspector** shows the exact payloads without leaving the shop.
4. **Upload the catalogue.** **Inventory → Ad catalogue feed** exports a
   Meta/Google-ready CSV with price, availability, image and product category.
5. **Tag every link.** **Growth → Campaign link builder** produces UTM URLs.
   First-touch attribution is stored on each order, so **Growth → Attribution**
   reports revenue, CPA and ROAS per channel.
6. **Log spend daily** in **Growth → Log ad spend**. ROAS and contribution
   profit update immediately.

Events fired: `PageView`, `ViewContent`, `Search`, `AddToCart`,
`InitiateCheckout`, `AddPaymentInfo`, `Purchase`, `Lead`, `Contact`.
Nothing fires before consent when the banner is enabled.

---

## 6. Daily operating rhythm

- **Orders → Open** is the work queue. Screen the fraud flags, confirm payment
  claims, then bulk-select and mark *Packing* → *Shipped*.
- **Courier manifest** exports a Pathao/Steadfast-ready CSV; or connect the API
  in **Settings → Courier** and enable auto-booking on shipment.
- **Inventory** edits price and stock inline; changes are live on the storefront
  immediately. Reorder alerts fire at the threshold you set.
- **Growth → Abandoned carts** lists bags left after contact details were
  entered, with one-click recovery messages.
- Cancelling or returning an order restocks it automatically and messages the
  customer.

---

## 7. Security posture

- Admin routes require a signed, httpOnly, SameSite=Lax session cookie (8 h).
- Passwords are scrypt-hashed; comparisons are constant-time.
- Login is rate limited per IP; checkout and event relay are rate limited too.
- Every privileged mutation writes to `audit_log` with actor, target and IP.
- Webhooks verify provider signatures before touching an order.
- Secrets live only in server environment variables — never in the bundle.
- The database enforces `stock >= 0`, so concurrent checkouts cannot oversell.

**Still to do for a hardened deployment:** move the in-memory rate limiter to
Redis if you run more than one instance; add a WAF rule on `/api/admin/*`; enable
automated database backups and test a restore.

---

## 8. Known limits

- Nagad has no public direct API; it is served through SSLCommerz. The separate
  Nagad tile uses manual send-money with verification, which is how most small
  Bangladeshi shops operate.
- The OTP is generated and delivered through the configured SMS provider. With
  no provider set, the preview shows the code on screen — **connect an SMS
  provider before going live**, or switch the requirement off in Settings.
- Email is queued but not sent; connect a transactional provider (Resend,
  Postmark) in `src/lib/server/integrations.ts` if you want email receipts.

---

## 9. Verification

```bash
npm run build          # generates sitemap + the preview bundle
npm run server:test          # 18 API tests against real PostgreSQL
node scripts/live-e2e.mjs  # 12-step browser suite against the live stack
```

Both suites drive headless Chrome against the built output and must report zero
failures, zero console errors and zero failed requests.
