/**
 * Public storefront API. Every money decision — prices, totals, promos, stock —
 * is recomputed here from the database; the browser is never trusted.
 */
import type { PoolClient } from "pg";
import { App, RateLimited, badRequest, conflict, forbidden, notFound, rateLimit, redirect, sendJson, sendText, type Ctx } from "./http";
import { camel, isUniqueViolation, query, queryOne, tx } from "./db";
import { getSettings, publicSettings } from "./settings";
import { gatewayReady } from "../src/lib/settings";
import { promoDiscount, type Promo } from "../src/lib/commerce";
import { normalizePhone, isValidBDPhone } from "../src/lib/phone";
import { claimToken, verifyClaimToken, requestOtp, verifyOtp, verifyOtpProof } from "./auth";
import {
  cartRecoveryMessage, confirmationMessage, deliverSoon, expirePendingOrders, flushOutbox,
  formatTaka, otpMessage, queueEmail, queueSms, sendDueCartReminders,
} from "./notify";
import {
  bkashCreatePayment, bkashExecutePayment, sendCapiEvent, sslInitTransaction, sslVerifySignature,
} from "./providers";
import { config } from "./config";
import { calculatePack, PACK_PRODUCT_SLUG, type CellId, type PackResult } from "../src/lib/pack-builder";
import { reservePackComponents, restorePackComponents } from "./inventory";
import { randomBytes, randomInt } from "node:crypto";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function bodyOf(ctx: Ctx): Record<string, unknown> {
  if (!ctx.body || typeof ctx.body !== "object" || Array.isArray(ctx.body)) throw badRequest("Invalid request body.");
  return ctx.body as Record<string, unknown>;
}

function cleanText(value: unknown, field: string, max: number, required = true): string {
  const text = String(value ?? "").trim();
  if (!text && required) throw badRequest(`${field} is required.`);
  if (text.length > max) throw badRequest(`${field} is too long.`);
  return text;
}

function cleanInt(value: unknown, field: string, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw badRequest(`${field} is invalid.`);
  return number;
}

const FALLBACK_IMAGE = "/images/col-cells.jpg";

type ProductRow = {
  id: number; slug: string; name: string; brand: string; category_slug: string;
  short_description: string; description: string; price: number; compare_at_price: number | null;
  stock: number; rating: number; review_count: number; badge: string | null;
  highlights: unknown; specs: unknown; images: unknown; featured: boolean; visible: boolean;
  warranty_months: number; sku: string; created_at: Date;
  /** Only present for made-to-order packs; ordinary products come from the DB. */
  pack_spec?: unknown;
};

/** A validated, server-priced custom pack shaped like a catalogue row. */
function customPackRow(result: PackResult): ProductRow {
  return {
    id: 0,
    slug: result.slug,
    name: result.name,
    brand: "Glowing Space Lab",
    category_slug: "battery-packs",
    short_description: result.summary,
    description: result.summary,
    price: result.price,
    compare_at_price: null,
    stock: 99,
    rating: 0,
    review_count: 0,
    badge: "Built to order",
    highlights: [],
    specs: [],
    images: [result.cell.image],
    featured: false,
    visible: true,
    warranty_months: 12,
    sku: result.slug.toUpperCase(),
    created_at: new Date(),
    pack_spec: {
      cellId: result.config.cellId,
      series: result.config.series,
      parallel: result.config.parallel,
      loadCurrentA: result.config.loadCurrentA,
      extras: result.config.extras,
      // Immutable order snapshot: the dashboard and invoice must show what was purchased.
      components: result.components,
    },
  };
}

function toProduct(row: ProductRow) {
  const base = camel<Record<string, unknown>>(row as unknown as Record<string, never>);
  return {
    ...base,
    highlights: Array.isArray(row.highlights) ? row.highlights : [],
    specs: Array.isArray(row.specs) ? row.specs : [],
    images: Array.isArray(row.images) ? row.images : [],
  };
}

type DbPromo = {
  code: string; label: string; type: string; value: number; min_subtotal: number;
  max_discount: number | null; active: boolean; starts_at: Date | null; ends_at: Date | null; per_phone_limit: number;
};

function promoShape(row: DbPromo): Promo {
  return {
    code: row.code, label: row.label, type: row.type as Promo["type"], value: row.value,
    minSubtotal: row.min_subtotal, maxDiscount: row.max_discount ?? undefined,
  };
}

async function nextOrderNumber(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = `GSBD-${randomInt(10000, 99999)}`;
    const exists = await queryOne("SELECT 1 AS x FROM orders WHERE order_number = $1", [candidate]);
    if (!exists) return candidate;
  }
  return `GSBD-${randomInt(100000, 999999)}`;
}

