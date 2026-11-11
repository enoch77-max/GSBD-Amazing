# Merchant Console Guide

## Opening the console

- Go to **`/admin`** on the store (for example `https://your-domain/admin`).
- Or use **Menu → Merchant console** in the storefront header, or the
  **Merchant console** link in the footer.

### Preview (this build)

- First sign-in PIN: **`246810`**.
- Change it straight away in **Settings → Security**. The PIN is stored as a
  salted hash in this browser, and the default-PIN hint disappears afterwards.
- Five wrong PINs lock sign-in for 60 seconds. Sessions end after 8 hours.
- Preview data (products, stock, orders, PIN) lives in this browser only.
  Clearing the site's data resets it. This preview protection is a convenience
  gate; anyone with access to the device and its storage can bypass it.

### Production server

When the store runs on the backend (Docker/VPS), `/admin` uses email + password
accounts with server-side sessions instead of the PIN. Create the first owner:

```bash
docker compose exec app node backend/dist/cli.mjs create-admin --email=you@domain.com --password='…'
```

## Staff accounts & roles

Each person signs in with their own account and 6-digit PIN (pick the account
on the sign-in screen). Owners manage people in **Team & roles**.

| Role | Access |
| --- | --- |
| Owner | Everything, including staff, roles and settings |
| Store manager | Everything except staff/roles and core settings |
| Sales & support | Orders, payments, refunds, customers, review moderation |
| Warehouse | Order fulfilment and stock levels — no prices or payments |
| Marketing | Product content, reviews, promotions, ads |
| Viewer | Read-only dashboard, orders, products, activity log |

Built-in roles are fixed; **Duplicate** one to create a custom role with any of
the 18 permissions. Sections and buttons a role cannot use are hidden or
disabled. Safeguards: the store always keeps one active owner, you cannot
deactivate yourself or change your own role, and every role can change its own
PIN in **My account**. Every staff change is recorded in the **Activity log**
(exportable as CSV).

## Sections

| Section | What it is for |
| --- | --- |
| Overview | Revenue, orders, launch readiness, reorder alerts |
| Reviews | Publish or hide reviews, filter low ratings, bulk moderation |
| Promotions | Discount codes with schedules, usage limits, pause/resume, usage stats |
| Team & roles | Staff accounts, PIN resets, roles, permission matrix |
| Activity log | Who changed what and when, with filters and CSV export |
| My account | Change your own PIN, see session expiry |
| Orders | Status changes, notes, payments, refunds, courier manifest, CSV export |
| **Products** | Add, edit, duplicate, hide, delete, restore; bulk show/hide, bestseller, ±% price, set stock, delete, CSV export |
| Stock | Quick inline stock and price edits (includes hidden products) |
| Customers | Repeat buyers built from order history |
| Growth | Ad spend, attribution, abandoned carts, message outbox |
| Pack AI | Rules for the Pack Builder's recommended add-ons |
| Settings | Business details, payments, shipping/COD, fraud rules, messaging, courier, **Security** |

## Catalogue tips

- **Hide** removes a product from the shop, search, product page, checkout and
  Pack Builder without losing it. Stock stays editable in **Stock**.
- **Delete** is permanent for products you added. Built-in products can be
  restored from **Deleted built-in products**.
- The URL slug is fixed after creation so links and existing orders keep working.
- Uploaded images are resized to 1000px and stored in the browser. If storage
  fills up, the console says so; remove large uploads or use image URLs.

## Ready-made packs and the Pack Builder

Use **New ready-made pack**. It pre-fills the specifications the Pack Builder
reads. A pack is recommended as an alternative only when the **Pack Builder
readiness** panel turns green:

- category *Battery Packs*, on sale, priced, complete packs in stock, and not
  described as built-to-order, pre-order or a service deposit;
- explicit **Chemistry**, **Configuration** (e.g. `3S2P`), **Capacity**,
  **Continuous discharge current** and a built-in **BMS**;
- no conflicting values (capacity vs cells, energy vs capacity, voltages).

The list shows **Pack Builder match** or **Needs specs** for every battery pack.
Only publish ratings that your own tests or the cell datasheets support. See
[`PACK_MATCHING.md`](./PACK_MATCHING.md) for the full matching rules.

## Testing

```bash
npm run build
npm install --no-save puppeteer
node scripts/admin-portal-e2e.mjs   # ADMIN_SCREENSHOTS=qa/admin to save screenshots
```
