/**
 * End-to-end API tests against a real PostgreSQL database.
 *
 * Run:  DATABASE_URL=postgresql://gsbd:secret@127.0.0.1:5432/gsbd_test \
 *       SESSION_SECRET=test-secret-minimum-32-chars-long \
 *       NODE_ENV=test PORT=3210 FRONTEND_DIR=/tmp/gsbd-test-fe UPLOAD_DIR=/tmp/gsbd-test-up \
 *       SITE_URL=http://127.0.0.1:3210 CRON_SECRET=test-cron \
 *       npm run server:test
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { Client } from "pg";
import type { Server } from "node:http";
import { createApp } from "../app";
import { migrate, closeDb, query } from "../db";
import { seedAll } from "../seed";
import { hashPassword } from "../auth";

const BASE = "http://127.0.0.1:3210";
const OWNER = { email: "owner@shop.test", password: "owner-password-123" };

type Response = { status: number; json: Record<string, unknown>; text: string; headers: Headers };

async function call(
  pathname: string,
  options: { method?: string; body?: unknown; cookie?: string; rawBody?: string; contentType?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.cookie) headers.cookie = options.cookie;
  const method = options.method ?? "GET";
  let payload: string | undefined;
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") headers["x-requested-with"] = "fetch";
  if (options.body !== undefined || options.rawBody !== undefined) {
    headers["content-type"] = options.contentType ?? "application/json";
    payload = options.rawBody ?? JSON.stringify(options.body);
  }
  const response = await fetch(`${BASE}${pathname}`, {
    method,
    headers,
    body: payload,
    redirect: "manual",
  });
  const text = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = {};
  }
  return { status: response.status, json, text, headers: response.headers };
}

let ownerCookie = "";
let server: Server | null = null;
let catalog: {
  products: Array<{ slug: string; price: number; stock: number; name: string }>;
  promos: Array<{ code: string; minSubtotal: number }>;
} = { products: [], promos: [] };

before(async () => {
  const dbUrl = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(dbUrl.pathname.slice(1), "gsbd_test", "tests must run against gsbd_test");
  mkdirSync("/tmp/gsbd-test-fe", { recursive: true });
  writeFileSync(
    "/tmp/gsbd-test-fe/index.html",
    "<!doctype html><html><head><meta charset=\"utf-8\"><title>Test Shop</title></head><body><div id=\"root\"></div></body></html>",
  );
  mkdirSync("/tmp/gsbd-test-up", { recursive: true });

  const admin = new Client({ connectionString: (process.env.DATABASE_URL ?? "").replace(/\/gsbd_test([?/]|$)/, "/postgres$1") });
  await admin.connect();
  await admin.query("DROP DATABASE IF EXISTS gsbd_test WITH (FORCE)");
  await admin.query("CREATE DATABASE gsbd_test");
  await admin.end();

  await migrate();
  await seedAll();
  await query("INSERT INTO admin_users (email, password_hash, role) VALUES ($1,$2,'owner')", [
    OWNER.email, await hashPassword(OWNER.password),
  ]);
  server = createApp().listen();
  await new Promise((resolve) => setTimeout(resolve, 400));
});

after(async () => {
  await new Promise<void>((resolve) => {
    if (server) server.close(() => resolve());
    else resolve();
  });
  await closeDb();
});

describe("public shop API", () => {
  it("serves health with the live flag", async () => {
    const response = await call("/api/health");
    assert.equal(response.status, 200);
    assert.equal(response.json.ok, true);
    assert.equal(response.json.live, true);
  });

  it("serves the catalogue without secrets", async () => {
    const response = await call("/api/catalog");
    assert.equal(response.status, 200);
    const products = response.json.products as unknown[];
    const categories = response.json.categories as unknown[];
    assert.ok(products.length >= 25, `expected seeded products, got ${products.length}`);
    assert.ok(categories.length >= 6);
    assert.ok(!JSON.stringify(response.json).includes("secretKey"), "secrets must never leak");
    assert.ok(!JSON.stringify(response.json).includes("smsApiKey"), "secrets must never leak");
    catalog = {
      products: products as never,
      promos: (response.json.promos as never[]).slice() as never,
    };
  });

  it("searches and suggests upsells in the storefront shape", async () => {
    const search = await call("/api/products/search?q=18650");
    assert.equal(search.status, 200);
    assert.ok(((search.json.results ?? []) as unknown[]).length > 0);
    const short = await call("/api/products/search?q=x");
    assert.deepEqual(short.json.results, []);
    const upsell = await call("/api/products/upsell");
    assert.equal(upsell.status, 200);
    assert.ok(((upsell.json.products ?? []) as unknown[]).length > 0);
  });

  it("serves pages with live SEO meta, sitemap and robots", async () => {
    const slug = catalog.products[0].slug;
    const page = await call(`/product/${slug}`);
    assert.equal(page.status, 200);
    assert.match(page.text, /__GSBD_LIVE__/);
    assert.ok(page.text.includes(catalog.products[0].name));
    const shell = await call("/some-spa-route");
    assert.equal(shell.status, 200);
    assert.match(shell.text, /__GSBD_LIVE__/);
    const sitemap = await call("/sitemap.xml");
    assert.equal(sitemap.status, 200);
    assert.ok(sitemap.text.includes(`/product/${slug}`));
    const robots = await call("/robots.txt");
    assert.ok(robots.text.includes("Disallow: /admin"));
  });

  it("runs the OTP handshake and enforces verification", async () => {
    const send = await call("/api/otp/send", { method: "POST", body: { phone: "01811111111" } });
    assert.equal(send.status, 200);
    const code = send.json.debugCode as string;
    assert.match(code, /^\d{6}$/);
    const wrong = await call("/api/otp/verify", { method: "POST", body: { phone: "01811111111", code: "000000" } });
    assert.equal(wrong.status, 400);
    const right = await call("/api/otp/verify", { method: "POST", body: { phone: "01811111111", code } });
    assert.equal(right.status, 200);
    assert.equal(right.json.verified, true);
    assert.ok(typeof right.json.proof === "string");

    /* An order without the proof is rejected while OTP is required. */
    const blocked = await call("/api/orders", {
      method: "POST",
      body: {
        customerName: "Test User", phone: "01811111111", district: "Dhaka",
        address: "House 1, Road 1, Test Area, Dhaka", paymentMethod: "cod",
        items: [{ slug: catalog.products[0].slug, qty: 1 }],
      },
    });
    assert.equal(blocked.status, 403);
  });

  it("places an order with server-side totals and a claim token", async () => {
    const product = catalog.products.find((entry) => entry.stock > 5) ?? catalog.products[0];
    const send = await call("/api/otp/send", { method: "POST", body: { phone: "01822222222" } });
    const verify = await call("/api/otp/verify", { method: "POST", body: { phone: "01822222222", code: send.json.debugCode } });
    const proof = verify.json.proof as string;

    const before = await call(`/api/products/${product.slug}`);
    const stockBefore = ((before.json.product ?? {}) as { stock: number }).stock;

    const order = await call("/api/orders", {
      method: "POST",
      body: {
        customerName: "Order Tester", phone: "01822222222", district: "Dhaka",
        address: "House 2, Road 2, Test Area, Dhaka 1212", paymentMethod: "bkash",
        deliveryMethod: "standard", trxId: "9F7A2B1C4D", otpProof: proof,
        items: [{ slug: product.slug, qty: 2 }],
      },
    });
    assert.equal(order.status, 201);
    const expectedSubtotal = product.price * 2;
    const expectedShipping = expectedSubtotal >= 2500 ? 0 : 80;
    assert.equal(order.json.total, expectedSubtotal + expectedShipping);
    assert.ok(/^GSBD-\d+$/.test(String(order.json.orderNumber)));
    assert.ok(typeof order.json.claimToken === "string");

    const number = String(order.json.orderNumber);
    const claimed = await call(`/api/orders/${number}?token=${order.json.claimToken}`);
    assert.equal(claimed.status, 200);
    assert.equal((claimed.json.order as { total: number }).total, expectedSubtotal + expectedShipping);
    const tracked = await call(`/api/orders/track?number=${number}&phone=01822222222`);
    assert.equal(tracked.status, 200);
    const wrongPhone = await call(`/api/orders/track?number=${number}&phone=01999999999`);
    assert.equal(wrongPhone.status, 403);

    const after = await call(`/api/products/${product.slug}`);
    assert.equal(((after.json.product ?? {}) as { stock: number }).stock, stockBefore - 2);
  });

  it("applies promos once per phone and declines bad payments", async () => {
    const promo = catalog.promos.find((entry) => entry.code === "GLOW10");
    assert.ok(promo, "GLOW10 should be seeded");
    const product = catalog.products.find((entry) => entry.price * 2 >= promo.minSubtotal && entry.stock > 8) ?? catalog.products[0];
    const qty = Math.max(1, Math.ceil(promo.minSubtotal / product.price));
    assert.ok(product.stock >= qty + 1, "seed stock too low for the promo test");

    const proofFor = async (phone: string): Promise<string> => {
      const send = await call("/api/otp/send", { method: "POST", body: { phone } });
      const verify = await call("/api/otp/verify", { method: "POST", body: { phone, code: send.json.debugCode } });
      return verify.json.proof as string;
    };
    const proof = await proofFor("01833333333");
    const first = await call("/api/orders", {
      method: "POST",
      body: {
        customerName: "Promo Tester", phone: "01833333333", district: "Dhaka",
        address: "House 3, Road 3, Test Area, Dhaka", paymentMethod: "bkash",
        promoCode: "glow10", trxId: "PROMO01", otpProof: proof,
        items: [{ slug: product.slug, qty }],
      },
    });
    assert.equal(first.status, 201);
    assert.ok(Number(first.json.discount) > 0, "discount should apply");

    const proof2 = await proofFor("01833333333");
    const reuse = await call("/api/orders", {
      method: "POST",
      body: {
        customerName: "Promo Tester", phone: "01833333333", district: "Dhaka",
        address: "House 3, Road 3, Test Area, Dhaka", paymentMethod: "bkash",
        promoCode: "GLOW10", trxId: "PROMO02", otpProof: proof2,
        items: [{ slug: product.slug, qty: 1 }],
      },
    });
    assert.equal(reuse.status, 409);

    const declined = await call("/api/orders", {
      method: "POST",
      body: {
        customerName: "Declined Tester", phone: "01844444444", district: "Dhaka",
        address: "House 4, Road 4, Test Area, Dhaka", paymentMethod: "nagad",
        trxId: "ABCDEF00", otpProof: await proofFor("01844444444"),
        items: [{ slug: product.slug, qty: 1 }],
      },
    });
    assert.equal(declined.status, 400);
    assert.match(String(declined.json.error), /declined/);
  });

  it("validates orders and enforces the COD ceiling", async () => {
    const bad = await call("/api/orders", { method: "POST", body: { customerName: "X", phone: "123" } });
    assert.equal(bad.status, 400);
    const ghostSend = await call("/api/otp/send", { method: "POST", body: { phone: "01855555555" } });
    const ghostVerify = await call("/api/otp/verify", { method: "POST", body: { phone: "01855555555", code: ghostSend.json.debugCode } });
    const missing = await call("/api/orders", {
      method: "POST",
      body: {
        customerName: "Ghost Buyer", phone: "01855555555", district: "Dhaka",
        address: "House 5, Road 5, Test Area, Dhaka", paymentMethod: "cod", otpProof: ghostVerify.json.proof,
        items: [{ slug: "no-such-product", qty: 1 }],
      },
    });
    assert.equal(missing.status, 409);

    /* Build a cart above the ৳25,000 COD ceiling. */
    const rich = catalog.products.filter((entry) => entry.stock > 0).sort((a, b) => b.price - a.price)[0];
    const qty = Math.min(20, Math.floor(26000 / rich.price) + 1);
    const proof = await (async () => {
      const send = await call("/api/otp/send", { method: "POST", body: { phone: "01866666666" } });
      const verify = await call("/api/otp/verify", { method: "POST", body: { phone: "01866666666", code: send.json.debugCode } });
      return verify.json.proof as string;
    })();
    const over = await call("/api/orders", {
      method: "POST",
      body: {
        customerName: "Big Spender", phone: "01866666666", district: "Dhaka",
        address: "House 6, Road 6, Test Area, Dhaka", paymentMethod: "cod", otpProof: proof,
        items: [{ slug: rich.slug, qty }],
      },
    });
    assert.equal(over.status, 409);
    assert.match(String(over.json.error), /Cash on delivery is limited/);
  });

  it("posts reviews and recalculates ratings", async () => {
    const product = catalog.products[1];
    const before = await call(`/api/products/${product.slug}`);
    const listBefore = ((before.json.reviews ?? []) as unknown[]).length;
    const posted = await call("/api/reviews", {
      method: "POST",
      body: { productSlug: product.slug, author: "Reviewer", rating: 5, title: "Great", body: "Capacity tested and matched, as advertised." },
    });
    assert.equal(posted.status, 201);
    const after = await call(`/api/products/${product.slug}`);
    assert.equal(((after.json.reviews ?? []) as unknown[]).length, listBefore + 1);
    assert.equal(((after.json.product ?? {}) as { reviewCount: number }).reviewCount, listBefore + 1);
    assert.ok(((after.json.reviews ?? []) as unknown[]).some((entry) => (entry as { author: string }).author === "Reviewer"));
  });

  it("captures carts, newsletter signups and events", async () => {
    const cart = await call("/api/carts", {
      method: "POST",
      body: {
        phone: "01877777777", name: "Cart Abandoner",
        items: [{ slug: catalog.products[0].slug, name: catalog.products[0].name, qty: 1, price: catalog.products[0].price }],
      },
    });
    assert.equal(cart.status, 200);
    const news = await call("/api/newsletter", { method: "POST", body: { email: "bench@workshop.test" } });
    assert.equal(news.status, 201);
    const event = await call("/api/events", {
      method: "POST",
      body: { event_name: "Purchase", event_id: "test-purchase-1", custom_data: { value: 1200 } },
    });
    assert.equal(event.status, 200);
  });
});