function paymentReference(orderNumber: string, provider: string): string {
  return `${orderNumber}-${provider.toUpperCase()}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function shippingFor(settings: Awaited<ReturnType<typeof getSettings>>, method: string, district: string, subtotal: number): number {
  const rates = settings.shipping;
  if (method === "standard" && subtotal >= rates.freeThreshold) return 0;
  const inside = district === "Dhaka";
  return method === "express" ? (inside ? rates.expressInside : rates.expressOutside) : inside ? rates.insideDhaka : rates.outsideDhaka;
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

export function mountShop(app: App): void {
  app.get("/api/health", (ctx: Ctx) => {
    sendJson(ctx, { ok: true, live: true, build: config.buildId, time: new Date().toISOString() });
  });

  /* One bootstrap call: the storefront syncs its entire catalogue from this. */
  app.get("/api/catalog", async (ctx: Ctx) => {
    const settings = await getSettings();
    const [categories, products, promos] = await Promise.all([
      query("SELECT * FROM categories ORDER BY sort_order ASC, id ASC"),
      query<ProductRow>("SELECT * FROM products WHERE visible = TRUE ORDER BY category_slug, name"),
      query<DbPromo>("SELECT * FROM promos WHERE active = TRUE AND (starts_at IS NULL OR starts_at <= NOW()) AND (ends_at IS NULL OR ends_at >= NOW())"),
    ]);
    sendJson(ctx, {
      categories: categories.map((row) => camel(row)),
      products: products.map(toProduct),
      promos: promos.map(promoShape),
      settings: publicSettings(settings),
      currency: "BDT",
    });
  });

  app.get("/api/products/search", async (ctx: Ctx) => {
    const q = (ctx.query.get("q") ?? "").trim();
    if (q.length < 2) return sendJson(ctx, { results: [] });
    const term = `%${q.replace(/[%_]/g, "")}%`;
    const rows = await query<ProductRow>(
      `SELECT * FROM products WHERE visible = TRUE AND
       (name ILIKE $1 OR brand ILIKE $1 OR short_description ILIKE $1 OR category_slug ILIKE $1)
       ORDER BY featured DESC, rating DESC LIMIT 6`,
      [term],
    );
    sendJson(ctx, {
      results: rows.map((row) => ({
        slug: row.slug, name: row.name, brand: row.brand, price: row.price,
        image: (Array.isArray(row.images) ? row.images[0] : null) ?? FALLBACK_IMAGE,
        rating: row.rating, stock: row.stock, categorySlug: row.category_slug,
      })),
    });
  });

  app.get("/api/products/upsell", async (ctx: Ctx) => {
    const rows = await query<ProductRow>(
      `SELECT * FROM products WHERE visible = TRUE AND stock > 0
       AND category_slug IN ('bms-circuits','tools-safety','diy-prototyping') AND price < 1500
       ORDER BY price ASC LIMIT 3`,
    );
    sendJson(ctx, {
      products: rows.map((row) => ({
        id: row.id, slug: row.slug, name: row.name, brand: row.brand, price: row.price,
        image: (Array.isArray(row.images) ? row.images[0] : null) ?? FALLBACK_IMAGE,
        stock: row.stock,
      })),
    });
  });

  app.get("/api/products/:slug", async (ctx: Ctx) => {
    const product = await queryOne<ProductRow>("SELECT * FROM products WHERE slug = $1 AND visible = TRUE", [ctx.params.slug]);
    if (!product) throw notFound("That product is no longer available.");
    const [reviews, related] = await Promise.all([
      query("SELECT * FROM reviews WHERE product_slug = $1 AND visible = TRUE ORDER BY created_at DESC", [product.slug]),
      query<ProductRow>(
        "SELECT * FROM products WHERE category_slug = $1 AND slug <> $2 AND visible = TRUE ORDER BY rating DESC LIMIT 4",
        [product.category_slug, product.slug],
      ),
    ]);
    sendJson(ctx, {
      product: toProduct(product),
      reviews: reviews.map((row) => camel(row)),
      related: related.map(toProduct),
    });
  });

  app.post("/api/reviews", rateLimit({ limit: 5, windowMs: 60 * 60_000, key: (ctx: Ctx) => `review:${ctx.ip}` }), async (ctx: Ctx) => {
    const body = bodyOf(ctx);
    const productSlug = cleanText(body.productSlug, "Product", 120);
    const author = cleanText(body.author, "Name", 60);
    const title = cleanText(body.title, "Title", 90);
    const text = cleanText(body.body, "Review", 900);
    const location = String(body.location ?? "").trim().slice(0, 60) || "Dhaka";
    const rating = cleanInt(body.rating, "Rating", 1, 5);
    if (author.length < 2 || text.length < 12) throw badRequest("Add your name and at least a sentence about the product.");

    const product = await queryOne("SELECT slug FROM products WHERE slug = $1 AND visible = TRUE", [productSlug]);
    if (!product) throw notFound("That product no longer exists.");

    const review = await tx(async (client) => {
      const inserted = await client.query(
        "INSERT INTO reviews (product_slug, author, location, rating, title, body, verified) VALUES ($1,$2,$3,$4,$5,$6,FALSE) RETURNING *",
        [productSlug, author, location, rating, title, text],
      );
      await client.query(
        `UPDATE products SET rating = COALESCE((SELECT AVG(rating) FROM reviews WHERE product_slug = $1 AND visible = TRUE), 0),
         review_count = (SELECT COUNT(*) FROM reviews WHERE product_slug = $1 AND visible = TRUE) WHERE slug = $1`,
        [productSlug],
      );
      return inserted.rows[0];
    });
    sendJson(ctx, { ok: true, review: camel(review) }, 201);
  });

  /* ---------------- OTP ---------------- */

  app.post("/api/otp/send",
    rateLimit({ limit: 10, windowMs: 60 * 60_000, key: (ctx: Ctx) => `otp-ip:${ctx.ip}` }),
    rateLimit({
      limit: 5, windowMs: 60 * 60_000,
      key: (ctx: Ctx) => `otp-phone:${String((ctx.body as Record<string, unknown> | undefined)?.phone ?? "none")}`,
    }),
    async (ctx: Ctx) => {
      const body = bodyOf(ctx);
      const phone = normalizePhone(body.phone);
      if (!isValidBDPhone(phone)) throw badRequest("Enter a valid 11-digit Bangladeshi mobile number.");
      const settings = await getSettings();

      /* Blocked numbers get a silent success — no code, no SMS cost, no signal. */
      const blocked = await queryOne("SELECT phone FROM blocklist WHERE phone = $1", [phone]);
      if (blocked) return sendJson(ctx, { ok: true });

      const requested = requestOtp(phone);
      if (!requested.ok) throw new RateLimited(requested.reason, requested.retryAfter);

      const message = otpMessage(requested.code, settings.identity.name);
      if (settings.notifications.smsProvider === "none") {
        await queueSms({ to: phone, template: "checkout_otp", subject: "Verify your number", body: message });
      } else {
        const { sendSms } = await import("./providers.js");
        const result = await sendSms(settings, phone, message);
        await query(
          "INSERT INTO notifications (channel, recipient, template, subject, body, status, provider_message_id, error, sent_at) VALUES ('sms',$1,'checkout_otp','Verify your number',$2,$3,$4,$5, CASE WHEN $3='sent' THEN NOW() ELSE NULL END)",
          [phone, message, result.ok ? "sent" : "failed", result.id ?? null, result.error ?? null],
        );
        if (!result.ok) throw new RateLimited("We could not send the code. Please try again in a minute.", 60);
      }
      sendJson(ctx, { ok: true, ...(config.otpDebug ? { debugCode: requested.code } : {}) });
    });

  app.post("/api/otp/verify", async (ctx: Ctx) => {
    const body = bodyOf(ctx);
    const phone = normalizePhone(body.phone);
    if (!isValidBDPhone(phone)) throw badRequest("Enter a valid 11-digit Bangladeshi mobile number.");
    const result = verifyOtp(phone, String(body.code ?? ""));
    if (!result.ok) throw badRequest(result.reason);
    sendJson(ctx, { verified: true, proof: result.proof });
  });

  /* ---------------- Orders ---------------- */

  app.post("/api/orders",
    /* Generous per-IP ceiling (customers share IPs behind NAT); the per-phone daily cap is the real abuse control. */
    rateLimit({ limit: 30, windowMs: 10 * 60_000, key: (ctx: Ctx) => `order-ip:${ctx.ip}` }),
    async (ctx: Ctx) => {
      const body = bodyOf(ctx);
      const settings = await getSettings();

      const customerName = cleanText(body.customerName, "Name", 80);
      if (customerName.length < 3) throw badRequest("Please tell us your full name.");
      const phone = normalizePhone(body.phone);
      if (!isValidBDPhone(phone)) throw badRequest("Enter a valid 11-digit Bangladeshi mobile number.");
      const district = cleanText(body.district, "District", 40);
      const address = cleanText(body.address, "Address", 400);
      if (address.length < 10) throw badRequest("Add a district and a full delivery address.");
      const email = String(body.email ?? "").trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest("That email does not look right.");
      const notes = String(body.notes ?? "").trim().slice(0, 500) || null;

      const rawItems = Array.isArray(body.items) ? body.items : [];
      if (rawItems.length === 0 || rawItems.length > 20) throw badRequest("Your bag is empty.");
      const requested: Array<{ slug: string; qty: number; customPack?: unknown; expectedUnitPrice?: number }> = rawItems.map((item) => {
        const entry = item as Record<string, unknown>;
        if (typeof entry.slug !== "string" || !entry.slug) throw badRequest("One of the items in your bag is invalid.");
        const qty = Math.max(1, Math.min(20, Math.floor(Number(entry.qty) || 1)));
        const expectedUnitPrice = entry.expectedUnitPrice === undefined ? undefined : Number(entry.expectedUnitPrice);
        if (expectedUnitPrice !== undefined && (!Number.isInteger(expectedUnitPrice) || expectedUnitPrice < 0)) throw badRequest("Invalid quoted price.");
        return { slug: entry.slug.slice(0, 120), qty, customPack: entry.customPack, expectedUnitPrice };
      });

      const method = String(body.paymentMethod ?? "cod");
      if (!["bkash", "nagad", "cod", "card"].includes(method)) throw badRequest("Unknown payment method.");
      const delivery = String(body.deliveryMethod ?? "standard");
      if (!["standard", "express"].includes(delivery)) throw badRequest("Unknown delivery method.");
      if (delivery === "express" && district !== "Dhaka") throw badRequest("Express same-day is only available inside Dhaka.");

      const blocked = await queryOne("SELECT phone FROM blocklist WHERE phone = $1", [phone]);
      if (blocked) {
        throw forbidden(`This number is blocked from ordering online. Please call us on ${settings.identity.phone}.`);
      }

      const recent = await queryOne<{ count: string }>(
        "SELECT count(*)::text AS count FROM orders WHERE phone = $1 AND created_at > NOW() - interval '24 hours'",
        [phone],
      );
      if (Number(recent?.count ?? 0) >= settings.risk.maxOrdersPerPhonePerDay) {
        throw new RateLimited(
          `This number has placed several orders today. Please call us on ${settings.identity.phone} to continue.`,
          3600,
        );
      }

      if (settings.risk.requirePhoneOtp && !verifyOtpProof(String(body.otpProof ?? ""), phone)) {
        throw forbidden("Please verify your mobile number before placing the order.");
      }

      /* Load live rows and price everything server-side, including custom packs. */
      const stockSlugs = [...new Set(requested.filter((item) => !item.customPack).map((item) => item.slug))];
      const rows = stockSlugs.length
        ? await query<ProductRow>("SELECT * FROM products WHERE slug = ANY($1)", [stockSlugs])
        : [];
      const lookup = new Map(rows.map((row) => [row.slug, row]));
      type PackLine = { product: ProductRow; qty: number; packComponents?: Array<{ slug: string | null; qty: number; name: string; unitPrice: number }> };
      const catalogue = (await query<ProductRow>("SELECT * FROM products WHERE visible = TRUE")).map((row) => ({
        slug: row.slug,
        name: row.name,
        price: row.price,
        stock: row.stock,
        images: Array.isArray(row.images) ? row.images : [],
        categorySlug: row.category_slug,
      }));
      const lines: PackLine[] = [];
      for (const item of requested) {
        if (item.customPack !== undefined) {
          try {
            const result = calculatePack(item.customPack, { products: catalogue });
            if (result.slug !== item.slug) throw badRequest("Custom pack identity does not match its configuration.");
            if (!result.available) throw conflict(result.availabilityNote ?? "This custom build is currently unavailable.");
            if (item.expectedUnitPrice !== undefined && item.expectedUnitPrice !== result.price) {
              throw conflict("The price of your custom pack has changed. Open the pack builder and review the updated quote before ordering.");
            }
            lines.push({
              product: customPackRow(result),
              qty: item.qty,
              packComponents: result.components.map((component) => ({ slug: component.slug, qty: component.qty, name: component.name, unitPrice: component.unitPrice })),
            });
          } catch (error) {
            if (error instanceof Error && "status" in error) throw error;
            throw badRequest(error instanceof Error ? error.message : "Invalid custom pack configuration.");
          }
          continue;
        }
        if (item.slug.startsWith("custom-pack-")) throw badRequest("Custom packs must include a valid configuration.");
        const product = lookup.get(item.slug);
        if (!product || !product.visible) throw conflict("One of the items in your bag is no longer available.");
        if (product.stock <= 0) throw conflict(`${product.name} went out of stock. Please remove it and try again.`);
        lines.push({ product, qty: Math.min(item.qty, product.stock) });
      }

      const subtotal = lines.reduce((sum, line) => sum + line.product.price * line.qty, 0);
      let shipping = shippingFor(settings, delivery, district, subtotal);

      const promoCode = String(body.promoCode ?? "").trim().toUpperCase();
      let promo: DbPromo | null = null;
      let discount = 0;
      if (promoCode) {
        const row = await queryOne<DbPromo>(
          `SELECT * FROM promos WHERE code = $1 AND active = TRUE
           AND (starts_at IS NULL OR starts_at <= NOW()) AND (ends_at IS NULL OR ends_at >= NOW())`,
          [promoCode],
        );
        if (!row) throw badRequest("That promo code is not valid.");
        const uses = await queryOne<{ count: string }>(
          "SELECT count(*)::text AS count FROM promo_redemptions WHERE code = $1 AND phone = $2",
          [promoCode, phone],
        );
        const limit = row.per_phone_limit || settings.risk.promoPerPhoneLimit;
        if (Number(uses?.count ?? 0) >= limit) throw conflict(`${promoCode} has already been used on this number.`);
        if (subtotal < row.min_subtotal) {
          throw badRequest(`Spend ${formatTaka(row.min_subtotal)} to use ${promoCode}.`);
        }
        promo = row;
        discount = promoDiscount(promoShape(row), subtotal);
        if (row.type === "shipping") shipping = 0;
      }

      const total = Math.max(0, subtotal + shipping - discount);
      if (method === "cod") {
        if (!settings.shipping.codEnabled) throw conflict("Cash on delivery is currently unavailable. Please pay online.");
        if (total > settings.shipping.codMaxOrder) {
          throw conflict(`Cash on delivery is limited to ${formatTaka(settings.shipping.codMaxOrder)}. Please pay by bKash, Nagad or card for this order.`);
        }
      }
      if (total > settings.risk.maxOrderValue) {
        throw conflict("For orders this large please contact us so we can arrange a secure payment.");
      }

      /* ---- payment pre-checks (before anything is written) ---- */
      const gatewayId = method === "card" ? "sslcommerz" : method;
      const gateway = settings.payments[gatewayId as "bkash" | "nagad" | "sslcommerz" | "cod"];
      const manual = method === "bkash" || method === "nagad";
      const hostedLive = method === "card" || (method === "bkash" && publicSettings(settings).payments.bkash.hosted);
      const trxId = String(body.trxId ?? "").trim().toUpperCase();

      if (manual && gateway.mode === "sandbox") {
        if (!/^[A-Z0-9]{6,20}$/.test(trxId)) throw badRequest("Enter the transaction ID from your payment confirmation SMS.");
        if (trxId.endsWith("00")) throw badRequest("The provider declined this transaction. No money was taken.");
      }
      if (manual && gateway.mode === "live" && !publicSettings(settings).payments.bkash.hosted) {
        if (!/^[A-Z0-9]{6,20}$/.test(trxId)) throw badRequest("Enter the transaction ID from your payment confirmation SMS.");
      }
      if (gatewayId !== "cod" && !gatewayReady(gatewayId as "bkash" | "nagad" | "sslcommerz" | "cod", settings)) {
        throw conflict("That payment method is not available right now. Please choose another.");
      }

      /* Production must never convert a simulated gateway response into real revenue. */
      if (config.isProd && gatewayId !== "cod" && gateway.mode === "sandbox") {
        throw conflict("This payment method is in sandbox mode and cannot accept a live order. Choose cash on delivery or contact the shop.");
      }

      /* ---- write the order ---- */
      const orderNumber = await nextOrderNumber();
      const eventId = String(body.eventId ?? "").slice(0, 80) || null;
      const initialStatus = method === "cod" ? "confirmed" : hostedLive && gateway.mode === "live" ? "pending" : manual && gateway.mode === "live" ? "pending" : "confirmed";

      const created = await tx(async (client) => {
        const q = (text: string, params: unknown[] = []) => client.query(text, params as never[]);
        const reservations = new Map<string, { slug: string; qty: number; name: string; unitPrice: number }>();
        const addReservation = (slug: string, qty: number, name: string, unitPrice: number) => {
          const previous = reservations.get(slug);
          if (previous && previous.unitPrice !== unitPrice) throw conflict("A product price changed. Refresh your bag before ordering.");
          reservations.set(slug, { slug, name, unitPrice, qty: (previous?.qty ?? 0) + qty });
        };
        for (const line of lines) {
          if (line.product.id === 0) {
            for (const component of line.packComponents ?? []) {
              if (component.slug) addReservation(component.slug, component.qty * line.qty, component.name, component.unitPrice);
            }
          } else {
            addReservation(line.product.slug, line.qty, line.product.name, line.product.price);
          }
        }
        // Lock in a consistent order, including shared components across multiple packs.
        await reservePackComponents(client, [...reservations.values()].sort((a, b) => a.slug.localeCompare(b.slug)), 1);
        const orderResult = await q(
          `INSERT INTO orders (order_number, customer_name, phone, email, district, address, notes,
            payment_method, delivery_method, promo_code, subtotal, shipping, discount, total, status, purchase_event_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
          [
            orderNumber, customerName, phone, email || null, district, address, notes, method, delivery,
            promo && discount > 0 ? promo.code : null, subtotal, shipping, discount, total, initialStatus, eventId,
          ],
        );
        const order = orderResult.rows[0];
        for (const line of lines) {
          const images = Array.isArray(line.product.images) ? line.product.images : [];
          await q(
            "INSERT INTO order_items (order_id, product_id, slug, name, image, unit_price, qty, pack_spec) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
            [order.id, line.product.id || null, line.product.slug, line.product.name, images[0] ?? FALLBACK_IMAGE, line.product.price, line.qty, line.product.pack_spec ? JSON.stringify(line.product.pack_spec) : null],
          );
        }
        const attribution = (body.attribution ?? {}) as Record<string, unknown>;
        await q(
          `INSERT INTO order_attribution (order_number, source, medium, campaign, content, term, fbclid, gclid, ttclid, landing_page, referrer, session_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING`,
          [
            orderNumber,
            String(attribution.source ?? "direct").slice(0, 60),
            String(attribution.medium ?? "none").slice(0, 60),
            String(attribution.campaign ?? "").slice(0, 120) || null,
            String(attribution.content ?? "").slice(0, 120) || null,
            String(attribution.term ?? "").slice(0, 120) || null,
            Boolean(attribution.fbclid), Boolean(attribution.gclid), Boolean(attribution.ttclid),
            String(attribution.landingPage ?? "").slice(0, 300) || null,
            String(attribution.referrer ?? "").slice(0, 300) || null,
            String(attribution.sessionId ?? "").slice(0, 60) || null,
          ],
        );
        if (promo && discount > 0) {
          await q("INSERT INTO promo_redemptions (code, phone, order_number) VALUES ($1,$2,$3)", [promo.code, phone, orderNumber]);
        }
        await q(
          "INSERT INTO order_events (order_number, status, label, actor) VALUES ($1,$2,$3,'checkout')",
          [
            orderNumber, initialStatus,
            initialStatus === "confirmed"
              ? method === "cod" ? "Order confirmed — cash on delivery" : "Payment verified"
              : hostedLive ? "Awaiting provider payment" : "Awaiting payment confirmation",
          ],
        );
        await q("UPDATE abandoned_carts SET recovered = TRUE WHERE phone = $1 AND recovered = FALSE", [phone]);
        return order;
      }).catch((error: unknown) => {
        if (isUniqueViolation(error)) throw conflict("That order was already placed. Please check your tracking page.");
        throw error;
      });

      /* ---- payment settlement ---- */
      const reference = paymentReference(orderNumber, gatewayId);
      let redirectUrl: string | undefined;
      let paymentStatus: "paid" | "claimed" | "cod" | "pending" = "pending";

      if (method === "cod") {
        await query("INSERT INTO payments (reference, order_number, provider, amount, status) VALUES ($1,$2,'cod',$3,'cod_due')", [
          reference, orderNumber, total,
        ]);
        paymentStatus = "cod";
      } else if (manual && gateway.mode === "sandbox") {
        await query("INSERT INTO payments (reference, order_number, provider, amount, status, trx_id) VALUES ($1,$2,$3,$4,'paid',$5)", [
          reference, orderNumber, method, total, trxId,
        ]);
        paymentStatus = "paid";
      } else if (method === "card" && gateway.mode === "sandbox") {
        await query("INSERT INTO payments (reference, order_number, provider, amount, status, trx_id) VALUES ($1,$2,'sslcommerz',$3,'paid',$4)", [
          reference, orderNumber, total, `SIM-${reference.slice(-6)}`,
        ]);
        paymentStatus = "paid";
      } else if (manual) {
        /* Live manual send-money: the TrxID is a claim until the owner confirms it. */
        await query("INSERT INTO payments (reference, order_number, provider, amount, status, trx_id) VALUES ($1,$2,$3,$4,'authorised',$5)", [
          reference, orderNumber, method, total, trxId,
        ]);
        paymentStatus = "claimed";
      } else {
        /* Live hosted checkout: create the provider session, or roll the order back. */
        await query("INSERT INTO payments (reference, order_number, provider, amount, status) VALUES ($1,$2,$3,$4,'pending')", [
          reference, orderNumber, gatewayId, total,
        ]);
        try {
          if (gatewayId === "bkash") {
            const session = await bkashCreatePayment(settings, { amount: total, reference, orderNumber });
            redirectUrl = session.redirectUrl;
            await query("UPDATE payments SET raw_payload = $1 WHERE reference = $2", [JSON.stringify({ paymentId: session.paymentId }), reference]);
          } else {
            const session = await sslInitTransaction(settings, {
              amount: total, reference, orderNumber, customerName, phone, email, address, district,
            });
            redirectUrl = session.redirectUrl;
          }
          paymentStatus = "pending";
        } catch (error) {
          await cancelOrderInternal(orderNumber, "Payment session could not be started.");
          throw conflict(error instanceof Error ? error.message : "The payment provider is unavailable. Please try another method.");
        }
      }

      if (settings.notifications.orderConfirmation) {
        const items = lines.map((line) => `${line.qty} × ${line.product.name}`).join(", ");
        deliverSoon((async () => {
          await queueSms({
            to: phone, template: "order_confirmation", subject: `Order ${orderNumber} received`,
            body: confirmationMessage(
              { order_number: orderNumber, customer_name: customerName, phone, email: email || null, total, payment_method: method, courier_consignment: null },
              items, settings.identity.name, settings.identity.domain,
            ),
            orderNumber,
          });
          if (email) {
            await queueEmail({
              to: email, template: "order_confirmation_email", subject: `Your ${settings.identity.name} order ${orderNumber}`,
              body: `Thanks for your order ${orderNumber}. Total ${formatTaka(total)}. Track it at ${settings.identity.domain}/track.`,
              orderNumber,
            });
          }
        })());
      }

      sendJson(ctx, {
        ok: true,
        orderNumber,
        total,
        shipping,
        discount,
        items: lines.map((line) => ({ id: line.product.slug, quantity: line.qty, item_price: line.product.price })),
        claimToken: claimToken(orderNumber),
        payment: { provider: gatewayId, mode: gateway.mode, status: paymentStatus, reference, redirectUrl },
      }, 201);
      void created;
    });

  async function cancelOrderInternal(orderNumber: string, reason: string): Promise<void> {
    await tx(async (client) => {
      const q = (text: string, params: unknown[] = []) => client.query(text, params as never[]);
      const locked = await q("SELECT id FROM orders WHERE order_number = $1 AND status = 'pending' FOR UPDATE", [orderNumber]);
      const order = locked.rows[0] as { id: number } | undefined;
      if (!order) return;
      await q("UPDATE orders SET status = 'cancelled' WHERE id = $1", [order.id]);
      await q(
        `UPDATE products SET stock = stock + item.qty
         FROM (SELECT slug, SUM(qty)::integer AS qty FROM order_items WHERE order_id = $1 AND pack_spec IS NULL GROUP BY slug) AS item WHERE products.slug = item.slug`,
        [order.id],
      );
      await restorePackComponents(client, order.id);
      await q("INSERT INTO order_events (order_number, status, label, actor) VALUES ($1,'cancelled',$2,'system')", [orderNumber, reason]);
    });
  }

  /* Confirmation + tracking reads. Token (post-checkout) or phone (tracking) required. */
  async function publicOrder(ctx: Ctx, orderNumber: string): Promise<void> {
    const number = orderNumber.trim().toUpperCase();
    const token = String(ctx.query.get("token") ?? "");
    const phone = normalizePhone(ctx.query.get("phone"));
    const order = await queryOne("SELECT * FROM orders WHERE order_number = $1", [number]);
    if (!order) throw notFound("No order found with that number.");
    const authorised =
      (token && verifyClaimToken(token, number)) ||
      (phone && order.phone.replace(/[\s-]/g, "") === phone);
    if (!authorised) {
      if (phone && !isValidBDPhone(phone)) throw badRequest("Enter the 11-digit mobile number used for the order.");
      throw forbidden("That order number and mobile number do not match.");
    }
    const [items, events, payment] = await Promise.all([
      query("SELECT * FROM order_items WHERE order_id = $1 ORDER BY id", [order.id]),
      query("SELECT * FROM order_events WHERE order_number = $1 ORDER BY created_at ASC", [number]),
      queryOne<{ status: string; trx_id: string | null }>(
        "SELECT status, trx_id FROM payments WHERE order_number = $1 ORDER BY id DESC LIMIT 1", [number],
      ),
    ]);
    const typed = order as { payment_method: string; status: string };
    const paymentStatus =
      typed.payment_method === "cod"
        ? typed.status === "delivered" ? "paid" : typed.status === "cancelled" ? "unpaid" : "cod_due"
        : payment?.status === "paid" ? "paid"
          : payment?.status === "authorised" ? "authorised"
            : payment?.status === "failed" ? "failed"
              : payment?.status === "refunded" ? "refunded" : "unpaid";
    sendJson(ctx, {
      order: { ...camel(order), paymentStatus },
      items: items.map((row) => camel(row)),
      events: events.map((row) => camel(row)),
      payment: { method: typed.payment_method, status: paymentStatus, trxId: payment?.trx_id ?? null },
    });
  }

  app.get(
    "/api/orders/track",
    rateLimit({ limit: 15, windowMs: 60_000, key: (ctx) => `track:${ctx.ip}` }),
    async (ctx: Ctx) => {
      const number = (ctx.query.get("number") ?? "").trim();
      const phone = normalizePhone(ctx.query.get("phone"));
      if (!number) throw badRequest("Enter your order number.");
      if (!isValidBDPhone(phone)) throw badRequest("Enter the 11-digit mobile number used for the order.");
      await publicOrder(ctx, number);
    },
  );

  app.get(
    "/api/orders/:number",
    rateLimit({ limit: 30, windowMs: 60_000, key: (ctx) => `receipt:${ctx.ip}` }),
    async (ctx: Ctx) => {
      await publicOrder(ctx, ctx.params.number);
    },
  );

  /* ---------------- Carts, newsletter, events ---------------- */

  app.post("/api/carts", async (ctx: Ctx) => {
    const body = bodyOf(ctx);
    const phone = normalizePhone(body.phone);
    if (!isValidBDPhone(phone)) throw badRequest("Enter a valid 11-digit Bangladeshi mobile number.");
    const rawItems = Array.isArray(body.items) ? body.items.slice(0, 20) : [];
    const items = rawItems.map((entry) => {
      const item = entry as Record<string, unknown>;
      return {
        slug: String(item.slug ?? "").slice(0, 120),
        name: String(item.name ?? "").slice(0, 160),
        qty: Math.max(1, Math.min(20, Math.floor(Number(item.qty) || 1))),
        price: Math.max(0, Math.min(10_000_000, Math.floor(Number(item.price) || 0))),
      };
    }).filter((item) => item.slug && item.name);
    if (items.length === 0) throw badRequest("Your bag is empty.");
    const value = items.reduce((sum, item) => sum + item.qty * item.price, 0);
    const name = String(body.name ?? "").slice(0, 80);
    const attribution = (body.attribution ?? {}) as Record<string, unknown>;
    const id = String(body.id ?? "").slice(0, 40) || `cart-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    const existing = await queryOne<{ phone: string }>("SELECT phone FROM abandoned_carts WHERE id = $1", [id]);
    if (existing && existing.phone !== phone) throw forbidden("That bag belongs to another number.");
    await query(
      `INSERT INTO abandoned_carts (id, phone, customer_name, items, value, source, campaign, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (id) DO UPDATE SET phone = $2, customer_name = $3, items = $4, value = $5, updated_at = NOW()`,
      [id, phone, name || null, JSON.stringify(items), value,
        String(attribution.source ?? "").slice(0, 60) || null, String(attribution.campaign ?? "").slice(0, 120) || null],
    );
    sendJson(ctx, { ok: true, id });
  });

  app.post("/api/newsletter", rateLimit({ limit: 5, windowMs: 60 * 60_000, key: (ctx: Ctx) => `news:${ctx.ip}` }), async (ctx: Ctx) => {
    const body = bodyOf(ctx);
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) throw badRequest("That email does not look right.");
    await query("INSERT INTO newsletter (email) VALUES ($1) ON CONFLICT DO NOTHING", [email]);
    sendJson(ctx, { ok: true }, 201);
  });

  const EVENT_NAMES = ["PageView", "ViewContent", "Search", "AddToCart", "InitiateCheckout", "AddPaymentInfo", "Purchase", "Lead", "Contact"];

  app.post("/api/events", rateLimit({ limit: 120, windowMs: 60_000, key: (ctx: Ctx) => `events:${ctx.ip}` }), async (ctx: Ctx) => {
    const body = bodyOf(ctx);
    const name = String(body.event_name ?? "");
    const eventId = String(body.event_id ?? "").slice(0, 120);
    /* Measurement must never break the shopper's flow: invalid payloads are acknowledged, not errors. */
    if (!EVENT_NAMES.includes(name) || !eventId) return sendJson(ctx, { ok: false });
    const params = (body.custom_data ?? {}) as Record<string, unknown>;
    const settings = await getSettings();
    const destinations: string[] = [];
    if (settings.marketing.metaPixelId) destinations.push("meta");
    if (settings.marketing.ga4MeasurementId) destinations.push("ga4");
    if (settings.marketing.tiktokPixelId) destinations.push("tiktok");
    await query("INSERT INTO tracked_events (name, params, destinations, session_id) VALUES ($1,$2,$3,$4)", [
      name,
      JSON.stringify({ ...params, event_id: eventId }),
      destinations,
      String((body.attribution as Record<string, unknown> | undefined)?.sessionId ?? "").slice(0, 60) || null,
    ]);
    if (settings.marketing.conversionsApi) {
      deliverSoon(sendCapiEvent(settings, {
        event_name: name,
        event_id: eventId,
        event_time: Math.floor(Number(body.event_time) || Date.now() / 1000),
        event_source_url: String(body.event_source_url ?? "").slice(0, 500),
        custom_data: params,
        email: typeof body.email === "string" ? body.email : undefined,
        phone: typeof body.phone === "string" ? body.phone : undefined,
        fbc: typeof body.fbc === "string" ? body.fbc : undefined,
        fbp: typeof body.fbp === "string" ? body.fbp : undefined,
        ip: ctx.ip,
        userAgent: ctx.req.headers["user-agent"] ?? undefined,
      }).then((result) => {
        if (!result.ok && result.detail !== "Meta Conversions API is not configured.") {
          console.warn("[capi]", result.detail);
        }
      }));
    }
    sendJson(ctx, { ok: true });
  });

  /* ---------------- Webhooks (provider callbacks) ---------------- */

  async function settle(reference: string, trxId: string | null, raw: Record<string, unknown>): Promise<void> {
    await query("UPDATE payments SET status = 'paid', trx_id = $2, raw_payload = $3, updated_at = NOW() WHERE reference = $1", [
      reference, trxId, JSON.stringify(raw),
    ]);
  }

  async function finishWebhook(orderNumber: string, paid: boolean, ctx: Ctx): Promise<void> {
    const order = await queryOne<{ email: string | null; phone: string; total: number; purchase_event_id: string | null }>(
      "SELECT email, phone, total, purchase_event_id FROM orders WHERE order_number = $1", [orderNumber],
    );
    if (order) {
      await query("UPDATE orders SET status = $1 WHERE order_number = $2", [paid ? "confirmed" : "pending", orderNumber]);
      await query("INSERT INTO order_events (order_number, status, label, actor) VALUES ($1,$2,$3,'webhook')", [
        orderNumber, paid ? "confirmed" : "pending", paid ? "Payment verified by provider" : "Payment not completed",
      ]);
      if (paid) {
        const settings = await getSettings();
        deliverSoon(sendCapiEvent(settings, {
          event_name: "Purchase",
          event_id: order.purchase_event_id || `purchase_${orderNumber}`,
          event_time: Math.floor(Date.now() / 1000),
          event_source_url: `${config.siteUrl}/order/${orderNumber}`,
          custom_data: { value: order.total, currency: "BDT", order_id: orderNumber },
          email: order.email ?? undefined,
          phone: order.phone,
        }));
      }
    }
    redirect(ctx, `${config.siteUrl}/order/${orderNumber}${paid ? "?new=1" : "?payment=failed"}`, 303);
  }

  async function handleWebhook(ctx: Ctx): Promise<void> {
    const provider = ctx.query.get("provider") ?? "";
    const result = ctx.query.get("result") ?? "";
    const params: Record<string, string> = {};
    ctx.query.forEach((value, key) => { params[key] = value; });
    if (ctx.body && typeof ctx.body === "object") {
      for (const [key, value] of Object.entries(ctx.body as Record<string, unknown>)) {
        if (typeof value === "string") params[key] = value;
      }
    }
    const reference = params.merchantInvoiceNumber ?? params.tran_id ?? params.paymentID ?? "";
    if (!reference) throw badRequest("Missing payment reference.");
    const record = await queryOne<{ reference: string; order_number: string; amount: number; status: string }>(
      "SELECT reference, order_number, amount, status FROM payments WHERE reference = $1 OR raw_payload->>'paymentId' = $1",
      [reference],
    );
    if (!record) throw notFound("Unknown payment reference.");
    if (record.status === "paid") return finishWebhook(record.order_number, true, ctx);

    const settings = await getSettings();

    if (provider === "sslcommerz") {
      if (!sslVerifySignature(params, settings.payments.sslcommerz.secretKey)) {
        throw forbidden("Signature mismatch.");
      }
      const paid = (result === "success" || result === "ipn") && (params.status === "VALID" || params.status === "VALIDATED");
      const amount = Math.round(Number(params.amount ?? params.total_amount ?? 0));
      if (!paid || amount !== record.amount) {
        await query("UPDATE payments SET status = 'failed', raw_payload = $1, updated_at = NOW() WHERE reference = $2", [
          JSON.stringify(params), record.reference,
        ]);
        return finishWebhook(record.order_number, false, ctx);
      }
      await settle(record.reference, params.bank_tran_id ?? params.tran_id ?? null, params);
      return finishWebhook(record.order_number, true, ctx);
    }

    if (provider === "bkash") {
      if (params.status === "cancel" || params.status === "failure") {
        await query("UPDATE payments SET status = 'failed', raw_payload = $1, updated_at = NOW() WHERE reference = $2", [
          JSON.stringify(params), record.reference,
        ]);
        return finishWebhook(record.order_number, false, ctx);
      }
      const executed = await bkashExecutePayment(settings, params.paymentID ?? reference);
      if (!executed.ok || Math.round(executed.amount) !== record.amount) {
        await query("UPDATE payments SET status = 'failed', raw_payload = $1, updated_at = NOW() WHERE reference = $2", [
          JSON.stringify(executed.raw), record.reference,
        ]);
        return finishWebhook(record.order_number, false, ctx);
      }
      await settle(record.reference, executed.trxId ?? null, executed.raw);
      return finishWebhook(record.order_number, true, ctx);
    }

    throw badRequest("Unsupported provider.");
  }

  app.get("/api/webhooks/payments", handleWebhook);
  app.post("/api/webhooks/payments", handleWebhook);

  /* ---------------- Scheduled maintenance ---------------- */

  app.get("/api/cron/tick", async (ctx: Ctx) => {
    const header = ctx.req.headers.authorization ?? "";
    if (!config.cronSecret || header !== `Bearer ${config.cronSecret}`) throw forbidden("Unauthorised.");
    const settings = await getSettings();
    const [delivery, reminders, expired] = await Promise.all([
      flushOutbox(200),
      sendDueCartReminders(settings.notifications.abandonedCartAfterMinutes),
      expirePendingOrders(24),
    ]);
    sendJson(ctx, { ok: true, outbox: delivery, cartReminders: reminders, expiredOrders: expired });
  });

  /* ---------------- SEO ---------------- */

  app.get("/sitemap.xml", async (ctx: Ctx) => {
    const base = config.siteUrl;
    const today = new Date().toISOString().slice(0, 10);
    const [products, categories] = await Promise.all([
      query<{ slug: string }>("SELECT slug FROM products WHERE visible = TRUE ORDER BY slug"),
      query<{ slug: string }>("SELECT slug FROM categories ORDER BY sort_order"),
    ]);
    const statics: Array<[string, string, string]> = [
      ["/", "1.0", "daily"], ["/shop", "0.9", "daily"], ["/about", "0.5", "monthly"],
      ["/support", "0.6", "monthly"], ["/track", "0.4", "monthly"], ["/privacy", "0.3", "yearly"],
      ["/terms", "0.3", "yearly"], ["/refunds", "0.4", "yearly"],
      ["/pack-builder", "0.8", "monthly"], ["/help", "0.6", "monthly"],
      ["/help/battery-safety", "0.7", "monthly"], ["/help/shipping", "0.7", "monthly"],
      ["/help/warranty-returns", "0.7", "monthly"], ["/help/wholesale", "0.6", "monthly"],
    ];
    const urls = [
      ...statics.map(([loc, priority, freq]) => ({ loc: `${base}${loc}`, priority, freq })),
      ...categories.map((row) => ({ loc: `${base}/shop?category=${row.slug}`, priority: "0.8", freq: "daily" })),
      ...products.map((row) => ({ loc: `${base}/product/${row.slug}`, priority: "0.7", freq: "weekly" })),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((entry) => `  <url>\n    <loc>${entry.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${entry.freq}</changefreq>\n    <priority>${entry.priority}</priority>\n  </url>`)
      .join("\n")}\n</urlset>\n`;
    sendText(ctx, xml, "application/xml; charset=utf-8", 200, { "cache-control": "public, max-age=3600" });
  });

  app.get("/robots.txt", (ctx: Ctx) => {
    sendText(ctx,
      `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /order/\nDisallow: /checkout\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`,
      "text/plain; charset=utf-8",
      200,
      { "cache-control": "public, max-age=86400" },
    );
  });
}

