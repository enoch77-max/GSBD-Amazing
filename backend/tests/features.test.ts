/** Feature and security tests against real PostgreSQL (gsbd_features only). */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { Client } from "pg";
import type { Server } from "node:http";
import { createApp } from "../app";
import { migrate, closeDb, query, queryOne } from "../db";
import { seedAll } from "../seed";
import { calculatePack } from "../../src/lib/pack-builder";
import { hashPassword } from "../auth";

const BASE = "http://127.0.0.1:3211";
let server: Server | null = null;

type Reply = { status: number; json: Record<string, any>; headers: Headers };
async function call(path: string, options: { method?: string; body?: unknown; cookie?: string } = {}): Promise<Reply> {
  const method = options.method ?? "GET";
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(method !== "GET" ? { "x-requested-with": "fetch", "content-type": "application/json" } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  let json: Record<string, any> = {};
  try {
    json = (await response.json()) as Record<string, any>;
  } catch {
    json = {};
  }
  return { status: response.status, json, headers: response.headers };
}

async function otpProof(phone: string): Promise<string> {
  const sent = await call("/api/otp/send", { method: "POST", body: { phone } });
  assert.equal(sent.status, 200);
  const verified = await call("/api/otp/verify", { method: "POST", body: { phone, code: sent.json.debugCode } });
  assert.equal(verified.status, 200);
  return verified.json.proof as string;
}

async function catalogue(): Promise<Array<{ slug: string; name: string; price: number; stock: number; images: string[]; categorySlug: string }>> {
  const response = await call("/api/catalog");
  return (response.json.products as Array<Record<string, unknown>>).map((row) => ({
    slug: row.slug as string,
    name: row.name as string,
    price: row.price as number,
    stock: row.stock as number,
    images: (Array.isArray(row.images) ? row.images : []) as string[],
    categorySlug: (row.categorySlug as string | undefined) ?? (row.category_slug as string | undefined) ?? "",
  }));
}

before(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(url.pathname.slice(1), "gsbd_features", "feature tests must use a scratch database");
  mkdirSync("/tmp/gsbd-feature-fe", { recursive: true });
  writeFileSync("/tmp/gsbd-feature-fe/index.html", "<html><head><title>Feature test</title></head><body></body></html>");
  const admin = new Client({ connectionString: (process.env.DATABASE_URL ?? "").replace(/\/gsbd_features([?/]|$)/, "/postgres$1") });
  await admin.connect();
  await admin.query("DROP DATABASE IF EXISTS gsbd_features WITH (FORCE)");
  await admin.query("CREATE DATABASE gsbd_features");
  await admin.end();
  await migrate();
  await seedAll();
  await query("INSERT INTO admin_users (email, password_hash, role) VALUES ($1,$2,'owner')", ["owner@example.test", await hashPassword("test-password-123")]);
  server = createApp().listen();
  await new Promise((resolve) => setTimeout(resolve, 350));
});

after(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  await closeDb();
});

