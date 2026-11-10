/**
 * Owner API: everything the merchant console needs — orders, catalogue,
 * promos, reviews, settings, messaging, growth and exports. Every route
 * requires a signed admin session; secrets and destructive settings are
 * owner-only; every mutation is written to the audit log.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { config } from "./config";
import path from "node:path";
import { App, badRequest, conflict, forbidden, notFound, rateLimit, sendJson, sendText, type Ctx } from "./http";
import { camel, isUniqueViolation, query, queryOne, tx } from "./db";
import { audit, hashPassword, issueSession, clearSession, requireAdmin, requireOwner, verifyPassword } from "./auth";
import { getSettings, updateSettings, type StoreSettings } from "./settings";
import { readinessAudit } from "../src/lib/settings";
import { normalizePhone, isValidBDPhone } from "../src/lib/phone";
import { flushOutbox, queueSms, statusMessage } from "./notify";
import { bkashRefund, createConsignment, sendSms } from "./providers";
import { restorePackComponents } from "./inventory";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function bodyOf(ctx: Ctx): Record<string, unknown> {
  if (!ctx.body || typeof ctx.body !== "object" || Array.isArray(ctx.body)) throw badRequest("Invalid request body.");
  return ctx.body as Record<string, unknown>;
}

function text(value: unknown, field: string, max: number, required = true): string {
  const out = String(value ?? "").trim();
  if (!out && required) throw badRequest(`${field} is required.`);
  if (out.length > max) throw badRequest(`${field} is too long.`);
  return out;
}

function num(value: unknown, field: string, min: number, max: number): number {
  const out = Number(value);
  if (!Number.isInteger(out) || out < min || out > max) throw badRequest(`${field} is invalid.`);
  return out;
}

function qint(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null || value === "") return fallback;
  const out = Number(value);
  if (!Number.isInteger(out)) return fallback;
  return Math.min(max, Math.max(min, out));
}

function pageParams(ctx: Ctx, defaultLimit: number, maxLimit: number): { page: number; limit: number; offset: number } {
  const page = qint(ctx.query.get("page"), 1, 1, 100_000);
  const limit = qint(ctx.query.get("limit"), defaultLimit, 1, maxLimit);
  return { page, limit, offset: (page - 1) * limit };
}

const EARN = ["confirmed", "packing", "shipped", "delivered"];
const OPEN = ["pending", "confirmed", "packing", "shipped"];
const STATUSES = ["pending", "confirmed", "packing", "shipped", "delivered", "cancelled", "returned"];
const PAYMENT_STATUSES = ["unpaid", "authorised", "paid", "failed", "refunded", "cod_due"];

type OrderRow = {
  id: number; order_number: string; customer_name: string; phone: string; email: string | null;
  district: string; address: string; notes: string | null; payment_method: string; delivery_method: string;
  promo_code: string | null; subtotal: number; shipping: number; discount: number; total: number;
  status: string; courier_provider: string | null; courier_consignment: string | null; created_at: Date;
};

function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  /* Spreadsheet formula injection: customer text must stay inert in Excel/Sheets. */
  const out = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(out) ? `"${out.replace(/"/g, '""')}"` : out;
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  return [headers.join(","), ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(","))].join("\r\n");
}

function csv(ctx: Ctx, filename: string, rows: Array<Record<string, unknown>>): void {
  sendText(ctx, `﻿${toCsv(rows)}`, "text/csv; charset=utf-8", 200, {
    "content-disposition": `attachment; filename="${filename}"`,
    "cache-control": "no-store",
  });
}

async function screenFlags(order: OrderRow, items: Array<{ qty: number }>, settings: StoreSettings): Promise<string[]> {
  const flags: string[] = [];
  const phone = order.phone.replace(/[\s-]/g, "");
  const today = await queryOne<{ count: string }>(
    "SELECT count(*)::text AS count FROM orders WHERE phone = $1 AND created_at > NOW() - interval '24 hours'", [phone],
  );
  if (Number(today?.count ?? 0) > settings.risk.maxOrdersPerPhonePerDay) {
    flags.push(`${today?.count} orders from this number in 24h`);
  }
  const refused = await queryOne<{ count: string }>(
    "SELECT count(*)::text AS count FROM orders WHERE phone = $1 AND status IN ('cancelled','returned')", [phone],
  );
  if (Number(refused?.count ?? 0) >= settings.risk.codStrikeLimit && order.payment_method === "cod") {
    flags.push(`${refused?.count} previous refusals — take advance`);
  }
  if (order.total > settings.risk.maxOrderValue) flags.push("Above high-value threshold — call to confirm");
  if (order.payment_method === "cod" && order.total > settings.shipping.codMaxOrder) flags.push("COD above the allowed ceiling");
  if (order.address.trim().length < 18) flags.push("Address looks incomplete");
  if (items.some((item) => item.qty >= 10)) flags.push("Bulk quantity — verify reseller");
  return flags;
}

async function fullOrder(orderNumber: string): Promise<Record<string, unknown> | null> {
  const order = await queryOne<OrderRow>("SELECT * FROM orders WHERE order_number = $1", [orderNumber]);
  if (!order) return null;
  const [items, events, notes, attribution, payment] = await Promise.all([
    query("SELECT * FROM order_items WHERE order_id = $1 ORDER BY id", [order.id]),
    query("SELECT * FROM order_events WHERE order_number = $1 ORDER BY created_at ASC", [orderNumber]),
    query("SELECT * FROM order_notes WHERE order_number = $1 ORDER BY created_at DESC", [orderNumber]),
    queryOne("SELECT * FROM order_attribution WHERE order_number = $1", [orderNumber]),
    queryOne<{ status: string; trx_id: string | null; provider: string }>(
      "SELECT status, trx_id, provider FROM payments WHERE order_number = $1 ORDER BY id DESC LIMIT 1", [orderNumber],
    ),
  ]);
  const settings = await getSettings();
  const flags = await screenFlags(order, items as Array<{ qty: number }>, settings);
  const paymentStatus =
    order.payment_method === "cod"
      ? order.status === "delivered" ? "paid" : order.status === "cancelled" ? "unpaid" : "cod_due"
      : payment?.status ?? "unpaid";
  return {
    ...camel(order),
    customerNote: order.notes,
    items: items.map((row) => camel(row)),
    events: events.map((row) => camel(row)),
    notes: notes.map((row) => camel(row)),
    attribution: attribution ? camel(attribution) : null,
    paymentStatus,
    paymentProvider: payment?.provider ?? order.payment_method,
    trxId: payment?.trx_id ?? null,
    riskFlags: flags,
  };
}

async function setOrderStatus(orderNumber: string, status: string, note: string, actor: string): Promise<boolean> {
  if (!STATUSES.includes(status)) throw badRequest("Unknown status.");
  const order = await tx(async (client) => {
    const q = (sql: string, params: unknown[] = []) => client.query(sql, params as never[]);
    const locked = await q("SELECT * FROM orders WHERE order_number = $1 FOR UPDATE", [orderNumber]);
    const current = locked.rows[0] as OrderRow | undefined;
    if (!current) throw notFound("Order not found.");
    if (current.status === status) return null;
    const wasClosed = current.status === "cancelled" || current.status === "returned";
    const nowClosed = status === "cancelled" || status === "returned";
    if (wasClosed && !nowClosed) throw conflict("A cancelled or returned order cannot be reopened. Create a new order so stock is reserved again.");
    await q("UPDATE orders SET status = $1 WHERE order_number = $2", [status, orderNumber]);
    await q("INSERT INTO order_events (order_number, status, label, note, actor) VALUES ($1,$2,$3,$4,$5)", [
      orderNumber, status, statusLabel(status), note || null, actor,
    ]);
    if (nowClosed && !wasClosed) {
      await q(
        `UPDATE products SET stock = stock + item.qty
         FROM (SELECT slug, SUM(qty)::integer AS qty FROM order_items WHERE order_id = $1 AND pack_spec IS NULL GROUP BY slug) AS item WHERE products.slug = item.slug`,
        [current.id],
      );
      await restorePackComponents(client, current.id);
    }
    if (status === "delivered") {
      await q("UPDATE payments SET status = 'paid', updated_at = NOW() WHERE order_number = $1 AND status = 'cod_due'", [orderNumber]);
    }
    return current;
  });
  if (!order) return false;

  const settings = await getSettings();
  if (settings.notifications.statusUpdates) {
    const message = statusMessage(
      {
        order_number: orderNumber, customer_name: order.customer_name, phone: order.phone,
        email: order.email, total: order.total, payment_method: order.payment_method,
        courier_consignment: order.courier_consignment,
      },
      status, note, settings.identity.name,
    );
    if (message) {
      await queueSms({ to: order.phone, template: `order_${status}`, subject: `Order ${orderNumber}`, body: message, orderNumber });
    }
  }
  return true;
}

