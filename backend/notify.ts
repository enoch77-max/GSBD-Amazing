/**
 * Customer messaging: every SMS/email the shop sends is written to the
 * notifications outbox first, then delivered when a provider is configured.
 * Nothing is ever lost silently — undeliverable rows stay visible as queued.
 */
import { query, tx } from "./db";
import { restorePackComponents } from "./inventory";
import { getSettings, type StoreSettings } from "./settings";
import { sendSms } from "./providers";

export function formatTaka(value: number): string {
  return `৳${Math.round(value).toLocaleString("en-IN")}`;
}

type OrderRow = {
  order_number: string;
  customer_name: string;
  phone: string;
  email: string | null;
  total: number;
  payment_method: string;
  courier_consignment: string | null;
};

export async function queueSms(input: {
  to: string; template: string; subject: string; body: string; orderNumber?: string;
}): Promise<number> {
  const rows = await query<{ id: number }>(
    "INSERT INTO notifications (channel, recipient, template, subject, body, order_number, status) VALUES ('sms',$1,$2,$3,$4,$5,'queued') RETURNING id",
    [input.to, input.template, input.subject, input.body, input.orderNumber ?? null],
  );
  return rows[0].id;
}

export async function queueEmail(input: {
  to: string; template: string; subject: string; body: string; orderNumber?: string;
}): Promise<number> {
  const rows = await query<{ id: number }>(
    "INSERT INTO notifications (channel, recipient, template, subject, body, order_number, status) VALUES ('email',$1,$2,$3,$4,$5,'queued') RETURNING id",
    [input.to, input.template, input.subject, input.body, input.orderNumber ?? null],
  );
  return rows[0].id;
}

export function otpMessage(code: string, shopName: string): string {
  return `${code} is your ${shopName} verification code. It expires in 10 minutes.`;
}

export function confirmationMessage(order: OrderRow, items: string, shopName: string, domain: string): string {
  const first = order.customer_name.split(" ")[0];
  const method = order.payment_method === "cod" ? "cash on delivery" : "paid";
  return `Hi ${first}, thanks for your order ${order.order_number} at ${shopName}. ${items}. Total ${formatTaka(order.total)} (${method}). Track any time at ${domain}/track — ${shopName}`;
}

export function statusMessage(order: OrderRow, status: string, note: string, shopName: string): string | null {
  const first = order.customer_name.split(" ")[0];
  switch (status) {
    case "confirmed": return `Hi ${first}, order ${order.order_number} is confirmed. We'll message you when it ships. — ${shopName}`;
    case "packing": return `Hi ${first}, we're testing and packing order ${order.order_number} now. — ${shopName}`;
    case "shipped": {
      const tracking = order.courier_consignment ? ` (${order.courier_consignment})` : "";
      return `Hi ${first}, order ${order.order_number} is with the courier${tracking}. — ${shopName}`;
    }
    case "delivered": return `Hi ${first}, order ${order.order_number} is delivered. Need a hand with the build? Just reply. — ${shopName}`;
    case "cancelled": return `Hi ${first}, order ${order.order_number} was cancelled.${note ? ` ${note}.` : ""} Any payment is refunded in 3–5 working days. — ${shopName}`;
    case "returned": return `Hi ${first}, order ${order.order_number} came back to us. We'll be in touch about the refund. — ${shopName}`;
    default: return null;
  }
}

export function cartRecoveryMessage(name: string, count: number, value: number, shopName: string, domain: string): string {
  const first = name.split(" ")[0] || "there";
  return `Hi ${first}, you left ${count} item(s) worth ${formatTaka(value)} in your bag at ${shopName}. Your cells are still reserved: ${domain}/checkout`;
}