describe("pack builder and social proof", () => {
  it("calculates real pack physics and rejects impossible packs", () => {
    const pack = calculatePack({ cellId: "18650", series: 4, parallel: 2 });
    assert.equal(pack.cellCount, 8);
    assert.equal(pack.nominalVoltage, 14.4);
    assert.equal(pack.capacityAh, 6);
    assert.equal(pack.energyWh, 86.4);
    assert.equal(pack.chargeVoltage, 16.8);
    assert.ok(pack.price > 4000);
    assert.throws(() => calculatePack({ cellId: "18650", series: 25, parallel: 2 }), /Series/);
    assert.throws(() => calculatePack({ cellId: "18650", series: 24, parallel: 12 }), /at most/);
  });

  it("uses actual BMS series and chemistry limits instead of guessing", async () => {
    const products = await catalogue();
    const router = calculatePack({ cellId: "18650", series: 3, parallel: 2, loadCurrentA: 10 }, { products });
    assert.equal(router.bms.name, "3S 12V 20A BMS with Balance");
    assert.equal(router.bms.ratedCurrentA, 20);
    const unsupported = calculatePack({ cellId: "18650", series: 1, parallel: 2, loadCurrentA: 10 }, { products });
    assert.equal(unsupported.available, false);
    assert.equal(unsupported.bms.ratedCurrentA, null);
    assert.match(unsupported.availabilityNote ?? "", /compatible 1S BMS/i);
    const aboveCellLimit = calculatePack({ cellId: "18650", series: 4, parallel: 1, loadCurrentA: 40 }, { products });
    assert.equal(aboveCellLimit.available, false);
    assert.match(aboveCellLimit.availabilityNote ?? "", /exceeds/i);
  });

  it("validates extras and gives different selections different identities", async () => {
    const products = await catalogue();
    const base = { cellId: "18650", series: 4, parallel: 2, loadCurrentA: 10 };
    const plain = calculatePack(base, { products });
    const withBag = calculatePack({ ...base, extras: ["lipo-safe-fireproof-bag"] }, { products });
    assert.notEqual(plain.slug, withBag.slug);
    const bag = products.find((product) => product.slug === "lipo-safe-fireproof-bag");
    assert.ok(bag);
    assert.equal(withBag.price, plain.price + bag.price);
    assert.equal(withBag.price, withBag.components.reduce((sum, component) => sum + component.total, 0));
    assert.throws(() => calculatePack({ ...base, extras: ["not-a-product"] }, { products }), /unknown pack add-on/i);
    assert.throws(() => calculatePack({ ...base, extras: ["tp4056-type-c-charger-module"] }, { products }), /not compatible/i);
    assert.throws(() => calculatePack({ ...base, extras: ["lipo-safe-fireproof-bag", "lipo-safe-fireproof-bag"] }, { products }), /twice/i);
  });

  it("prices packs from the live catalogue, ignoring a supplied price", async () => {
    const config = { cellId: "21700", series: 10, parallel: 3 };
    const products = await catalogue();
    const expected = calculatePack(config, { products });
    const response = await call("/api/packs/price", {
      method: "POST",
      body: { configuration: config, price: 1, name: "Forged pack" },
    });
    assert.equal(response.status, 200);
    const pack = response.json.pack as { price: number; name: string; components: Array<{ slug: string | null }> };
    assert.equal(pack.price, expected.price);
    assert.equal(pack.name, expected.name);
    assert.equal(response.json.pricedBy, "server");
    const slugs = pack.components.map((component) => component.slug);
    assert.ok(slugs.includes("molicel-p42a-21700"), "the cell SKU must be part of the build");
    assert.ok(slugs.some((slug) => slug?.includes("bms")), "a BMS must be part of the build");
    assert.ok(slugs.includes("pure-nickel-strip-015-8mm"), "nickel must be part of the build");
  });

  it("places a custom pack at the server price, reserving its real components", async () => {
    const config = { cellId: "18650", series: 4, parallel: 2 };
    const products = await catalogue();
    const pack = calculatePack(config, { products });
    const stockOf = async (slug: string) => (await queryOne<{ stock: number }>("SELECT stock FROM products WHERE slug = $1", [slug]))?.stock ?? 0;
    const cellsBefore = await stockOf("samsung-inr18650-30q");
    const bmsBefore = await stockOf("daly-smart-bms-4s-40a");
    const nickelBefore = await stockOf("pure-nickel-strip-015-8mm");

    const phone = "01871000001";
    const proof = await otpProof(phone);
    const response = await call("/api/orders", {
      method: "POST",
      body: {
        customerName: "Pack Security Test",
        phone,
        district: "Dhaka",
        address: "House 10, Road 10, Test District, Dhaka",
        paymentMethod: "cod",
        deliveryMethod: "standard",
        otpProof: proof,
        items: [{ slug: pack.slug, qty: 1, price: 1, unitPrice: 1, customPack: config }],
      },
    });
    assert.equal(response.status, 201);
    assert.equal(response.json.total, pack.price + (pack.price >= 2500 ? 0 : 80));
    assert.equal(response.json.items[0].item_price, pack.price);

    assert.equal(await stockOf("samsung-inr18650-30q"), cellsBefore - 8, "cells must be reserved");
    assert.equal(await stockOf("daly-smart-bms-4s-40a"), bmsBefore - 1, "the matched BMS must be reserved");
    assert.equal(await stockOf("pure-nickel-strip-015-8mm"), nickelBefore - 1, "nickel must be reserved");

    const receipt = await call(`/api/orders/${response.json.orderNumber}?token=${encodeURIComponent(response.json.claimToken)}`);
    assert.equal(receipt.status, 200);
    assert.equal(receipt.json.items[0].unitPrice, pack.price);
    const spec = receipt.json.items[0].packSpec as { components?: Array<{ slug: string; qty: number }> };
    assert.ok(spec.components?.some((component) => component.slug === "samsung-inr18650-30q" && component.qty === 8),
      "the stored specification must list the reserved cells");
  });

  it("rejects stale pack quotes without reserving components", async () => {
    const products = await catalogue();
    const pack = calculatePack({ cellId: "18650", series: 3, parallel: 2 }, { products });
    const cell = await queryOne<{ stock: number }>("SELECT stock FROM products WHERE slug = $1", ["samsung-inr18650-30q"]);
    const phone = "01871000003";
    const proof = await otpProof(phone);
    const response = await call("/api/orders", {
      method: "POST",
      body: {
        customerName: "Stale Quote Test", phone, district: "Dhaka", address: "House 12, Road 12, Test District, Dhaka",
        paymentMethod: "cod", otpProof: proof,
        items: [{ slug: pack.slug, qty: 1, expectedUnitPrice: 1, customPack: pack.config }],
      },
    });
    assert.equal(response.status, 409);
    assert.match(String(response.json.error), /price.*changed/i);
    const after = await queryOne<{ stock: number }>("SELECT stock FROM products WHERE slug = $1", ["samsung-inr18650-30q"]);
    assert.equal(after?.stock, cell?.stock);
  });

  it("does not oversell a shared BMS across different pack lines", async () => {
    await query("UPDATE products SET stock = 1 WHERE slug = $1", ["daly-smart-bms-4s-40a"]);
    const products = await catalogue();
    const first = calculatePack({ cellId: "18650", series: 4, parallel: 2, loadCurrentA: 10 }, { products });
    const second = calculatePack({ cellId: "18650", series: 4, parallel: 2, loadCurrentA: 15 }, { products });
    assert.equal(first.available, true);
    assert.equal(second.available, true);
    const cellsBefore = await queryOne<{ stock: number }>("SELECT stock FROM products WHERE slug = $1", ["samsung-inr18650-30q"]);
    const phone = "01871000004";
    const proof = await otpProof(phone);
    const response = await call("/api/orders", {
      method: "POST",
      body: {
        customerName: "Shared Stock Test", phone, district: "Dhaka", address: "House 13, Road 13, Test District, Dhaka",
        paymentMethod: "cod", otpProof: proof,
        items: [first, second].map((pack) => ({ slug: pack.slug, qty: 1, expectedUnitPrice: pack.price, customPack: pack.config })),
      },
    });
    assert.equal(response.status, 409);
    const cellsAfter = await queryOne<{ stock: number }>("SELECT stock FROM products WHERE slug = $1", ["samsung-inr18650-30q"]);
    assert.equal(cellsAfter?.stock, cellsBefore?.stock, "transaction must roll back every reservation");
    await query("UPDATE products SET stock = 62 WHERE slug = $1", ["daly-smart-bms-4s-40a"]);
  });

  it("restores selected components exactly once when a pack is cancelled", async () => {
    const products = await catalogue();
    const pack = calculatePack({ cellId: "18650", series: 3, parallel: 2, extras: ["lipo-safe-fireproof-bag"] }, { products });
    const stockOf = async (slug: string) => (await queryOne<{ stock: number }>("SELECT stock FROM products WHERE slug = $1", [slug]))?.stock ?? 0;
    const slugs = ["samsung-inr18650-30q", "3s-20a-bms-balance", "pure-nickel-strip-015-8mm", "lipo-safe-fireproof-bag"];
    const before = await Promise.all(slugs.map(stockOf));
    const phone = "01871000005";
    const proof = await otpProof(phone);
    const placed = await call("/api/orders", {
      method: "POST",
      body: {
        customerName: "Cancellation Test", phone, district: "Dhaka", address: "House 14, Road 14, Test District, Dhaka",
        paymentMethod: "cod", otpProof: proof,
        items: [{ slug: pack.slug, qty: 1, expectedUnitPrice: pack.price, customPack: pack.config }],
      },
    });
    assert.equal(placed.status, 201);
    const reserved = await Promise.all(slugs.map(stockOf));
    assert.deepEqual(reserved, before.map((count, index) => count - (index === 0 ? 6 : 1)));
    const login = await call("/api/admin/login", { method: "POST", body: { email: "owner@example.test", password: "test-password-123" } });
    assert.equal(login.status, 200);
    const cookie = login.headers.getSetCookie()[0].split(";")[0];
    const cancel = () => call(`/api/admin/orders/${placed.json.orderNumber}`, { method: "PATCH", cookie, body: { status: "cancelled" } });
    const replies = await Promise.all([cancel(), cancel()]);
    assert.ok(replies.every((response) => response.status === 200));
    assert.deepEqual(await Promise.all(slugs.map(stockOf)), before, "a repeated cancellation must not restock twice");
  });

  it("rejects a pack slug/configuration mismatch and invalid cell counts", async () => {
    const config = { cellId: "18650", series: 3, parallel: 2 };
    const products = await catalogue();
    const pack = calculatePack(config, { products });
    const phone = "01871000002";
    const proof = await otpProof(phone);
    const common = {
      customerName: "Mismatch Tester",
      phone,
      district: "Dhaka",
      address: "House 11, Road 11, Test District, Dhaka",
      paymentMethod: "cod",
      otpProof: proof,
    };
    const mismatch = await call("/api/orders", {
      method: "POST",
      body: { ...common, items: [{ slug: "custom-pack-18650-24s12p", qty: 1, customPack: config }] },
    });
    assert.equal(mismatch.status, 400);
    const invalid = await call("/api/orders", {
      method: "POST",
      body: { ...common, items: [{ slug: pack.slug, qty: 1, customPack: { ...config, series: 99 } }] },
    });
    assert.equal(invalid.status, 400);
  });

  it("counts each browser vote once", async () => {
    const review = await queryOne<{ id: number }>("SELECT id FROM reviews ORDER BY id LIMIT 1");
    assert.ok(review);
    const first = await call(`/api/reviews/${review.id}/helpful`, { method: "POST", body: { voterKey: "test-browser-identifier-0001" } });
    assert.equal(first.status, 200);
    assert.equal(first.json.helpfulCount, 1);
    const repeat = await call(`/api/reviews/${review.id}/helpful`, { method: "POST", body: { voterKey: "test-browser-identifier-0001" } });
    assert.equal(repeat.json.helpfulCount, 1);
    const second = await call(`/api/reviews/${review.id}/helpful`, { method: "POST", body: { voterKey: "test-browser-identifier-0002" } });
    assert.equal(second.json.helpfulCount, 2);
    const malformed = await call(`/api/reviews/${review.id}/helpful`, { method: "POST", body: { voterKey: "short" } });
    assert.equal(malformed.status, 400);
  });

  it("serves only privacy-limited order activity", async () => {
    const response = await call("/api/activity");
    assert.equal(response.status, 200);
    assert.ok(response.json.entries.length >= 1);
    const serialised = JSON.stringify(response.json);
    assert.ok(!serialised.includes("01871000001"));
    assert.ok(!serialised.includes("House 10"));
    assert.ok(!serialised.includes("Pack Security Test"));
    assert.ok(serialised.includes("Custom 4S2P"));
  });

  it("sends browser hardening headers", async () => {
    const response = await call("/api/health");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.match(response.headers.get("content-security-policy") ?? "", /object-src 'none'/);
    assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  });
});
