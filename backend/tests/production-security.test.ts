/**
 * Production-mode guard test. Runs its own server with NODE_ENV=production and
 * proves sandbox gateways cannot create paid live orders.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { Client } from "pg";
import type { Server } from "node:http";
import { createApp } from "../app";
import { migrate, closeDb, query } from "../db";
import { seedAll } from "../seed";

const BASE = "http://127.0.0.1:3212";
let server: Server | null = null;

before(async () => {
  assert.equal(process.env.NODE_ENV, "production", "run this suite with NODE_ENV=production");
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(url.pathname.slice(1), "gsbd_prod_test", "production tests must use a scratch database");
  mkdirSync("/tmp/gsbd-prod-fe", { recursive: true });
  writeFileSync("/tmp/gsbd-prod-fe/index.html", "<html><head><title>Production test</title></head><body></body></html>");
  const admin = new Client({ connectionString: (process.env.DATABASE_URL ?? "").replace(/\/gsbd_prod_test([?/]|$)/, "/postgres$1") });
  await admin.connect();
  await admin.query("DROP DATABASE IF EXISTS gsbd_prod_test WITH (FORCE)");
  await admin.query("CREATE DATABASE gsbd_prod_test");
  await admin.end();
  await migrate();
  await seedAll();
  /* Isolate this test from OTP delivery while preserving production mode. */
  await query("UPDATE settings SET data = jsonb_set(data, '{risk,requirePhoneOtp}', 'false'::jsonb) WHERE id = 1");
  server = createApp().listen();
  await new Promise((resolve) => setTimeout(resolve, 350));
});

after(async () => {
  await new Promise<void>((resolve) => server ? server.close(() => resolve()) : resolve());
  await closeDb();
});

async function order(paymentMethod: string) {
  return fetch(`${BASE}/api/orders`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-requested-with": "fetch" },
    body: JSON.stringify({
      customerName: "Production Guard",
      phone: "01872000001",
      district: "Dhaka",
      address: "House 20, Road 20, Production Test, Dhaka",
      paymentMethod,
      deliveryMethod: "standard",
      trxId: "PROD12345",
      items: [{ slug: "tp4056-type-c-charger-module", qty: 1 }],
    }),
  });
}

describe("production payment safety", () => {
  it("refuses sandbox mobile-wallet orders in production", async () => {
    const response = await order("bkash");
    assert.equal(response.status, 409);
    const body = (await response.json()) as { error?: string };
    assert.match(body.error ?? "", /sandbox mode/i);
  });

  it("still allows cash on delivery in production", async () => {
    const response = await order("cod");
    assert.equal(response.status, 201);
    const body = (await response.json()) as { payment?: { provider?: string; status?: string } };
    assert.equal(body.payment?.provider, "cod");
    assert.equal(body.payment?.status, "cod");
  });

  it("never reveals an OTP code in production responses", async () => {
    const response = await fetch(`${BASE}/api/otp/send`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-requested-with": "fetch" },
      body: JSON.stringify({ phone: "01872000002" }),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { debugCode?: string };
    assert.equal(body.debugCode, undefined);
  });
});
