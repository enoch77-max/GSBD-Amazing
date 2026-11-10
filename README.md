# GSBD-Amazing — Glowing Space BD storefront

Full clone of [`enoch77-max/GSBD-Amazing`](https://github.com/enoch77-max/GSBD-Amazing) with the
original folder structure intact, plus a thin compatibility layer so the same source tree can be
deployed as a static preview (Vite single-file build) **and** still run as the original Next.js +
PostgreSQL application.

> Batteries, battery packs, BMS boards, UPS systems and DIY electronics — priced in BDT, delivered
> across Bangladesh.

---

## What is in the box

```
src/
  app/                    App Router pages, layouts, global styles, API route handlers
    api/                  health · products/search · products/upsell · reviews · orders · orders/track
    product/[slug]/       product detail
    order/[number]/       order confirmation + live status
    shop/ checkout/ track/ about/ support/
  components/             24 storefront components (header, cart drawer, checkout, gallery, tabs, …)
  db/                     Drizzle schema, PostgreSQL client, seed runner, 1,535 lines of seed data
  lib/                    commerce rules, catalogue config, cart context, formatting, queries
compat/next/              browser runtime for the Next.js APIs the app imports
scripts/smoke.mjs         headless-Chrome end-to-end test of the built preview
scripts/carousel-seam.mjs measures hero-carousel seams frame-by-frame during transitions
```

### Preserved exactly as cloned

`src/db/schema.ts` · `src/db/index.ts` · `src/db/seed.ts` · `src/db/seed-data.ts` ·
`src/app/api/**` (all six route handlers) · every component in `src/components/**` ·
`src/lib/{cart,catalog,commerce,format,nav,product-copy}.ts` · `src/app/globals.css` ·
`src/app/store-decoration.css` · `next.config.ts` · `drizzle.config.json` · `eslint.config.mjs`.

`package.next.json` holds the original Next.js manifest; `src/lib/queries.server.ts` holds the
original Drizzle implementation of the query layer.

---

## Running the static preview (default)

```bash
npm install
npm run build      # → dist/index.html, a single self-contained file
npm run preview
```

The preview is a fully working storefront, not a mock:

* **Catalogue** — 30 seeded products across 6 categories, faceted filtering (category, brand, price
  band, in-stock), 5 sort orders, search and pagination, all URL-driven and shareable.
* **Product pages** — gallery with zoom, spec sheets, delivery estimator, reviews with a working
  submission form and rating recalculation.
* **Bag → checkout → confirmation** — quantity steppers, upsell rail, promo codes (`GLOW10`,
  `FREESHIP`, `BUILDER300`), Dhaka/outside delivery pricing, bKash · Nagad · COD · card, order
  number generation and a live status timeline.
* **Tracking** — order number + mobile verification, including the seeded demo order
  `GSBD-10482` / `01712345678`.
* Reviews and orders persist to `localStorage`, so they survive a reload.

### How the compatibility layer works

| Next.js API | Preview runtime (`compat/next`, installed as a local `next` package) |
| --- | --- |
| `next/link`, `next/navigation` | History router with `pushState`, `popstate`, hash fallback for locked-down iframes, base-path detection, `useParams` / `useSearchParams` / `usePathname`, `notFound()` and `redirect()` as catchable control-flow signals |
| `next/image` | `<img>` with lazy loading, `fill` geometry, priority hints, bundled-asset resolution and an inline SVG fallback if a remote photo fails |
| `next/server`, `next/headers` | `NextResponse` / `NextRequest` equivalents |
| `src/app/api/**` | `src/lib/local-api.ts` intercepts `/api/*` fetches and mirrors each handler one-for-one — same validation, status codes and payloads |
| Drizzle + PostgreSQL | `src/db/local-store.ts` holds the identical table shapes and the same seed records in memory, mirrored to `localStorage`; `src/lib/queries.ts` exposes the original signatures |

Pages that were async server components (`/`, `/shop`, `/product/[slug]`, `/order/[number]`,
`/track`) read the same data synchronously and subscribe to store changes with `useStoreVersion()`
— the client equivalent of `router.refresh()`. Their markup is unchanged.

**Storefront photography.** The upstream repo references seven `/images/*.jpg` paths it never
shipped. `src/lib/media.ts` resolves them: `col-cells.jpg` is committed under `src/assets/images`
and inlined; the other six come from the Pexels CDN, which already serves every product photo in
`seed-data.ts`. The build therefore depends only on files in the source tree.

**Hero carousel.** Slides crossfade rather than slide. The photo fades out with a real alpha
`mask-image` rather than a painted gradient overlay, and is clipped to its box, so the incoming
and outgoing slides stay pixel-aligned and never show a seam. Opacity uses CSS transitions, so an
interrupted fade (quick dot clicks) carries on from its current value. Incoming and outgoing
slides use complementary easing curves, which keeps the banner from dimming mid-fade.

Two build-level adjustments: `postcss.config.mjs` skips `@tailwindcss/postcss` when Vite is driving
(Tailwind already runs through `@tailwindcss/vite`), and `src/preview.css` adds route transitions,
palette-matched scrollbars and a Noto Sans Bengali fallback so the Taka sign `৳` has a real glyph.

---

## Running the original Next.js app

```bash
cp package.next.json package.json     # original manifest (next, drizzle-kit, eslint-config-next)
npm install
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db
npx drizzle-kit push
npm run dev
```

`src/db/seed.ts` seeds the catalogue on first request; `src/lib/queries.server.ts` is the original
query layer if you want to swap it back over `src/lib/queries.ts`.

---

## Tests

```bash
npm run build
npm install --no-save puppeteer
node scripts/smoke.mjs
node scripts/carousel-seam.mjs after   # seam score per frame across 3 transitions + rapid clicks
```

21 checks covering rendering, image loading, faceting, sorting, pagination, search suggestions,
add-to-bag, checkout, order confirmation, tracking (including a rejected phone match), review
submission and persistence, 404 handling, history navigation, the Taka glyph, and mobile layout
overflow — with console-error and failed-request reporting. Screenshots land in `/tmp/shots`.

## Running it as a real shop

The merchant console lives at **`/admin`** (preview PIN `246810`): orders,
fulfilment, inventory, customers, ad attribution, message outbox, pixel
inspector and every launch setting. It opens with six weeks of generated
trading history so the reports are readable — switch it off in
**Settings → Sample history**.

Production adds phone-OTP checkout, gateway-verified payments, COD fraud
screening, stock decrementing, Meta Pixel + Conversions API, GA4, TikTok,
consent gating, first-touch attribution, abandoned-cart recovery, courier
booking, and the privacy / terms / refunds pages ad platforms require.

**[PRODUCTION.md](./PRODUCTION.md) is the go-live runbook** — credentials,
infrastructure, webhook setup, ad verification and the daily operating rhythm.

```bash
npm run build               # sitemap + self-contained preview
npm run next:build          # the real Next.js + PostgreSQL application
node scripts/smoke.mjs      # 21 storefront checks
node scripts/smoke-ops.mjs  # 23 console, payment and tracking checks
```

## Deploy on a VPS

The shop runs as three containers (app + Postgres + Caddy) on one server:

```bash
./deploy/make-env.sh          # writes .env with strong secrets
docker compose up -d --build  # builds, migrates, seeds, starts everything
docker compose exec app node backend/dist/cli.mjs create-admin --email=you@domain.com --password='…'
```

**[DEPLOY.md](./DEPLOY.md)** is the full runbook: server prep, DNS, backups,
updates, cron, troubleshooting and scaling. The backend lives in `backend/`,
the storefront in `src/` (built to `dist/` and served by the backend), and
`deploy/` holds the operations scripts.