describe("owner API", () => {
  it("gates the console behind login", async () => {
    const anon = await call("/api/admin/overview");
    assert.equal(anon.status, 401);
    const wrong = await call("/api/admin/login", { method: "POST", body: { email: OWNER.email, password: "wrong-password-1" } });
    assert.equal(wrong.status, 400);
    const login = await call("/api/admin/login", { method: "POST", body: OWNER });
    assert.equal(login.status, 200);
    const cookies = login.headers.getSetCookie();
    assert.ok(cookies.length > 0, "login must set a session cookie");
    ownerCookie = cookies[0].split(";")[0];
    const me = await call("/api/admin/me", { cookie: ownerCookie });
    assert.equal(me.status, 200);
    assert.equal(me.json.role, "owner");
  });

  it("reports the overview and the order book", async () => {
    const overview = await call("/api/admin/overview?days=14", { cookie: ownerCookie });
    assert.equal(overview.status, 200);
    assert.ok(Number((overview.json.current as { revenue: number }).revenue) > 0, "seeded orders should earn revenue");
    assert.ok(Array.isArray(overview.json.series));
    assert.ok(Array.isArray(overview.json.issues));
    const orders = await call("/api/admin/orders?status=all", { cookie: ownerCookie });
    assert.equal(orders.status, 200);
    assert.ok(Number(orders.json.total) >= 2);
  });

  it("advances orders, notes, books couriers and pays claims", async () => {
    const list = await call("/api/admin/orders?status=confirmed", { cookie: ownerCookie });
    const first = ((list.json.orders ?? []) as Array<{ orderNumber: string }>)[0];
    assert.ok(first, "expected a confirmed order");
    const number = first.orderNumber;

    const packed = await call(`/api/admin/orders/${number}`, {
      method: "PATCH", cookie: ownerCookie, body: { status: "packing", note: "Test advance" },
    });
    assert.equal(packed.status, 200);
    assert.equal((packed.json.order as { status: string }).status, "packing");

    const noted = await call(`/api/admin/orders/${number}`, {
      method: "PATCH", cookie: ownerCookie, body: { internalNote: "Called customer, confirmed address" },
    });
    assert.equal(noted.status, 200);
    assert.ok((((noted.json.order ?? {}) as { notes: unknown[] }).notes ?? []).length > 0);

    const booked = await call(`/api/admin/orders/${number}`, {
      method: "PATCH", cookie: ownerCookie, body: { bookCourier: true },
    });
    assert.equal(booked.status, 200);
    assert.match(String((booked.json.order as { courierConsignment: string }).courierConsignment), /^(PT|SF)\d+$/);

    const paid = await call(`/api/admin/orders/${number}`, {
      method: "PATCH", cookie: ownerCookie, body: { paymentStatus: "paid", trxId: "OWNER-CONFIRMED-1" },
    });
    assert.equal(paid.status, 200);
    assert.equal((paid.json.order as { paymentStatus: string }).paymentStatus, "paid");
  });

  it("edits products, uploads images and manages promos", async () => {
    const slug = catalog.products[2].slug;
    const patched = await call(`/api/admin/products/${slug}`, {
      method: "PATCH", cookie: ownerCookie, body: { stock: 77, featured: true },
    });
    assert.equal(patched.status, 200);
    assert.equal((patched.json.product as { stock: number }).stock, 77);

    /* A 1px PNG, magic bytes and all. */
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const upload = await call("/api/admin/uploads", {
      method: "POST", cookie: ownerCookie, body: { filename: "evil.svg", data: png },
    });
    assert.equal(upload.status, 201);
    const url = String(upload.json.url);
    assert.match(url, /^\/uploads\/\d{4}\/\d{2}\/.+\.png$/);
    const fetched = await call(url);
    assert.equal(fetched.status, 200);

    const svg = await call("/api/admin/uploads", {
      method: "POST", cookie: ownerCookie, body: { filename: "x.svg", data: Buffer.from("<svg></svg>").toString("base64") },
    });
    assert.equal(svg.status, 400);

    const created = await call("/api/admin/promos", {
      method: "POST", cookie: ownerCookie,
      body: { code: "TEST20", label: "Test 20", type: "flat", value: 20, minSubtotal: 100 },
    });
    assert.equal(created.status, 201);
    const removed = await call("/api/admin/promos/TEST20", { method: "DELETE", cookie: ownerCookie });
    assert.equal(removed.status, 200);
  });

  it("keeps settings owner-only and secrets server-side", async () => {
    const staff = await call("/api/admin/users", {
      method: "POST", cookie: ownerCookie,
      body: { email: "staff@shop.test", password: "staff-password-123", role: "staff" },
    });
    assert.equal(staff.status, 201);
    const staffLogin = await call("/api/admin/login", {
      method: "POST", body: { email: "staff@shop.test", password: "staff-password-123" },
    });
    const staffCookie = staffLogin.headers.getSetCookie()[0].split(";")[0];
    const staffSettings = await call("/api/admin/settings", { cookie: staffCookie });
    assert.equal(staffSettings.status, 403);
    const staffOrders = await call("/api/admin/orders", { cookie: staffCookie });
    assert.equal(staffOrders.status, 200);

    const patched = await call("/api/admin/settings", {
      method: "PATCH", cookie: ownerCookie, body: { shipping: { insideDhaka: 99 } },
    });
    assert.equal(patched.status, 200);
    const catalogCheck = await call("/api/catalog");
    assert.equal(((catalogCheck.json.settings ?? {}) as { shipping: { insideDhaka: number } }).shipping.insideDhaka, 99);
    await call("/api/admin/settings", { method: "PATCH", cookie: ownerCookie, body: { shipping: { insideDhaka: 80 } } });
  });

  it("blocks fraud numbers and exports data", async () => {
    await call("/api/admin/blocklist", { method: "POST", cookie: ownerCookie, body: { phone: "01888888888", reason: "test" } });
    const send = await call("/api/otp/send", { method: "POST", body: { phone: "01888888888" } });
    assert.equal(send.status, 200);
    const blocked = await call("/api/orders", {
      method: "POST",
      body: {
        customerName: "Blocked Buyer", phone: "01888888888", district: "Dhaka",
        address: "House 8, Road 8, Test Area, Dhaka", paymentMethod: "cod",
        otpProof: "bogus", items: [{ slug: catalog.products[0].slug, qty: 1 }],
      },
    });
    assert.equal(blocked.status, 403);

    const csv = await call("/api/admin/export/orders.csv?status=all", { cookie: ownerCookie });
    assert.equal(csv.status, 200);
    assert.ok(csv.text.includes("order_number") || csv.text.includes("GSBD-"));
    const manifest = await call("/api/admin/export/manifest.csv", { cookie: ownerCookie });
    assert.equal(manifest.status, 200);
    const catalogue = await call("/api/admin/export/catalogue.csv", { cookie: ownerCookie });
    assert.equal(catalogue.status, 200);
    assert.ok(catalogue.text.includes(catalog.products[0].slug));
  });

  it("rejects mutations without the fetch marker (CSRF)", async () => {
    const response = await fetch(`${BASE}/api/admin/outbox/flush`, {
      method: "POST",
      headers: { cookie: ownerCookie, "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(response.status, 403);
  });

  it("runs the maintenance cron with its secret", async () => {
    const anon = await fetch(`${BASE}/api/cron/tick`);
    assert.equal(anon.status, 403);
    const authed = await fetch(`${BASE}/api/cron/tick`, { headers: { authorization: "Bearer test-cron" } });
    assert.equal(authed.status, 200);
  });
});