/** Attempts delivery of every queued row. Safe to run on a schedule. */
export async function flushOutbox(limit = 100): Promise<{ sent: number; failed: number; skipped: number }> {
  const settings = await getSettings();
  const rows = await query<{ id: number; channel: string; recipient: string; body: string }>(
    "SELECT id, channel, recipient, body FROM notifications WHERE status = 'queued' ORDER BY id ASC LIMIT $1",
    [limit],
  );
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const row of rows) {
    if (row.channel === "email") {
      await query("UPDATE notifications SET status = 'skipped', error = $2 WHERE id = $1", [
        row.id, "Email provider is not connected. Connect one to send receipts by email.",
      ]);
      skipped += 1;
      continue;
    }
    const result = await sendSms(settings, row.recipient, row.body);
    if (result.ok) {
      await query("UPDATE notifications SET status = 'sent', provider_message_id = $2, sent_at = NOW(), error = NULL WHERE id = $1", [
        row.id, result.id ?? null,
      ]);
      sent += 1;
    } else if (result.error === "No SMS provider configured.") {
      await query("UPDATE notifications SET status = 'skipped', error = $2 WHERE id = $1", [row.id, result.error]);
      skipped += 1;
    } else {
      await query("UPDATE notifications SET status = 'failed', error = $2 WHERE id = $1", [row.id, result.error ?? "Send failed."]);
      failed += 1;
    }
  }
  return { sent, failed, skipped };
}

/** Sends one recovery SMS per stale bag; each bag is reminded exactly once. */
export async function sendDueCartReminders(afterMinutes: number): Promise<number> {
  const settings: StoreSettings = await getSettings();
  if (!settings.notifications.abandonedCart) return 0;
  const rows = await query<{ id: string; phone: string; customer_name: string | null; items: unknown; value: number }>(
    `SELECT id, phone, customer_name, items, value FROM abandoned_carts
     WHERE recovered = FALSE AND reminded_at IS NULL AND updated_at < NOW() - ($1 || ' minutes')::interval
     ORDER BY updated_at ASC LIMIT 100`,
    [afterMinutes],
  );
  let sent = 0;
  for (const row of rows) {
    const items = Array.isArray(row.items) ? row.items : [];
    const message = cartRecoveryMessage(
      row.customer_name ?? "", items.length, row.value,
      settings.identity.name, settings.identity.domain,
    );
    const result = await sendSms(settings, row.phone, message);
    await query(
      `INSERT INTO notifications (channel, recipient, template, subject, body, status, provider_message_id, error, sent_at)
       VALUES ('sms',$1,'abandoned_cart','Your bag is waiting',$2,$3,$4,$5, CASE WHEN $3 = 'sent' THEN NOW() ELSE NULL END)`,
      [row.phone, message, result.ok ? "sent" : "failed", result.id ?? null, result.error ?? null],
    );
    await query("UPDATE abandoned_carts SET reminded_at = NOW() WHERE id = $1", [row.id]);
    if (result.ok) sent += 1;
  }
  return sent;
}

/** Unpaid pending orders older than the window are cancelled and restocked. */
export async function expirePendingOrders(maxAgeHours = 24): Promise<number> {
  const rows = await query<{ id: number; order_number: string }>(
    "SELECT id, order_number FROM orders WHERE status = 'pending' AND created_at < NOW() - ($1 || ' hours')::interval LIMIT 200",
    [maxAgeHours],
  );
  for (const row of rows) {
    await tx(async (client) => {
      const cancelled = await client.query("UPDATE orders SET status = 'cancelled' WHERE id = $1 AND status = 'pending' RETURNING id", [row.id]);
      if (cancelled.rowCount !== 1) return;
      await client.query(
        `UPDATE products SET stock = stock + item.qty
         FROM (SELECT slug, SUM(qty)::integer AS qty FROM order_items WHERE order_id = $1 AND pack_spec IS NULL GROUP BY slug) AS item
         WHERE products.slug = item.slug`,
        [row.id],
      );
      await restorePackComponents(client, row.id);
      await client.query(
        "INSERT INTO order_events (order_number, status, label, actor) VALUES ($1,'cancelled','Expired — payment never completed','system')",
        [row.order_number],
      );
    });
  }
  return rows.length;
}

/** Fire-and-forget delivery that can never crash or slow a request handler. */
export function deliverSoon(promise: Promise<unknown>): void {
  void promise.catch((error: unknown) => console.error("[notify] background delivery failed", error));
}