function statusLabel(status: string): string {
  switch (status) {
    case "pending": return "Awaiting payment";
    case "confirmed": return "Order confirmed";
    case "packing": return "Packing at the bench";
    case "shipped": return "Handed to courier";
    case "delivered": return "Delivered";
    case "cancelled": return "Order cancelled";
    case "returned": return "Returned to shop";
    default: return status;
  }
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

export function mountAdmin(app: App): void {
  /* ---------------- session ---------------- */

  app.post("/api/admin/login",
    rateLimit({ limit: 8, windowMs: 15 * 60_000, key: (ctx: Ctx) => `login:${ctx.ip}` }),
    async (ctx: Ctx) => {
      const body = bodyOf(ctx);
      const email = String(body.email ?? "").trim().toLowerCase().slice(0, 160);
      const password = String(body.password ?? "");
      if (!email || !password) throw badRequest("Email and password are required.");
      const row = await queryOne<{ email: string; password_hash: string; role: string; active: boolean }>(
        "SELECT email, password_hash, role, active FROM admin_users WHERE lower(email) = lower($1)", [email],
      );
      const ok = row?.active === true && (await verifyPassword(password, row.password_hash));
      await audit({ actor: email, action: ok ? "admin.login" : "admin.login.failed", ip: ctx.ip });
      if (!ok || !row) throw badRequest("Those credentials are not recognised.");
      issueSession(ctx, row.email, row.role);
      sendJson(ctx, { ok: true, email: row.email, role: row.role });
    });

  app.post("/api/admin/logout", async (ctx: Ctx) => {
    clearSession(ctx);
    sendJson(ctx, { ok: true });
  });

  app.get("/api/admin/me", requireAdmin(), async (ctx: Ctx) => {
    sendJson(ctx, { email: ctx.admin?.email, role: ctx.admin?.role });
  });

  /* ---------------- overview ---------------- */

  app.get("/api/admin/overview", requireAdmin(), async (ctx: Ctx) => {
    const days = qint(ctx.query.get("days"), 14, 1, 90);
    const settings = await getSettings();
    const now = new Date();
    const from = new Date(now.getTime() - days * 86400000);
    const prevFrom = new Date(now.getTime() - days * 2 * 86400000);

    async function kpis(start: Date, end: Date) {
      const row = await queryOne<{
        total_orders: string; earn_orders: string; revenue: string; cancelled: string; pending: string; cod: string;
      }>(
        `SELECT COUNT(*)::text AS total_orders,
          COUNT(*) FILTER (WHERE status = ANY($3))::text AS earn_orders,
          COALESCE(SUM(total) FILTER (WHERE status = ANY($3)), 0)::text AS revenue,
          COUNT(*) FILTER (WHERE status IN ('cancelled','returned'))::text AS cancelled,
          COUNT(*) FILTER (WHERE status = 'pending')::text AS pending,
          COUNT(*) FILTER (WHERE status = ANY($3) AND payment_method = 'cod')::text AS cod
         FROM orders WHERE created_at >= $1 AND created_at <= $2`,
        [start, end, EARN],
      );
      const units = await queryOne<{ units: string }>(
        `SELECT COALESCE(SUM(i.qty),0)::text AS units FROM order_items i JOIN orders o ON o.id = i.order_id
         WHERE o.created_at >= $1 AND o.created_at <= $2 AND o.status = ANY($3)`, [start, end, EARN],
      );
      const paid = await queryOne<{ paid: string }>(
        `SELECT COALESCE(SUM(o.total),0)::text AS paid FROM orders o
         JOIN (SELECT DISTINCT ON (order_number) order_number, status FROM payments ORDER BY order_number, id DESC) p
           ON p.order_number = o.order_number AND p.status = 'paid'
         WHERE o.created_at >= $1 AND o.created_at <= $2`, [start, end],
      );
      const spend = await queryOne<{ spend: string }>(
        "SELECT COALESCE(SUM(amount),0)::text AS spend FROM ad_spend WHERE date >= $1 AND date <= $2",
        [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)],
      );
      const revenue = Number(row?.revenue ?? 0);
      const earnOrders = Number(row?.earn_orders ?? 0);
      const spendValue = Number(spend?.spend ?? 0);
      return {
        revenue,
        orders: Number(row?.total_orders ?? 0),
        aov: earnOrders ? Math.round(revenue / earnOrders) : 0,
        units: Number(units?.units ?? 0),
        cancelled: Number(row?.cancelled ?? 0),
        pending: Number(row?.pending ?? 0),
        codShare: earnOrders ? Math.round((Number(row?.cod ?? 0) / earnOrders) * 100) : 0,
        paidRevenue: Number(paid?.paid ?? 0),
        spend: spendValue,
        roas: spendValue > 0 ? Math.round((revenue / spendValue) * 100) / 100 : 0,
        profit: Math.round(revenue * 0.42 - spendValue),
      };
    }

    const [current, previous] = await Promise.all([kpis(from, now), kpis(prevFrom, from)]);

    const orderDays = await query<{ d: string; orders: string; revenue: string }>(
      `SELECT to_char(created_at,'YYYY-MM-DD') AS d, COUNT(*)::text AS orders, COALESCE(SUM(total),0)::text AS revenue
       FROM orders WHERE created_at >= $1 AND status = ANY($2) GROUP BY 1`, [from, EARN],
    );
    const spendDays = await query<{ date: string; spend: string }>(
      "SELECT date, SUM(amount)::text AS spend FROM ad_spend WHERE date >= $1 GROUP BY 1",
      [from.toISOString().slice(0, 10)],
    );
    const orderMap = new Map(orderDays.map((row) => [row.d, row]));
    const spendMap = new Map(spendDays.map((row) => [row.date, Number(row.spend)]));
    const series = Array.from({ length: days }, (_, index) => {
      const day = new Date(from.getTime() + index * 86400000);
      const key = day.toISOString().slice(0, 10);
      const entry = orderMap.get(key);
      return {
        date: key,
        label: day.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        revenue: Number(entry?.revenue ?? 0),
        orders: Number(entry?.orders ?? 0),
        spend: spendMap.get(key) ?? 0,
      };
    });

    const channelRows = await query<{ s: string; orders: string; revenue: string }>(
      `SELECT COALESCE(a.source,'direct') AS s, COUNT(*)::text AS orders, COALESCE(SUM(o.total),0)::text AS revenue
       FROM orders o LEFT JOIN order_attribution a ON a.order_number = o.order_number
       WHERE o.created_at >= $1 AND o.status = ANY($2) GROUP BY 1`, [from, EARN],
    );
    const channelSpend = await query<{ channel: string; spend: string }>(
      "SELECT channel, SUM(amount)::text AS spend FROM ad_spend WHERE date >= $1 GROUP BY 1",
      [from.toISOString().slice(0, 10)],
    );
    const spendByChannel = new Map<string, number>();
    for (const row of channelSpend) {
      const key = row.channel === "meta" ? "facebook" : row.channel;
      spendByChannel.set(key, (spendByChannel.get(key) ?? 0) + Number(row.spend));
    }
    const channels = [...new Set([...channelRows.map((row) => row.s), ...spendByChannel.keys()])].map((channel) => {
      const entry = channelRows.find((row) => row.s === channel);
      const revenue = Number(entry?.revenue ?? 0);
      const orders = Number(entry?.orders ?? 0);
      const spend = spendByChannel.get(channel) ?? 0;
      return {
        channel, orders, revenue, spend,
        roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : 0,
        aov: orders ? Math.round(revenue / orders) : 0,
      };
    }).sort((a, b) => b.revenue - a.revenue);

    const topProducts = await query<{ slug: string; name: string; units: string; revenue: string }>(
      `SELECT i.slug, MAX(i.name) AS name, SUM(i.qty)::text AS units, SUM(i.qty * i.unit_price)::text AS revenue
       FROM order_items i JOIN orders o ON o.id = i.order_id
       WHERE o.created_at >= $1 AND o.status = ANY($2)
       GROUP BY i.slug ORDER BY SUM(i.qty * i.unit_price) DESC LIMIT 6`, [from, EARN],
    );

    const statusCounts = await query<{ status: string; count: string }>(
      "SELECT status, COUNT(*)::text AS count FROM orders GROUP BY status",
    );
    const lowStock = await query(
      "SELECT slug, name, sku, price, stock FROM products WHERE stock <= $1 ORDER BY stock ASC LIMIT 8",
      [settings.notifications.lowStockThreshold],
    );
    const recent = await query(
      "SELECT order_number, customer_name, district, status, total, created_at FROM orders ORDER BY created_at DESC LIMIT 6",
    );

    sendJson(ctx, {
      current, previous, series, channels,
      topProducts: topProducts.map((row) => ({ ...row, units: Number(row.units), revenue: Number(row.revenue) })),
      statusCounts: statusCounts.map((row) => ({ status: row.status, count: Number(row.count) })),
      lowStock: lowStock.map((row) => camel(row)),
      recent: recent.map((row) => camel(row)),
      issues: readinessAudit(settings),
    });
  });

  /* ---------------- orders ---------------- */

  function orderFilters(ctx: Ctx): { where: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];
    const push = (sql: string, value: unknown) => {
      params.push(value);
      conditions.push(sql.replace("?", `$${params.length}`));
    };
    const status = ctx.query.get("status");
    if (status === "open") conditions.push("status = ANY('{pending,confirmed,packing,shipped}')");
    else if (status && status !== "all") push("status = ?", status);
    const payment = ctx.query.get("payment");
    if (payment === "cod") push("payment_method = ?", "cod");
    else if (payment === "prepaid") conditions.push("payment_method <> 'cod'");
    else if (payment === "unpaid") {
      conditions.push(`order_number NOT IN (SELECT order_number FROM payments WHERE status = 'paid')`);
    }
    const q = (ctx.query.get("q") ?? "").trim();
    if (q) {
      params.push(`%${q.replace(/[%_]/g, "")}%`);
      conditions.push(`(order_number ILIKE $${params.length} OR customer_name ILIKE $${params.length} OR phone ILIKE $${params.length} OR district ILIKE $${params.length} OR address ILIKE $${params.length})`);
    }
    const from = ctx.query.get("from");
    const to = ctx.query.get("to");
    if (from) push("created_at >= ?", new Date(from));
    if (to) push("created_at <= ?", new Date(to));
    return { where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", params };
  }

  app.get("/api/admin/orders", requireAdmin(), async (ctx: Ctx) => {
    const { where, params } = orderFilters(ctx);
    const { page, limit, offset } = pageParams(ctx, 50, 100);
    const sort = ctx.query.get("sort") ?? "recent";
    const orderBy = sort === "oldest" ? "created_at ASC" : sort === "value" ? "total DESC" : "created_at DESC";
    const total = await queryOne<{ count: string }>(`SELECT count(*)::text AS count FROM orders ${where}`, params);
    const rows = await query<OrderRow>(`SELECT * FROM orders ${where} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [
      ...params, limit, offset,
    ]);
    const counts = rows.length
      ? await query<{ order_id: number; count: string }>(
        "SELECT order_id, COUNT(*)::text AS count FROM order_items WHERE order_id = ANY($1) GROUP BY order_id",
        [rows.map((row) => row.id)],
      )
      : [];
    const countMap = new Map(counts.map((row) => [row.order_id, Number(row.count)]));
    sendJson(ctx, {
      orders: rows.map((row) => ({ ...camel(row), itemCount: countMap.get(row.id) ?? 0 })),
      total: Number(total?.count ?? 0),
      page,
      pageCount: Math.max(1, Math.ceil(Number(total?.count ?? 0) / limit)),
    });
  });

  app.get("/api/admin/orders/:number", requireAdmin(), async (ctx: Ctx) => {
    const order = await fullOrder(ctx.params.number);
    if (!order) throw notFound("Order not found.");
    sendJson(ctx, { order });
  });

  app.patch("/api/admin/orders/:number", requireAdmin(), async (ctx: Ctx) => {
    const body = bodyOf(ctx);
    const orderNumber = ctx.params.number.trim().toUpperCase();
    const actor = ctx.admin?.email ?? "admin";

    if (body.status !== undefined) {
      const status = String(body.status);
      const note = String(body.note ?? "").slice(0, 500);
      await setOrderStatus(orderNumber, status, note, actor);
      await audit({ actor, action: "order.status", target: orderNumber, payload: { status, note }, ip: ctx.ip });
    }
    if (body.internalNote !== undefined) {
      const note = text(body.internalNote, "Note", 1000);
      await query("INSERT INTO order_notes (order_number, body, actor) VALUES ($1,$2,$3)", [orderNumber, note, actor]);
      await audit({ actor, action: "order.note", target: orderNumber, ip: ctx.ip });
    }
    if (body.paymentStatus !== undefined) {
      const status = String(body.paymentStatus);
      if (!PAYMENT_STATUSES.includes(status)) throw badRequest("Unknown payment status.");
      const trxId = String(body.trxId ?? "").trim().toUpperCase().slice(0, 40) || null;
      await query(
        "INSERT INTO payments (reference, order_number, provider, amount, status, trx_id) VALUES ($1,$2,'manual',(SELECT total FROM orders WHERE order_number = $2),$3,$4)",
        [`MANUAL-${orderNumber}-${Date.now().toString(36).toUpperCase()}`, orderNumber, status, trxId],
      );
      await query("INSERT INTO order_events (order_number, status, label, note, actor) VALUES ($1,(SELECT status FROM orders WHERE order_number = $1),$2,$3,$4)", [
        orderNumber, `Payment marked ${status}`, trxId ? `TrxID ${trxId}` : null, actor,
      ]);
      await audit({ actor, action: "order.payment", target: orderNumber, payload: { status, trxId }, ip: ctx.ip });
    }
    if (body.bookCourier === true) {
      const order = await queryOne<OrderRow>("SELECT * FROM orders WHERE order_number = $1", [orderNumber]);
      if (!order) throw notFound("Order not found.");
      const settings = await getSettings();
      const items = await query<{ qty: number }>("SELECT qty FROM order_items WHERE order_id = $1", [order.id]);
      const weight = Math.max(0.5, items.reduce((sum, item) => sum + item.qty * 0.2, 0));
      let provider = "Pathao (manual)";
      let consignment = `PT${Math.floor(100000 + Math.random() * 899999)}`;
      if (settings.courier.provider !== "manual" && settings.courier.apiKey) {
        const result = await createConsignment(settings, {
          orderNumber, name: order.customer_name, phone: order.phone,
          address: order.address, district: order.district,
          codAmount: order.payment_method === "cod" ? order.total : 0, weightKg: Math.round(weight * 10) / 10,
        });
        if (!result.ok) throw conflict(result.error ?? "Courier booking failed.");
        provider = settings.courier.provider === "steadfast" ? "Steadfast" : "Pathao";
        consignment = result.consignmentId ?? consignment;
      }
      await query("UPDATE orders SET courier_provider = $1, courier_consignment = $2 WHERE order_number = $3", [
        provider, consignment, orderNumber,
      ]);
      await query("INSERT INTO order_events (order_number, status, label, actor) VALUES ($1,(SELECT status FROM orders WHERE order_number = $1),$2,$3)", [
        orderNumber, `Courier booked — ${consignment}`, actor,
      ]);
      await audit({ actor, action: "order.courier", target: orderNumber, payload: { provider, consignment }, ip: ctx.ip });
    }

    if (body.resend === true) {
      const current = await queryOne<OrderRow>("SELECT * FROM orders WHERE order_number = $1", [orderNumber]);
      if (!current) throw notFound("Order not found.");
      const live = await getSettings();
      const reminder = statusMessage(
        {
          order_number: orderNumber, customer_name: current.customer_name, phone: current.phone,
          email: current.email, total: current.total, payment_method: current.payment_method,
          courier_consignment: current.courier_consignment,
        },
        current.status, "", live.identity.name,
      );
      if (reminder) {
        await queueSms({ to: current.phone, template: `order_${current.status}`, subject: `Order ${orderNumber}`, body: reminder, orderNumber });
      }
      await audit({ actor: ctx.admin?.email ?? "admin", action: "order.resend", target: orderNumber, ip: ctx.ip });
    }

    const order = await fullOrder(orderNumber);
    sendJson(ctx, { ok: true, order });
  });

  app.post("/api/admin/orders/bulk", requireAdmin(), async (ctx: Ctx) => {
    const body = bodyOf(ctx);
    const numbers = Array.isArray(body.numbers) ? body.numbers.map((entry) => String(entry).trim().toUpperCase()).slice(0, 100) : [];
    const status = String(body.status ?? "");
    if (numbers.length === 0 || !STATUSES.includes(status)) throw badRequest("Provide order numbers and a status.");
    const actor = ctx.admin?.email ?? "admin";
    let updated = 0;
    for (const orderNumber of numbers) {
      try {
        if (await setOrderStatus(orderNumber, status, "Bulk update", actor)) updated += 1;
      } catch {
        /* unknown numbers are skipped, not fatal */
      }
    }
    await audit({ actor, action: "order.bulk", payload: { status, count: updated }, ip: ctx.ip });
    sendJson(ctx, { ok: true, updated });
  });

  app.post("/api/admin/orders/:number/refund", requireAdmin(), async (ctx: Ctx) => {
    const body = bodyOf(ctx);
    const orderNumber = ctx.params.number.trim().toUpperCase();
    const actor = ctx.admin?.email ?? "admin";
    const payment = await queryOne<{ reference: string; amount: number; trx_id: string | null; provider: string; raw_payload: unknown }>(
      "SELECT reference, amount, trx_id, provider, raw_payload FROM payments WHERE order_number = $1 AND status = 'paid' ORDER BY id DESC LIMIT 1",
      [orderNumber],
    );
    if (!payment) throw conflict("No captured payment to refund on this order.");
    const amount = Math.min(payment.amount, Math.max(1, Math.floor(Number(body.amount ?? payment.amount))));
    const reason = String(body.reason ?? "Customer return").slice(0, 120);
    const settings = await getSettings();

    let providerMessage = "Refund recorded — send it manually to the customer's number.";
    if (settings.payments.bkash.mode === "live" && payment.provider === "bkash" && payment.trx_id) {
      const raw = (payment.raw_payload ?? {}) as Record<string, unknown>;
      const result = await bkashRefund(settings, {
        paymentId: String(raw.paymentId ?? payment.reference),
        trxId: payment.trx_id,
        amount,
        reason,
      });
      if (!result.ok) throw conflict(result.message || "The provider refused the refund.");
      providerMessage = `Refund of ৳${amount.toLocaleString("en-IN")} sent to the original method.`;
    }
    await query("UPDATE payments SET status = 'refunded', updated_at = NOW() WHERE reference = $1", [payment.reference]);
    await setOrderStatus(orderNumber, "returned", `${providerMessage} (${reason})`, actor);
    await audit({ actor, action: "order.refund", target: orderNumber, payload: { amount, reason }, ip: ctx.ip });
    sendJson(ctx, { ok: true, message: providerMessage, order: await fullOrder(orderNumber) });
  });

  /* ---------------- products ---------------- */

  function productShape(row: Record<string, unknown>) {
    const out = camel<Record<string, unknown>>(row);
    for (const key of ["highlights", "specs", "images"]) {
      if (!Array.isArray(out[key])) out[key] = [];
    }
    return out;
  }

  app.get("/api/admin/products", requireAdmin(), async (ctx: Ctx) => {
    const { page, limit, offset } = pageParams(ctx, 50, 200);
    const conditions: string[] = [];
    const params: unknown[] = [];
    const q = (ctx.query.get("q") ?? "").trim();
    if (q) {
      params.push(`%${q.replace(/[%_]/g, "")}%`);
      conditions.push(`(name ILIKE $${params.length} OR sku ILIKE $${params.length} OR brand ILIKE $${params.length})`);
    }
    const category = ctx.query.get("category");
    if (category) {
      params.push(category);
      conditions.push(`category_slug = $${params.length}`);
    }
    if (ctx.query.get("low") === "1") {
      const settings = await getSettings();
      params.push(settings.notifications.lowStockThreshold);
      conditions.push(`stock <= $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const total = await queryOne<{ count: string }>(`SELECT count(*)::text AS count FROM products ${where}`, params);
    const rows = await query(
      `SELECT * FROM products ${where} ORDER BY category_slug, name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    sendJson(ctx, {
      products: rows.map(productShape),
      total: Number(total?.count ?? 0),
      page,
      pageCount: Math.max(1, Math.ceil(Number(total?.count ?? 0) / limit)),
    });
  });

  app.post("/api/admin/products", requireAdmin(), async (ctx: Ctx) => {
    const body = bodyOf(ctx);
    const slug = text(body.slug, "Slug", 120).toLowerCase();
    if (!/^[a-z0-9-]{2,120}$/.test(slug)) throw badRequest("Slug must be lowercase letters, numbers and dashes.");
    const name = text(body.name, "Name", 160);
    const price = num(body.price, "Price", 0, 100_000_000);
    const categorySlug = text(body.categorySlug, "Category", 120);
    const sku = text(body.sku, "SKU", 60);
    const category = await queryOne("SELECT slug FROM categories WHERE slug = $1", [categorySlug]);
    if (!category) throw badRequest("That category does not exist.");
    try {
      const rows = await query(
        `INSERT INTO products (slug, name, brand, category_slug, short_description, description, price,
          compare_at_price, stock, badge, highlights, specs, images, featured, visible, warranty_months, sku)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
        [
          slug, name, String(body.brand ?? "").slice(0, 80), categorySlug,
          String(body.shortDescription ?? "").slice(0, 300), String(body.description ?? "").slice(0, 8000), price,
          body.compareAtPrice === null || body.compareAtPrice === undefined ? null : num(body.compareAtPrice, "Compare-at price", 0, 100_000_000),
          body.stock === undefined ? 0 : num(body.stock, "Stock", 0, 1_000_000),
          body.badge ? String(body.badge).slice(0, 40) : null,
          JSON.stringify(Array.isArray(body.highlights) ? body.highlights.slice(0, 20).map((entry) => String(entry).slice(0, 200)) : []),
          JSON.stringify(Array.isArray(body.specs) ? body.specs.slice(0, 40) : []),
          JSON.stringify(Array.isArray(body.images) ? body.images.slice(0, 10).map((entry) => String(entry).slice(0, 500)) : []),
          body.featured === true, body.visible !== false,
          body.warrantyMonths === undefined ? 3 : num(body.warrantyMonths, "Warranty", 0, 60),
          sku,
        ],
      );
      await audit({ actor: ctx.admin?.email ?? "admin", action: "product.create", target: slug, ip: ctx.ip });
      sendJson(ctx, { ok: true, product: productShape(rows[0]) }, 201);
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("A product with that slug or SKU already exists.");
      throw error;
    }
  });

  app.patch("/api/admin/products/:slug", requireAdmin(), async (ctx: Ctx) => {
    const body = bodyOf(ctx);
    const slug = ctx.params.slug;
    const existing = await queryOne("SELECT slug FROM products WHERE slug = $1", [slug]);
    if (!existing) throw notFound("Product not found.");
    const allowed = ["name", "brand", "categorySlug", "shortDescription", "description", "price", "compareAtPrice",
      "stock", "badge", "highlights", "specs", "images", "featured", "visible", "warrantyMonths", "sku"] as const;
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [key, value] of Object.entries(body)) {
      if (!(allowed as readonly string[]).includes(key)) throw badRequest(`Unknown field: ${key}.`);
      const column = key.replace(/([A-Z])/g, (letter) => `_${letter.toLowerCase()}`);
      if (["price", "stock", "warrantyMonths"].includes(key)) {
        params.push(num(value, key, 0, key === "price" ? 100_000_000 : 1_000_000));
      } else if (key === "compareAtPrice") {
        params.push(value === null ? null : num(value, key, 0, 100_000_000));
      } else if (key === "featured" || key === "visible") {
        if (typeof value !== "boolean") throw badRequest(`${key} must be true or false.`);
        params.push(value);
      } else if (["highlights", "specs", "images"].includes(key)) {
        if (!Array.isArray(value)) throw badRequest(`${key} must be a list.`);
        params.push(JSON.stringify(value.slice(0, 40)));
      } else {
        params.push(key === "description" ? String(value ?? "").slice(0, 8000) : String(value ?? "").slice(0, 500));
      }
      sets.push(`${column} = $${params.length}`);
    }
    if (sets.length === 0) throw badRequest("Nothing to update.");
    if (body.categorySlug !== undefined) {
      const category = await queryOne("SELECT slug FROM categories WHERE slug = $1", [body.categorySlug]);
      if (!category) throw badRequest("That category does not exist.");
    }
    params.push(slug);
    try {
      const rows = await query(`UPDATE products SET ${sets.join(", ")} WHERE slug = $${params.length} RETURNING *`, params);
      await audit({ actor: ctx.admin?.email ?? "admin", action: "product.update", target: slug, payload: body, ip: ctx.ip });
      sendJson(ctx, { ok: true, product: productShape(rows[0]) });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("Another product already uses that SKU.");
      throw error;
    }
  });

  app.delete("/api/admin/products/:slug", requireAdmin(), async (ctx: Ctx) => {
    const slug = ctx.params.slug;
    const used = await queryOne<{ count: string }>("SELECT count(*)::text AS count FROM order_items WHERE slug = $1", [slug]);
    if (Number(used?.count ?? 0) > 0) throw conflict("This product appears on past orders. Hide it instead of deleting.");
    await query("DELETE FROM reviews WHERE product_slug = $1", [slug]);
    const deleted = await query("DELETE FROM products WHERE slug = $1 RETURNING slug", [slug]);
    if (deleted.length === 0) throw notFound("Product not found.");
    await audit({ actor: ctx.admin?.email ?? "admin", action: "product.delete", target: slug, ip: ctx.ip });
    sendJson(ctx, { ok: true });
  });

  /* ---------------- categories ---------------- */

  app.get("/api/admin/categories", requireAdmin(), async (ctx: Ctx) => {
    const rows = await query(
      `SELECT c.*, COALESCE(p.count, 0)::int AS product_count FROM categories c
       LEFT JOIN (SELECT category_slug, COUNT(*) AS count FROM products GROUP BY category_slug) p
       ON p.category_slug = c.slug ORDER BY c.sort_order, c.name`,
    );
    sendJson(ctx, { categories: rows.map((row) => camel(row)) });
  });

  app.post("/api/admin/categories", requireAdmin(), async (ctx: Ctx) => {
    const body = bodyOf(ctx);
    const slug = text(body.slug, "Slug", 120).toLowerCase();
    if (!/^[a-z0-9-]{2,120}$/.test(slug)) throw badRequest("Slug must be lowercase letters, numbers and dashes.");
    const name = text(body.name, "Name", 120);
    try {
      const rows = await query(
        "INSERT INTO categories (slug, name, tagline, description, image, icon, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",
        [slug, name, String(body.tagline ?? "").slice(0, 200), String(body.description ?? "").slice(0, 2000),
          String(body.image ?? "").slice(0, 500), String(body.icon ?? "battery").slice(0, 40),
          body.sortOrder === undefined ? 99 : num(body.sortOrder, "Sort order", 0, 1000)],
      );
      await audit({ actor: ctx.admin?.email ?? "admin", action: "category.create", target: slug, ip: ctx.ip });
      sendJson(ctx, { ok: true, category: camel(rows[0]) }, 201);
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("A category with that slug already exists.");
      throw error;
    }
  });

  app.patch("/api/admin/categories/:slug", requireAdmin(), async (ctx: Ctx) => {
    const body = bodyOf(ctx);
    const allowed = ["name", "tagline", "description", "image", "icon", "sortOrder"] as const;
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [key, value] of Object.entries(body)) {
      if (!(allowed as readonly string[]).includes(key)) throw badRequest(`Unknown field: ${key}.`);
      const column = key.replace(/([A-Z])/g, (letter) => `_${letter.toLowerCase()}`);
      params.push(key === "sortOrder" ? num(value, key, 0, 1000) : String(value ?? "").slice(0, key === "description" ? 2000 : 500));
      sets.push(`${column} = $${params.length}`);
    }
    if (sets.length === 0) throw badRequest("Nothing to update.");
    params.push(ctx.params.slug);
    const rows = await query(`UPDATE categories SET ${sets.join(", ")} WHERE slug = $${params.length} RETURNING *`, params);
    if (rows.length === 0) throw notFound("Category not found.");
    await audit({ actor: ctx.admin?.email ?? "admin", action: "category.update", target: ctx.params.slug, ip: ctx.ip });
    sendJson(ctx, { ok: true, category: camel(rows[0]) });
  });

  app.delete("/api/admin/categories/:slug", requireAdmin(), async (ctx: Ctx) => {
    const used = await queryOne<{ count: string }>("SELECT count(*)::text AS count FROM products WHERE category_slug = $1", [ctx.params.slug]);
    if (Number(used?.count ?? 0) > 0) throw conflict("Move its products to another category first.");
    const deleted = await query("DELETE FROM categories WHERE slug = $1 RETURNING slug", [ctx.params.slug]);
    if (deleted.length === 0) throw notFound("Category not found.");
    await audit({ actor: ctx.admin?.email ?? "admin", action: "category.delete", target: ctx.params.slug, ip: ctx.ip });
    sendJson(ctx, { ok: true });
  });

  /* ---------------- uploads ---------------- */

  app.post("/api/admin/uploads", requireAdmin(), async (ctx: Ctx) => {
    const body = bodyOf(ctx);
    const raw = String(body.data ?? "");
    const base64 = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
    if (!base64) throw badRequest("No file data.");
    let buffer: Buffer;
    try {
      buffer = Buffer.from(base64, "base64");
    } catch {
      throw badRequest("That file could not be read.");
    }
    if (buffer.length === 0 || buffer.length > 4_000_000) throw badRequest("Images must be between 1 byte and 4 MB.");
    /* Magic bytes decide the type — the client-supplied name is ignored. SVG is rejected (script risk). */
    let ext: string | null = null;
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) ext = "jpg";
    else if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) ext = "png";
    else if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") ext = "webp";
    if (!ext) throw badRequest("Only JPG, PNG and WebP images are accepted.");
    const now = new Date();
    const dir = path.join(config.uploadDir, String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, "0"));
    mkdirSync(dir, { recursive: true });
    const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const full = path.join(dir, name);
    writeFileSync(full, buffer, { mode: 0o644 });
    const rel = path.relative(config.uploadDir, full).split(path.sep).join("/");
    await query("INSERT INTO media (path, mime, size_bytes) VALUES ($1,$2,$3)", [rel, `image/${ext === "jpg" ? "jpeg" : ext}`, buffer.length]);
    sendJson(ctx, { ok: true, url: `/uploads/${rel}`, size: buffer.length }, 201);
  });

  /* ---------------- promos ---------------- */

  app.get("/api/admin/promos", requireAdmin(), async (ctx: Ctx) => {
    const rows = await query("SELECT * FROM promos ORDER BY code");
    sendJson(ctx, { promos: rows.map((row) => camel(row)) });
  });

  app.post("/api/admin/promos", requireAdmin(), async (ctx: Ctx) => {
    const body = bodyOf(ctx);
    const code = text(body.code, "Code", 24).toUpperCase();
    if (!/^[A-Z0-9-]{2,24}$/.test(code)) throw badRequest("Code must be letters, numbers and dashes.");
    const type = String(body.type ?? "");
    if (!["percent", "flat", "shipping"].includes(type)) throw badRequest("Type must be percent, flat or shipping.");
    try {
      const rows = await query(
        `INSERT INTO promos (code, label, type, value, min_subtotal, max_discount, active, starts_at, ends_at, per_phone_limit)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          code, text(body.label, "Label", 120), type, num(body.value, "Value", 0, 100),
          body.minSubtotal === undefined ? 0 : num(body.minSubtotal, "Minimum subtotal", 0, 100_000_000),
          body.maxDiscount === null || body.maxDiscount === undefined ? null : num(body.maxDiscount, "Max discount", 0, 100_000_000),
          body.active !== false,
          body.startsAt ? new Date(String(body.startsAt)) : null,
          body.endsAt ? new Date(String(body.endsAt)) : null,
          body.perPhoneLimit === undefined ? 1 : num(body.perPhoneLimit, "Per-phone limit", 1, 100),
        ],
      );
      await audit({ actor: ctx.admin?.email ?? "admin", action: "promo.create", target: code, ip: ctx.ip });
      sendJson(ctx, { ok: true, promo: camel(rows[0]) }, 201);
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("A promo with that code already exists.");
      throw error;
    }
  });

  app.patch("/api/admin/promos/:code", requireAdmin(), async (ctx: Ctx) => {
    const body = bodyOf(ctx);
    const allowed = ["label", "type", "value", "minSubtotal", "maxDiscount", "active", "startsAt", "endsAt", "perPhoneLimit"] as const;
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [key, value] of Object.entries(body)) {
      if (!(allowed as readonly string[]).includes(key)) throw badRequest(`Unknown field: ${key}.`);
      const column = key.replace(/([A-Z])/g, (letter) => `_${letter.toLowerCase()}`);
      if (key === "type" && !["percent", "flat", "shipping"].includes(String(value))) throw badRequest("Invalid promo type.");
      if (key === "active" && typeof value !== "boolean") throw badRequest("active must be true or false.");
      if (["startsAt", "endsAt"].includes(key)) params.push(value ? new Date(String(value)) : null);
      else if (key === "maxDiscount" && value === null) params.push(null);
      else if (typeof value === "number" || typeof value === "string") {
        params.push(["value", "minSubtotal", "maxDiscount", "perPhoneLimit"].includes(key) ? num(value, key, 0, 100_000_000) : String(value).slice(0, 200));
      } else params.push(value);
      sets.push(`${column} = $${params.length}`);
    }
    if (sets.length === 0) throw badRequest("Nothing to update.");
    params.push(ctx.params.code.toUpperCase());
    const rows = await query(`UPDATE promos SET ${sets.join(", ")} WHERE code = $${params.length} RETURNING *`, params);
    if (rows.length === 0) throw notFound("Promo not found.");
    await audit({ actor: ctx.admin?.email ?? "admin", action: "promo.update", target: ctx.params.code, ip: ctx.ip });
    sendJson(ctx, { ok: true, promo: camel(rows[0]) });
  });

  app.delete("/api/admin/promos/:code", requireAdmin(), async (ctx: Ctx) => {
    const deleted = await query("DELETE FROM promos WHERE code = $1 RETURNING code", [ctx.params.code.toUpperCase()]);
    if (deleted.length === 0) throw notFound("Promo not found.");
    await audit({ actor: ctx.admin?.email ?? "admin", action: "promo.delete", target: ctx.params.code, ip: ctx.ip });
    sendJson(ctx, { ok: true });
  });

  /* ---------------- reviews ---------------- */

  app.get("/api/admin/reviews", requireAdmin(), async (ctx: Ctx) => {
    const { page, limit, offset } = pageParams(ctx, 50, 200);
    const conditions: string[] = [];
    const params: unknown[] = [];
    const product = ctx.query.get("product");
    if (product) {
      params.push(product);
      conditions.push(`r.product_slug = $${params.length}`);
    }
    const visible = ctx.query.get("visible");
    if (visible === "true" || visible === "false") {
      params.push(visible === "true");
      conditions.push(`r.visible = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const total = await queryOne<{ count: string }>(`SELECT count(*)::text AS count FROM reviews r ${where}`, params);
    const rows = await query(
      `SELECT r.*, p.name AS product_name FROM reviews r LEFT JOIN products p ON p.slug = r.product_slug
       ${where} ORDER BY r.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    sendJson(ctx, {
      reviews: rows.map((row) => camel(row)),
      total: Number(total?.count ?? 0),
      page,
      pageCount: Math.max(1, Math.ceil(Number(total?.count ?? 0) / limit)),
    });
  });

  async function recalcRating(slug: string): Promise<void> {
    await query(
      `UPDATE products SET rating = COALESCE((SELECT AVG(rating) FROM reviews WHERE product_slug = $1 AND visible = TRUE), 0),
       review_count = (SELECT COUNT(*) FROM reviews WHERE product_slug = $1 AND visible = TRUE) WHERE slug = $1`,
      [slug],
    );
  }

  app.patch("/api/admin/reviews/:id", requireAdmin(), async (ctx: Ctx) => {
    const body = bodyOf(ctx);
    if (typeof body.visible !== "boolean") throw badRequest("visible must be true or false.");
    const rows = await query("UPDATE reviews SET visible = $1 WHERE id = $2 RETURNING *", [body.visible, Number(ctx.params.id)]);
    if (rows.length === 0) throw notFound("Review not found.");
    await recalcRating(rows[0].product_slug as string);
    await audit({ actor: ctx.admin?.email ?? "admin", action: "review.moderate", target: String(ctx.params.id), ip: ctx.ip });
    sendJson(ctx, { ok: true, review: camel(rows[0]) });
  });

  app.delete("/api/admin/reviews/:id", requireAdmin(), async (ctx: Ctx) => {
    const rows = await query("DELETE FROM reviews WHERE id = $1 RETURNING product_slug", [Number(ctx.params.id)]);
    if (rows.length === 0) throw notFound("Review not found.");
    await recalcRating(rows[0].product_slug as string);
    await audit({ actor: ctx.admin?.email ?? "admin", action: "review.delete", target: String(ctx.params.id), ip: ctx.ip });
    sendJson(ctx, { ok: true });
  });

  /* ---------------- settings / blocklist / spend ---------------- */

  app.get("/api/admin/settings", requireAdmin(), requireOwner(), async (ctx: Ctx) => {
    sendJson(ctx, { settings: await getSettings() });
  });

  app.patch("/api/admin/settings", requireAdmin(), requireOwner(), async (ctx: Ctx) => {
    const updated = await updateSettings(bodyOf(ctx));
    await audit({ actor: ctx.admin?.email ?? "admin", action: "settings.update", ip: ctx.ip });
    sendJson(ctx, { ok: true, settings: updated });
  });

  app.get("/api/admin/blocklist", requireAdmin(), async (ctx: Ctx) => {
    const rows = await query("SELECT * FROM blocklist ORDER BY created_at DESC");
    sendJson(ctx, { blocklist: rows.map((row) => camel(row)) });
  });

  app.post("/api/admin/blocklist", requireAdmin(), async (ctx: Ctx) => {
    const body = bodyOf(ctx);
    const phone = normalizePhone(body.phone);
    if (!isValidBDPhone(phone)) throw badRequest("Enter a valid 11-digit Bangladeshi mobile number.");
    const reason = String(body.reason ?? "").slice(0, 200);
    await query("INSERT INTO blocklist (phone, reason) VALUES ($1,$2) ON CONFLICT (phone) DO UPDATE SET reason = $2", [phone, reason]);
    await audit({ actor: ctx.admin?.email ?? "admin", action: "blocklist.add", target: phone, ip: ctx.ip });
    sendJson(ctx, { ok: true }, 201);
  });

  app.delete("/api/admin/blocklist/:phone", requireAdmin(), async (ctx: Ctx) => {
    await query("DELETE FROM blocklist WHERE phone = $1", [normalizePhone(ctx.params.phone)]);
    await audit({ actor: ctx.admin?.email ?? "admin", action: "blocklist.remove", target: ctx.params.phone, ip: ctx.ip });
    sendJson(ctx, { ok: true });
  });

  app.get("/api/admin/spend", requireAdmin(), async (ctx: Ctx) => {
    const days = qint(ctx.query.get("days"), 42, 1, 365);
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const rows = await query("SELECT * FROM ad_spend WHERE date >= $1 ORDER BY date DESC", [since]);
    sendJson(ctx, { spend: rows.map((row) => camel(row)) });
  });

  app.post("/api/admin/spend", requireAdmin(), async (ctx: Ctx) => {
    const body = bodyOf(ctx);
    const date = String(body.date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest("Date must be YYYY-MM-DD.");
    const channel = String(body.channel ?? "");
    if (!["meta", "google", "tiktok", "other"].includes(channel)) throw badRequest("Unknown channel.");
    const amount = num(body.amount, "Amount", 0, 100_000_000);
    if (amount === 0) {
      await query("DELETE FROM ad_spend WHERE date = $1 AND channel = $2", [date, channel]);
    } else {
      await query(
        "INSERT INTO ad_spend (date, channel, amount) VALUES ($1,$2,$3) ON CONFLICT (date, channel) DO UPDATE SET amount = $3",
        [date, channel, amount],
      );
    }
    sendJson(ctx, { ok: true });
  });

  /* ---------------- outbox / carts / customers / events ---------------- */

  app.get("/api/admin/outbox", requireAdmin(), async (ctx: Ctx) => {
    const { page, limit, offset } = pageParams(ctx, 50, 200);
    const status = ctx.query.get("status");
    const where = status ? "WHERE status = $1" : "";
    const params = status ? [status] : [];
    const total = await queryOne<{ count: string }>(`SELECT count(*)::text AS count FROM notifications ${where}`, params);
    const rows = await query(
      `SELECT * FROM notifications ${where} ORDER BY id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    sendJson(ctx, {
      messages: rows.map((row) => camel(row)),
      total: Number(total?.count ?? 0),
      page,
      pageCount: Math.max(1, Math.ceil(Number(total?.count ?? 0) / limit)),
    });
  });

  app.post("/api/admin/outbox/flush", requireAdmin(), async (ctx: Ctx) => {
    const result = await flushOutbox(200);
    await audit({ actor: ctx.admin?.email ?? "admin", action: "outbox.flush", ip: ctx.ip });
    sendJson(ctx, { ok: true, ...result });
  });

  app.get("/api/admin/carts", requireAdmin(), async (ctx: Ctx) => {
    const { page, limit, offset } = pageParams(ctx, 50, 200);
    const recovered = ctx.query.get("recovered");
    const where = recovered === "true" ? "WHERE recovered = TRUE" : recovered === "false" ? "WHERE recovered = FALSE" : "";
    const total = await queryOne<{ count: string }>(`SELECT count(*)::text AS count FROM abandoned_carts ${where}`);
    const rows = await query(`SELECT * FROM abandoned_carts ${where} ORDER BY updated_at DESC LIMIT $1 OFFSET $2`, [limit, offset]);
    sendJson(ctx, {
      carts: rows.map((row) => camel(row)),
      total: Number(total?.count ?? 0),
      page,
      pageCount: Math.max(1, Math.ceil(Number(total?.count ?? 0) / limit)),
    });
  });

  app.post("/api/admin/carts/:id/remind", requireAdmin(), async (ctx: Ctx) => {
    const cart = await queryOne<{ id: string; phone: string; customer_name: string | null; items: unknown; value: number }>(
      "SELECT * FROM abandoned_carts WHERE id = $1", [ctx.params.id],
    );
    if (!cart) throw notFound("Cart not found.");
    const settings = await getSettings();
    const items = Array.isArray(cart.items) ? cart.items : [];
    const { cartRecoveryMessage: recovery } = await import("./notify.js");
    const message = recovery(cart.customer_name ?? "", items.length, cart.value, settings.identity.name, settings.identity.domain);
    const result = await sendSms(settings, cart.phone, message);
    await query(
      "INSERT INTO notifications (channel, recipient, template, subject, body, status, provider_message_id, error, sent_at) VALUES ('sms',$1,'abandoned_cart','Your bag is waiting',$2,$3,$4,$5, CASE WHEN $3='sent' THEN NOW() ELSE NULL END)",
      [cart.phone, message, result.ok ? "sent" : "failed", result.id ?? null, result.error ?? null],
    );
    await query("UPDATE abandoned_carts SET reminded_at = NOW() WHERE id = $1", [cart.id]);
    await audit({ actor: ctx.admin?.email ?? "admin", action: "cart.remind", target: cart.id, ip: ctx.ip });
    sendJson(ctx, { ok: result.ok, message: result.ok ? "Reminder sent." : result.error ?? "Could not send." });
  });

  app.post("/api/admin/carts/:id/recovered", requireAdmin(), async (ctx: Ctx) => {
    await query("UPDATE abandoned_carts SET recovered = TRUE WHERE id = $1", [ctx.params.id]);
    sendJson(ctx, { ok: true });
  });

  app.delete("/api/admin/carts/:id", requireAdmin(), async (ctx: Ctx) => {
    await query("DELETE FROM abandoned_carts WHERE id = $1", [ctx.params.id]);
    sendJson(ctx, { ok: true });
  });

  app.get("/api/admin/customers", requireAdmin(), async (ctx: Ctx) => {
    const { page, limit, offset } = pageParams(ctx, 50, 200);
    const q = (ctx.query.get("q") ?? "").trim();
    const where = q ? "WHERE phone ILIKE $1 OR customer_name ILIKE $1" : "";
    const params: unknown[] = q ? [`%${q.replace(/[%_]/g, "")}%`] : [];
    const total = await queryOne<{ count: string }>(`SELECT COUNT(DISTINCT phone)::text AS count FROM orders ${where}`, params);
    const rows = await query(
      `SELECT phone, (array_agg(customer_name ORDER BY created_at DESC))[1] AS name,
        COUNT(*)::int AS orders,
        SUM(CASE WHEN status = ANY('{confirmed,packing,shipped,delivered}') THEN total ELSE 0 END)::int AS spend,
        MAX(created_at) AS last_order
       FROM orders ${where} GROUP BY phone ORDER BY spend DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    sendJson(ctx, {
      customers: rows.map((row) => camel(row)),
      total: Number(total?.count ?? 0),
      page,
      pageCount: Math.max(1, Math.ceil(Number(total?.count ?? 0) / limit)),
    });
  });

  app.get("/api/admin/events", requireAdmin(), async (ctx: Ctx) => {
    const { page, limit, offset } = pageParams(ctx, 100, 200);
    const name = ctx.query.get("name");
    const where = name ? "WHERE name = $1" : "";
    const params = name ? [name] : [];
    const total = await queryOne<{ count: string }>(`SELECT count(*)::text AS count FROM tracked_events ${where}`, params);
    const rows = await query(
      `SELECT * FROM tracked_events ${where} ORDER BY id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    sendJson(ctx, {
      events: rows.map((row) => camel(row)),
      total: Number(total?.count ?? 0),
      page,
      pageCount: Math.max(1, Math.ceil(Number(total?.count ?? 0) / limit)),
    });
  });

  /* ---------------- exports ---------------- */

  app.get("/api/admin/export/orders.csv", requireAdmin(), async (ctx: Ctx) => {
    const status = ctx.query.get("status");
    const where = status && status !== "all" ? "WHERE o.status = $1" : "";
    const params = status && status !== "all" ? [status] : [];
    const rows = await query(
      `SELECT o.order_number, o.created_at, o.status, o.payment_method, o.customer_name, o.phone, o.email,
        o.district, o.address, o.promo_code, o.subtotal, o.shipping, o.discount, o.total,
        i.slug AS sku, i.name AS item, i.qty, i.unit_price,
        (SELECT trx_id FROM payments p WHERE p.order_number = o.order_number ORDER BY p.id DESC LIMIT 1) AS trx_id,
        o.courier_consignment, a.source, a.campaign
       FROM orders o LEFT JOIN order_items i ON i.order_id = o.id
       LEFT JOIN order_attribution a ON a.order_number = o.order_number
       ${where} ORDER BY o.created_at DESC LIMIT 10000`,
      params,
    );
    csv(ctx, `orders-${new Date().toISOString().slice(0, 10)}.csv`, rows as Array<Record<string, unknown>>);
  });

  app.get("/api/admin/export/manifest.csv", requireAdmin(), async (ctx: Ctx) => {
    const rows = await query(
      `SELECT order_number AS invoice, customer_name AS name, phone,
        (address || ', ' || district) AS address,
        CASE WHEN payment_method = 'cod' AND status <> 'delivered' THEN total ELSE 0 END AS cod_amount,
        notes AS note FROM orders WHERE status IN ('confirmed','packing') ORDER BY created_at ASC`,
    );
    csv(ctx, `courier-manifest-${new Date().toISOString().slice(0, 10)}.csv`, rows as Array<Record<string, unknown>>);
  });

  app.get("/api/admin/export/catalogue.csv", requireAdmin(), async (ctx: Ctx) => {
    const settings = await getSettings();
    const rows = await query("SELECT * FROM products WHERE visible = TRUE ORDER BY slug");
    csv(ctx, `meta-catalogue-${new Date().toISOString().slice(0, 10)}.csv`, rows.map((row) => {
      const product = row as unknown as {
        slug: string; name: string; short_description: string; stock: number; price: number; brand: string; images: unknown;
      };
      const images = Array.isArray(product.images) ? product.images : [];
      return {
        id: product.slug,
        title: product.name,
        description: product.short_description,
        availability: product.stock > 0 ? "in stock" : "out of stock",
        condition: "new",
        price: `${product.price} BDT`,
        link: `https://${settings.identity.domain}/product/${product.slug}`,
        image_link: images[0] ?? "",
        brand: product.brand,
        google_product_category: "Electronics > Electronics Accessories > Power > Batteries",
      };
    }));
  });

  /* ---------------- audit + users ---------------- */

  app.get("/api/admin/audit", requireAdmin(), requireOwner(), async (ctx: Ctx) => {
    const { page, limit, offset } = pageParams(ctx, 100, 200);
    const total = await queryOne<{ count: string }>("SELECT count(*)::text AS count FROM audit_log");
    const rows = await query("SELECT * FROM audit_log ORDER BY id DESC LIMIT $1 OFFSET $2", [limit, offset]);
    sendJson(ctx, {
      entries: rows.map((row) => camel(row)),
      total: Number(total?.count ?? 0),
      page,
      pageCount: Math.max(1, Math.ceil(Number(total?.count ?? 0) / limit)),
    });
  });

  app.get("/api/admin/users", requireAdmin(), requireOwner(), async (ctx: Ctx) => {
    const rows = await query("SELECT id, email, role, active, created_at FROM admin_users ORDER BY id");
    sendJson(ctx, { users: rows.map((row) => camel(row)) });
  });

  app.post("/api/admin/users", requireAdmin(), requireOwner(), async (ctx: Ctx) => {
    const body = bodyOf(ctx);
    const email = String(body.email ?? "").trim().toLowerCase().slice(0, 160);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest("That email does not look right.");
    const password = String(body.password ?? "");
    if (password.length < 12) throw badRequest("Use at least 12 characters for the password.");
    const role = String(body.role ?? "staff");
    if (!["owner", "staff"].includes(role)) throw badRequest("Role must be owner or staff.");
    try {
      const rows = await query(
        "INSERT INTO admin_users (email, password_hash, role) VALUES ($1,$2,$3) RETURNING id, email, role, active, created_at",
        [email, await hashPassword(password), role],
      );
      await audit({ actor: ctx.admin?.email ?? "admin", action: "user.create", target: email, ip: ctx.ip });
      sendJson(ctx, { ok: true, user: camel(rows[0]) }, 201);
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("An account with that email already exists.");
      throw error;
    }
  });

  app.patch("/api/admin/users/:id", requireAdmin(), requireOwner(), async (ctx: Ctx) => {
    const body = bodyOf(ctx);
    const id = Number(ctx.params.id);
    const target = await queryOne<{ email: string; role: string }>("SELECT email, role FROM admin_users WHERE id = $1", [id]);
    if (!target) throw notFound("Account not found.");
    const self = target.email.toLowerCase() === (ctx.admin?.email ?? "").toLowerCase();
    if (body.role !== undefined) {
      const role = String(body.role);
      if (!["owner", "staff"].includes(role)) throw badRequest("Role must be owner or staff.");
      if (self && role !== "owner") throw forbidden("You cannot demote your own account.");
      if (target.role === "owner" && role !== "owner") {
        const owners = await queryOne<{ count: string }>("SELECT count(*)::text AS count FROM admin_users WHERE role = 'owner' AND active = TRUE");
        if (Number(owners?.count ?? 0) <= 1) throw forbidden("The store must keep at least one active owner.");
      }
      await query("UPDATE admin_users SET role = $1 WHERE id = $2", [role, id]);
    }
    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") throw badRequest("active must be true or false.");
      if (self && body.active === false) throw forbidden("You cannot deactivate your own account.");
      await query("UPDATE admin_users SET active = $1 WHERE id = $2", [body.active, id]);
    }
    if (body.password !== undefined) {
      const password = String(body.password);
      if (password.length < 12) throw badRequest("Use at least 12 characters for the password.");
      await query("UPDATE admin_users SET password_hash = $1 WHERE id = $2", [await hashPassword(password), id]);
    }
    await audit({ actor: ctx.admin?.email ?? "admin", action: "user.update", target: target.email, ip: ctx.ip });
    const updated = await queryOne("SELECT id, email, role, active, created_at FROM admin_users WHERE id = $1", [id]);
    sendJson(ctx, { ok: true, user: updated ? camel(updated) : null });
  });

  app.delete("/api/admin/users/:id", requireAdmin(), requireOwner(), async (ctx: Ctx) => {
    const id = Number(ctx.params.id);
    const target = await queryOne<{ email: string; role: string }>("SELECT email, role FROM admin_users WHERE id = $1", [id]);
    if (!target) throw notFound("Account not found.");
    if (target.email.toLowerCase() === (ctx.admin?.email ?? "").toLowerCase()) throw forbidden("You cannot delete your own account.");
    if (target.role === "owner") {
      const owners = await queryOne<{ count: string }>("SELECT count(*)::text AS count FROM admin_users WHERE role = 'owner' AND active = TRUE");
      if (Number(owners?.count ?? 0) <= 1) throw forbidden("The store must keep at least one active owner.");
    }
    await query("DELETE FROM admin_users WHERE id = $1", [id]);
    await audit({ actor: ctx.admin?.email ?? "admin", action: "user.delete", target: target.email, ip: ctx.ip });
    sendJson(ctx, { ok: true });
  });
}

void forbidden;
