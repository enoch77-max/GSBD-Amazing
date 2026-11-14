/**
 * Operations service — the layer the merchant console drives.
 *
 * Order lifecycle, fraud screening, courier booking, customer messaging,
 * reporting and exports. The preview runs it against the local tables; the same
 * functions are what `src/app/api/admin/**` call against Postgres in production.
 */
import { store } from "@/db/local-store";
import type { AdminUser } from "@/db/ops-store";
import { BUILTIN_ROLES, SECTION_ACCESS, allRoles, findRole, roleHas, sanitizePermissions, type AdminRole, type Permission } from "@/lib/admin-access";
import { ops, type OrderEvent, type OrderPatch, type OrderStatus, type OutboxMessage, type PaymentStatus } from "@/db/ops-store";
import type { Order, OrderItem, Product } from "@/db/schema";
import { formatBDT } from "./format";
import { STORE } from "./commerce";
import { isSampleOrder, sampleSpend, sampleTrading } from "@/db/sample-trading";

export type MerchantOrder = Omit<Order, "status" | "notes"> & {
  status: OrderStatus;
  /** The customer's delivery note, preserved from the order row. */
  customerNote: string | null;
  items: OrderItem[];
  events: OrderEvent[];
  notes: Array<{ id: string; at: string; body: string; actor: string }>;
  paymentStatus: PaymentStatus;
  trxId?: string;
  courier?: { provider: string; consignmentId: string; trackingUrl: string; bookedAt: string };
  attribution?: import("@/db/ops-store").Attribution;
  riskFlags: string[];
  otpVerified?: boolean;
  refundAmount?: number;
  serials: string[];
  trackingNumber?: string;
  hold?: { on: boolean; reason?: string; at: string };
  warranty?: { status: "open" | "resolved"; issue: string; openedAt: string; resolvedAt?: string };
  fulfilledAt?: string;
};

export const STATUS_FLOW: OrderStatus[] = ["pending", "confirmed", "packing", "shipped", "delivered"];

export const STATUS_META: Record<OrderStatus, { label: string; tone: string; dot: string }> = {
  pending: { label: "Awaiting payment", tone: "bg-amber-100 text-amber-900 border-amber-300", dot: "#b45309" },
  confirmed: { label: "Confirmed", tone: "bg-lime-100 text-lime-900 border-lime-300", dot: "#4d7c0f" },
  packing: { label: "Packing", tone: "bg-sky-100 text-sky-900 border-sky-300", dot: "#0369a1" },
  shipped: { label: "Shipped", tone: "bg-indigo-100 text-indigo-900 border-indigo-300", dot: "#4338ca" },
  delivered: { label: "Delivered", tone: "bg-emerald-100 text-emerald-900 border-emerald-300", dot: "#047857" },
  cancelled: { label: "Cancelled", tone: "bg-stone-200 text-stone-700 border-stone-300", dot: "#57534e" },
  returned: { label: "Returned", tone: "bg-rose-100 text-rose-900 border-rose-300", dot: "#be123c" },
};

export const PAYMENT_META: Record<PaymentStatus, { label: string; tone: string }> = {
  unpaid: { label: "Unpaid", tone: "text-stone-500" },
  authorised: { label: "Claimed", tone: "text-amber-700" },
  paid: { label: "Paid", tone: "text-emerald-700" },
  failed: { label: "Failed", tone: "text-rose-700" },
  refunded: { label: "Refunded", tone: "text-indigo-700" },
  cod_due: { label: "COD due", tone: "text-sky-700" },
};

function seedPaymentStatus(order: Order): PaymentStatus {
  if (order.paymentMethod === "cod") return order.status === "delivered" ? "paid" : "cod_due";
  return "paid";
}

function seedEvents(order: Order): OrderEvent[] {
  const reached = STATUS_FLOW.indexOf(order.status as OrderStatus);
  const upto = reached < 0 ? 1 : reached;
  return STATUS_FLOW.slice(0, upto + 1).map((status, index) => ({
    id: `${order.orderNumber}-seed-${index}`,
    at: new Date(order.createdAt.getTime() + index * 5 * 3600000).toISOString(),
    status,
    label: STATUS_META[status].label,
    actor: "system",
  }));
}

/** The live order book plus the generated sample history, when it is enabled. */
function orderRows(): Order[] {
  return ops.state.sampleData ? [...sampleTrading().orders, ...store.tables.orders] : store.tables.orders;
}

function itemRows(): OrderItem[] {
  return ops.state.sampleData ? [...sampleTrading().items, ...store.tables.orderItems] : store.tables.orderItems;
}

/** Sample spend is the baseline; anything the merchant logs overrides that day. */
export function allSpend(): Array<{ date: string; channel: string; amount: number }> {
  const overrides = new Set(ops.state.adSpend.map((row) => `${row.date}|${row.channel}`));
  const base = ops.state.sampleData ? sampleSpend().filter((row) => !overrides.has(`${row.date}|${row.channel}`)) : [];
  return [...base, ...ops.state.adSpend];
}

/** Merges the immutable order row with everything the operator has done to it. */
export function decorateOrder(order: Order): MerchantOrder {
  const sample = ops.state.sampleData ? sampleTrading().patches[order.orderNumber] : undefined;
  const stored = ops.state.orderPatches[order.orderNumber];
  const patch: OrderPatch = {
    ...sample,
    ...stored,
    events: stored?.events?.length ? stored.events : (sample?.events ?? []),
    notes: stored?.notes ?? sample?.notes ?? [],
    riskFlags: stored?.riskFlags?.length ? stored.riskFlags : (sample?.riskFlags ?? []),
    attribution: stored?.attribution ?? sample?.attribution,
    courier: stored?.courier ?? sample?.courier,
  };
  const items = itemRows().filter((item) => item.orderId === order.id);
  const flags = patch.riskFlags.length ? patch.riskFlags : sample ? [] : screenOrder(order, items);
  return {
    ...order,
    status: (patch.status ?? order.status) as OrderStatus,
    customerNote: order.notes,
    items,
    events: patch.events.length ? patch.events : seedEvents(order),
    notes: patch.notes,
    paymentStatus: patch.paymentStatus ?? seedPaymentStatus(order),
    trxId: patch.trxId,
    courier: patch.courier,
    attribution: patch.attribution,
    riskFlags: flags,
    otpVerified: patch.otpVerified,
    refundAmount: patch.refundAmount,
    serials: Array.isArray(patch.serials) ? patch.serials : [],
    trackingNumber: patch.trackingNumber,
    hold: patch.hold,
    warranty: patch.warranty,
    fulfilledAt: patch.fulfilledAt,
  };
}

export function listOrders(): MerchantOrder[] {
  return orderRows().map(decorateOrder).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function findOrder(orderNumber: string): MerchantOrder | null {
  const needle = orderNumber.trim().toLowerCase();
  const row = orderRows().find((order) => order.orderNumber.toLowerCase() === needle);
  return row ? decorateOrder(row) : null;
}

export { isSampleOrder };

/* ---------------------------------------------------------------- */
/* Risk screening                                                    */
/* ---------------------------------------------------------------- */

type Screenable = Pick<Order, "phone" | "total" | "paymentMethod" | "address">;

export function screenOrder(order: Screenable, items: Array<Pick<OrderItem, "qty">>): string[] {
  const { risk } = ops.state.settings;
  const flags: string[] = [];
  const phone = order.phone.replace(/[\s-]/g, "");
  const history = store.tables.orders.filter((entry) => entry.phone.replace(/[\s-]/g, "") === phone);

  if (history.length > risk.maxOrdersPerPhonePerDay) {
    const today = history.filter((entry) => Date.now() - entry.createdAt.getTime() < 86400000);
    if (today.length > risk.maxOrdersPerPhonePerDay) flags.push(`${today.length} orders from this number in 24h`);
  }
  const cancelled = history.filter((entry) => {
    const status = ops.getOrderPatch(entry.orderNumber).status ?? entry.status;
    return status === "cancelled" || status === "returned";
  }).length;
  if (cancelled >= risk.codStrikeLimit && order.paymentMethod === "cod") {
    flags.push(`${cancelled} previous refusals — take advance`);
  }
  if (order.total > risk.maxOrderValue) flags.push("Above high-value threshold — call to confirm");
  if (order.paymentMethod === "cod" && order.total > ops.state.settings.shipping.codMaxOrder) flags.push("COD above the allowed ceiling");
  if (order.address.trim().length < 18) flags.push("Address looks incomplete");
  if (items.some((item) => item.qty >= 10)) flags.push("Bulk quantity — verify reseller");
  return flags;
}

/* ---------------------------------------------------------------- */
/* Lifecycle                                                         */
/* ---------------------------------------------------------------- */

const NEXT_LABEL: Record<OrderStatus, string> = {
  pending: "Payment pending",
  confirmed: "Order confirmed",
  packing: "Packing at the bench",
  shipped: "Handed to courier",
  delivered: "Delivered",
  cancelled: "Order cancelled",
  returned: "Returned to shop",
};

export function advanceStatus(orderNumber: string, status: OrderStatus, note?: string, actor = "admin"): MerchantOrder | null {
  const actorName = currentAdmin()?.name;
  if (actorName) actor = actorName;
  audit("Changed order status", orderNumber, `→ ${status}${note ? ` · ${note}` : ""}`);
  const order = findOrder(orderNumber);
  if (!order) return null;
  const patch = ops.getOrderPatch(orderNumber);
  const event: OrderEvent = {
    id: ops.uid(),
    at: new Date().toISOString(),
    status,
    label: NEXT_LABEL[status],
    note,
    actor,
  };

  const nextPayment: PaymentStatus | undefined =
    status === "delivered" && order.paymentStatus === "cod_due"
      ? "paid"
      : status === "cancelled" && order.paymentStatus === "paid"
        ? order.paymentStatus
        : undefined;

  ops.patchOrder(orderNumber, {
    status,
    paymentStatus: nextPayment ?? patch.paymentStatus,
    events: [...order.events, event],
    riskFlags: order.riskFlags,
  });

  /* Restock on cancellation, deduct nothing twice on delivery. */
  if ((status === "cancelled" || status === "returned") && !isSampleOrder(orderNumber)) {
    order.items.forEach((item) => {
      const product = store.findAnyProduct(item.slug);
      if (product) store.patchProduct(product.slug, { stock: product.stock + item.qty });
    });
  }

  if (status === "shipped" && !order.courier && ops.state.settings.courier.autoBook) {
    void bookCourier(orderNumber);
  }
  if (ops.state.settings.notifications.statusUpdates) {
    queueStatusMessage(orderNumber, status, note);
  }
  return findOrder(orderNumber);
}

export function addOrderNote(orderNumber: string, body: string, actor = "admin") {
  audit("Added order note", orderNumber);
  const order = findOrder(orderNumber);
  if (!order || !body.trim()) return null;
  ops.patchOrder(orderNumber, {
    notes: [...order.notes, { id: ops.uid(), at: new Date().toISOString(), body: body.trim(), actor }],
  });
  return findOrder(orderNumber);
}

export function setPaymentStatus(orderNumber: string, status: PaymentStatus, trxId?: string) {
  audit("Updated payment", orderNumber, status);
  ops.patchOrder(orderNumber, { paymentStatus: status, trxId: trxId ?? ops.getOrderPatch(orderNumber).trxId });
  return findOrder(orderNumber);
}

export function markRefunded(orderNumber: string, amount: number) {
  audit("Refunded order", orderNumber, formatBDT(amount));
  ops.patchOrder(orderNumber, { paymentStatus: "refunded", refundAmount: amount });
  return advanceStatus(orderNumber, "returned", `Refunded ${formatBDT(amount)}`);
}

/* ---------------------------------------------------------------- */
/* Fulfilment traceability (serials, tracking, holds, warranty)      */
/* ---------------------------------------------------------------- */

/** Serial / batch numbers, trimmed, de-duplicated and capped. */
export function setOrderSerials(orderNumber: string, serials: string[]) {
  const clean = [...new Set(serials.map((value) => value.trim()).filter(Boolean))].slice(0, 40);
  ops.patchOrder(orderNumber, { serials: clean });
  audit("Updated serial numbers", orderNumber, `${clean.length} recorded`);
  return findOrder(orderNumber);
}

export function setOrderTracking(orderNumber: string, trackingNumber: string) {
  const clean = trackingNumber.trim().slice(0, 60);
  const order = findOrder(orderNumber);
  ops.patchOrder(orderNumber, {
    trackingNumber: clean,
    courier: clean
      ? {
          provider: order?.courier?.provider ?? ops.state.settings.courier.provider ?? "manual",
          consignmentId: clean,
          trackingUrl: order?.courier?.trackingUrl ?? "",
          bookedAt: order?.courier?.bookedAt ?? new Date().toISOString(),
        }
      : order?.courier,
  });
  audit(clean ? "Added tracking number" : "Cleared tracking number", orderNumber, clean);
  return findOrder(orderNumber);
}

export function setOrderHold(orderNumber: string, on: boolean, reason = "") {
  ops.patchOrder(orderNumber, {
    hold: on ? { on: true, reason: reason.trim().slice(0, 120) || "Held by staff", at: new Date().toISOString() } : { on: false, at: new Date().toISOString() },
  });
  audit(on ? "Put order on hold" : "Released order hold", orderNumber, reason);
  return findOrder(orderNumber);
}

export function setOrderWarranty(orderNumber: string, action: "open" | "resolve", issue = "") {
  const existing = findOrder(orderNumber)?.warranty;
  ops.patchOrder(orderNumber, {
    warranty: action === "open"
      ? { status: "open", issue: issue.trim().slice(0, 160) || "Fault reported by customer", openedAt: new Date().toISOString() }
      : { status: "resolved", issue: existing?.issue ?? "Fault reported by customer", openedAt: existing?.openedAt ?? new Date().toISOString(), resolvedAt: new Date().toISOString() },
  });
  audit(action === "open" ? "Opened warranty claim" : "Resolved warranty claim", orderNumber, issue);
  return findOrder(orderNumber);
}

/* ---------------------------------------------------------------- */
/* Customers                                                         */
/* ---------------------------------------------------------------- */

export type CustomerSegment = "vip" | "builder" | "wholesale" | "regular";

export function customerSegment(phone: string, fallback: CustomerSegment): CustomerSegment {
  return ops.state.customerSegments[phone.replace(/\D/g, "")] ?? fallback;
}

export function setCustomerSegment(phone: string, segment: CustomerSegment) {
  const key = phone.replace(/\D/g, "");
  const next = { ...ops.state.customerSegments };
  if (segment === "regular") delete next[key];
  else next[key] = segment;
  ops.set({ customerSegments: next });
  audit("Changed customer segment", key, segment);
}

/* ---------------------------------------------------------------- */
/* Reviews                                                           */
/* ---------------------------------------------------------------- */

export function reviewMeta(key: string) {
  return ops.state.reviewMeta[key] ?? {};
}

export function replyToReview(key: string, reply: string) {
  const clean = reply.trim().slice(0, 400);
  const meta = ops.state.reviewMeta[key] ?? {};
  ops.set({
    reviewMeta: {
      ...ops.state.reviewMeta,
      [key]: { ...meta, reply: clean || undefined, repliedAt: clean ? new Date().toISOString() : undefined },
    },
  });
  audit(clean ? "Replied to review" : "Removed review reply", key);
}

export function flagReview(key: string, flagged: boolean, reason?: string) {
  const meta = ops.state.reviewMeta[key] ?? {};
  ops.set({
    reviewMeta: {
      ...ops.state.reviewMeta,
      [key]: { ...meta, flagged, flaggedReason: flagged ? (reason ?? "Flagged for review") : undefined, flaggedAt: flagged ? new Date().toISOString() : undefined },
    },
  });
  audit(flagged ? "Flagged review" : "Cleared review flag", key, reason);
}

/* ---------------------------------------------------------------- */
/* Printable parcel label                                            */
/* ---------------------------------------------------------------- */

/** Opens a print-ready label (order, address, items, serials, tracking). */
export function printOrderLabel(order: MerchantOrder) {
  const rows = order.items
    .map((item) => `<tr><td>${escapeHtml(item.name)}</td><td style="text-align:center">${item.qty}</td></tr>`)
    .join("");
  const serials = order.serials.length
    ? `<p class="mono"><b>Serials / batch</b><br>${order.serials.map(escapeHtml).join(" · ")}</p>`
    : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(order.orderNumber)} label</title>
<style>
  @page { size: 100mm 150mm; margin: 6mm; }
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; color: #111; margin: 0; padding: 10px; }
  h1 { font-size: 20px; margin: 0; letter-spacing: -.02em; }
  .muted { color: #555; font-size: 12px; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
  .box { border: 1px solid #111; border-radius: 6px; padding: 8px; margin-top: 8px; }
  .big { font-size: 17px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  td { padding: 3px 0; border-bottom: 1px dotted #bbb; }
  .tag { display: inline-block; border: 1px solid #111; border-radius: 999px; padding: 1px 8px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
</style></head><body>
  <div style="display:flex;justify-content:space-between;align-items:center">
    <span class="big">Glowing Space BD</span><span class="tag">${escapeHtml(order.status)}</span>
  </div>
  <p class="muted" style="margin:2px 0 0">Parcel label · printed ${new Date().toLocaleString()}</p>
  <div class="box"><span class="big">${escapeHtml(order.orderNumber)}</span><br>
    <span class="mono">${order.items.reduce((n, i) => n + i.qty, 0)} units · ${escapeHtml(order.paymentMethod.toUpperCase())} · ${formatBDT(order.total)}</span>
  </div>
  <div class="box"><b>Deliver to</b><br><span class="big">${escapeHtml(order.customerName)}</span><br>
    ${escapeHtml(order.address)}<br>${escapeHtml(order.district)}<br><span class="mono">${escapeHtml(order.phone)}</span>
  </div>
  <div class="box"><table><tbody>${rows}</tbody></table>${serials}
    ${order.trackingNumber ? `<p class="mono"><b>Tracking</b> ${escapeHtml(order.trackingNumber)}</p>` : ""}
  </div>
  <p class="muted" style="margin-top:8px">Check serials against the packing bench before sealing.</p>
  <script>window.onload = () => { window.print(); };</script>
</body></html>`;
  const win = window.open("", "_blank", "width=420,height=640");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  return true;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char));
}

export function bulkStatus(orderNumbers: string[], status: OrderStatus): number {
  let count = 0;
  orderNumbers.forEach((orderNumber) => {
    if (advanceStatus(orderNumber, status, "Bulk update")) count += 1;
  });
  return count;
}

/* ---------------------------------------------------------------- */
/* Courier                                                           */
/* ---------------------------------------------------------------- */

export async function bookCourier(orderNumber: string): Promise<{ ok: boolean; message: string }> {
  const order = findOrder(orderNumber);
  if (!order) return { ok: false, message: "Order not found." };
  const { courier } = ops.state.settings;

  if (courier.provider !== "manual" && courier.apiKey) {
    try {
      const response = await fetch("/api/courier/book", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderNumber }),
      });
      const data = (await response.json()) as { consignmentId?: string; trackingUrl?: string; error?: string };
      if (response.ok && data.consignmentId) {
        ops.patchOrder(orderNumber, {
          courier: {
            provider: courier.provider,
            consignmentId: data.consignmentId,
            trackingUrl: data.trackingUrl ?? "",
            bookedAt: new Date().toISOString(),
          },
        });
        return { ok: true, message: `Booked with ${courier.provider}.` };
      }
      return { ok: false, message: data.error ?? "Courier refused the booking." };
    } catch {
      return { ok: false, message: "Could not reach the courier API." };
    }
  }

  const consignmentId = `${courier.provider === "steadfast" ? "SF" : "PT"}${Math.floor(100000 + Math.random() * 899999)}`;
  ops.patchOrder(orderNumber, {
    courier: {
      provider: courier.provider === "manual" ? "Pathao (manual)" : courier.provider,
      consignmentId,
      trackingUrl: `https://pathao.com/courier/track/${consignmentId}`,
      bookedAt: new Date().toISOString(),
    },
  });
  return { ok: true, message: `Consignment ${consignmentId} created. Enter it in the courier dashboard.` };
}

/* ---------------------------------------------------------------- */
/* Messaging                                                         */
/* ---------------------------------------------------------------- */

function dispatch(channel: OutboxMessage["channel"], to: string, template: string, subject: string, body: string, orderNumber?: string) {
  const { smsProvider } = ops.state.settings.notifications;
  const deliverable = channel === "sms" ? smsProvider !== "none" : channel === "email";
  return ops.pushOutbox({
    channel,
    to,
    template,
    subject,
    body,
    orderNumber,
    status: deliverable ? "queued" : "skipped",
    reason: deliverable ? undefined : "No provider configured — message held for manual send.",
  });
}

export function queueStatusMessage(orderNumber: string, status: OrderStatus, note?: string) {
  const order = findOrder(orderNumber);
  if (!order) return;
  const first = order.customerName.split(" ")[0];
  const tracking = order.courier?.consignmentId;
  const copy: Partial<Record<OrderStatus, string>> = {
    confirmed: `Hi ${first}, order ${orderNumber} is confirmed. Total ${formatBDT(order.total)}. We'll message you when it ships. — ${STORE.name}`,
    packing: `Hi ${first}, we're capacity-checking and packing order ${orderNumber} now. — ${STORE.name}`,
    shipped: `Hi ${first}, order ${orderNumber} is with the courier${tracking ? ` (${tracking})` : ""}. Track: ${STORE.name} /track — ${STORE.name}`,
    delivered: `Hi ${first}, order ${orderNumber} is delivered. Need help with your build? Reply any time. — ${STORE.name}`,
    cancelled: `Hi ${first}, order ${orderNumber} was cancelled.${note ? ` Reason: ${note}.` : ""} Any payment made will be refunded in 3–5 working days. — ${STORE.name}`,
    returned: `Hi ${first}, order ${orderNumber} was returned to us. Our team will contact you about the refund. — ${STORE.name}`,
  };
  const body = copy[status];
  if (!body) return;
  dispatch("sms", order.phone, `order_${status}`, `Order ${orderNumber} — ${STATUS_META[status].label}`, body, orderNumber);
}

export function queueConfirmation(orderNumber: string) {
  const order = findOrder(orderNumber);
  if (!order) return;
  const lines = order.items.map((item) => `${item.qty} × ${item.name}`).join(", ");
  const body = `Hi ${order.customerName.split(" ")[0]}, thanks for your order ${orderNumber} at ${STORE.name}. ${lines}. Total ${formatBDT(order.total)} (${order.paymentMethod === "cod" ? "cash on delivery" : "paid"}). Track any time at ${ops.state.settings.identity.domain}/track — ${STORE.name}`;
  dispatch("sms", order.phone, "order_confirmation", `Order ${orderNumber} received`, body, orderNumber);
  if (order.email) {
    dispatch("email", order.email, "order_confirmation_email", `Your ${STORE.name} order ${orderNumber}`, body, orderNumber);
  }
}

export function queueAbandonedCart(cartId: string) {
  const cart = ops.state.carts.find((entry) => entry.id === cartId);
  if (!cart) return;
  const body = `Hi ${cart.name.split(" ")[0] || "there"}, you left ${cart.items.length} item(s) worth ${formatBDT(cart.value)} in your bag at ${STORE.name}. Your cells are still reserved — finish here: ${ops.state.settings.identity.domain}/checkout`;
  dispatch("sms", cart.phone, "abandoned_cart", "Your bag is waiting", body);
  ops.upsertCart({ ...cart, reminded: true });
}

export function flushOutbox() {
  const provider = ops.state.settings.notifications.smsProvider;
  ops.state.outbox
    .filter((row) => row.status === "queued")
    .forEach((row) => {
      if (row.channel === "sms" && provider === "none") {
        ops.setOutboxStatus(row.id, "skipped", "No SMS provider configured.");
        return;
      }
      ops.setOutboxStatus(row.id, "sent");
    });
}

/* ---------------------------------------------------------------- */
/* Inventory                                                         */
/* ---------------------------------------------------------------- */

export function updateStock(slug: string, stock: number) {
  const before = store.findAnyProduct(slug)?.stock;
  if (before !== undefined && Number.isFinite(stock) && before !== Math.max(0, Math.round(stock))) audit("Adjusted stock", store.findAnyProduct(slug)?.name ?? slug, `${before} → ${Math.max(0, Math.round(stock))}`);
  const product = store.findAnyProduct(slug);
  if (!product || !Number.isFinite(stock)) return null;
  store.patchProduct(slug, { stock: Math.max(0, Math.round(stock)) });
  return store.findAnyProduct(slug);
}

export function updatePrice(slug: string, price: number, compareAtPrice?: number | null) {
  const was = store.findAnyProduct(slug)?.price;
  if (was !== undefined && Number.isFinite(price) && was !== Math.round(price)) audit("Changed price", store.findAnyProduct(slug)?.name ?? slug, `${formatBDT(was)} → ${formatBDT(Math.round(price))}`);
  if (!Number.isFinite(price)) return store.findAnyProduct(slug);
  store.patchProduct(slug, {
    price: Math.max(0, Math.round(price)),
    ...(compareAtPrice !== undefined ? { compareAtPrice: compareAtPrice === null ? null : Math.max(0, Math.round(compareAtPrice)) } : {}),
  });
  return store.findAnyProduct(slug);
}

export function toggleFeatured(slug: string) {
  audit("Toggled bestseller", store.findAnyProduct(slug)?.name ?? slug);
  const product = store.findAnyProduct(slug);
  if (!product) return null;
  store.patchProduct(slug, { featured: !product.featured });
  return store.findAnyProduct(slug);
}

/** Includes hidden listings: stock still needs managing while a product is off sale. */
export function lowStock(): Product[] {
  const threshold = ops.state.settings.notifications.lowStockThreshold;
  return store.allProducts().filter((product) => product.stock <= threshold).sort((a, b) => a.stock - b.stock);
}

export function inventoryValue(): number {
  return store.allProducts().reduce((sum, product) => sum + product.stock * product.price, 0);
}

/* ---------------------------------------------------------------- */
/* Reporting                                                         */
/* ---------------------------------------------------------------- */

export type Kpis = {
  revenue: number;
  orders: number;
  aov: number;
  units: number;
  cancelled: number;
  pending: number;
  codShare: number;
  paidRevenue: number;
  spend: number;
  roas: number;
  profit: number;
};

const REVENUE_STATUSES: OrderStatus[] = ["confirmed", "packing", "shipped", "delivered"];

export function computeKpis(orders: MerchantOrder[], from: Date, to: Date): Kpis {
  const scoped = orders.filter((order) => order.createdAt >= from && order.createdAt <= to);
  const earning = scoped.filter((order) => REVENUE_STATUSES.includes(order.status));
  const revenue = earning.reduce((sum, order) => sum + order.total, 0);
  const spend = allSpend()
    .filter((row) => row.date >= from.toISOString().slice(0, 10) && row.date <= to.toISOString().slice(0, 10))
    .reduce((sum, row) => sum + row.amount, 0);
  const cod = earning.filter((order) => order.paymentMethod === "cod").length;
  return {
    revenue,
    orders: scoped.length,
    aov: earning.length ? Math.round(revenue / earning.length) : 0,
    units: earning.reduce((sum, order) => sum + order.items.reduce((n, item) => n + item.qty, 0), 0),
    cancelled: scoped.filter((order) => order.status === "cancelled" || order.status === "returned").length,
    pending: scoped.filter((order) => order.status === "pending").length,
    codShare: earning.length ? Math.round((cod / earning.length) * 100) : 0,
    paidRevenue: earning.filter((order) => order.paymentStatus === "paid").reduce((sum, order) => sum + order.total, 0),
    spend,
    roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : 0,
    /* 42% blended gross margin on cells, packs and accessories. */
    profit: Math.round(revenue * 0.42 - spend),
  };
}

export function dailySeries(orders: MerchantOrder[], days: number) {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(today.getTime() - (days - 1 - index) * 86400000);
    const key = day.toISOString().slice(0, 10);
    const dayOrders = orders.filter(
      (order) => order.createdAt.toISOString().slice(0, 10) === key && REVENUE_STATUSES.includes(order.status),
    );
    const revenue = dayOrders.reduce((sum, order) => sum + order.total, 0);
    const spend = allSpend().filter((row) => row.date === key).reduce((sum, row) => sum + row.amount, 0);
    return { date: key, label: day.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), revenue, orders: dayOrders.length, spend };
  });
}

export type ChannelRow = { channel: string; orders: number; revenue: number; spend: number; roas: number; aov: number };

export function channelReport(orders: MerchantOrder[], days: number): ChannelRow[] {
  const since = Date.now() - days * 86400000;
  const scoped = orders.filter((order) => order.createdAt.getTime() >= since && REVENUE_STATUSES.includes(order.status));
  const map = new Map<string, { orders: number; revenue: number }>();
  scoped.forEach((order) => {
    const channel = order.attribution?.source ?? inferChannel(order);
    const entry = map.get(channel) ?? { orders: 0, revenue: 0 };
    map.set(channel, { orders: entry.orders + 1, revenue: entry.revenue + order.total });
  });
  const spendMap = new Map<string, number>();
  allSpend()
    .filter((row) => row.date >= new Date(since).toISOString().slice(0, 10))
    .forEach((row) => {
      const key = row.channel === "meta" ? "facebook" : row.channel;
      spendMap.set(key, (spendMap.get(key) ?? 0) + row.amount);
    });
  const channels = new Set([...map.keys(), ...spendMap.keys()]);
  return [...channels]
    .map((channel) => {
      const entry = map.get(channel) ?? { orders: 0, revenue: 0 };
      const spend = spendMap.get(channel) ?? 0;
      return {
        channel,
        orders: entry.orders,
        revenue: entry.revenue,
        spend,
        roas: spend > 0 ? Math.round((entry.revenue / spend) * 100) / 100 : 0,
        aov: entry.orders ? Math.round(entry.revenue / entry.orders) : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

function inferChannel(order: MerchantOrder): string {
  const note = order.customerNote ?? "";
  if (/fbclid|facebook|meta/i.test(note)) return "facebook";
  if (/gclid|google/i.test(note)) return "google";
  return "direct";
}

export function topProducts(orders: MerchantOrder[], limit = 6) {
  const map = new Map<string, { name: string; units: number; revenue: number }>();
  orders
    .filter((order) => REVENUE_STATUSES.includes(order.status))
    .forEach((order) =>
      order.items.forEach((item) => {
        const entry = map.get(item.slug) ?? { name: item.name, units: 0, revenue: 0 };
        map.set(item.slug, { name: item.name, units: entry.units + item.qty, revenue: entry.revenue + item.qty * item.unitPrice });
      }),
    );
  return [...map.entries()]
    .map(([slug, value]) => ({ slug, ...value }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export function repeatCustomers(orders: MerchantOrder[]) {
  const map = new Map<string, { name: string; phone: string; orders: number; spend: number; last: Date }>();
  orders.forEach((order) => {
    const phone = order.phone.replace(/[\s-]/g, "");
    const entry = map.get(phone) ?? { name: order.customerName, phone, orders: 0, spend: 0, last: order.createdAt };
    map.set(phone, {
      name: order.customerName,
      phone,
      orders: entry.orders + 1,
      spend: entry.spend + (REVENUE_STATUSES.includes(order.status) ? order.total : 0),
      last: order.createdAt > entry.last ? order.createdAt : entry.last,
    });
  });
  return [...map.values()].sort((a, b) => b.spend - a.spend);
}

/* ---------------------------------------------------------------- */
/* Export                                                            */
/* ---------------------------------------------------------------- */

export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\n");
}

export function download(filename: string, contents: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([`\uFEFF${contents}`], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportOrders(orders: MerchantOrder[]) {
  const rows = orders.flatMap((order) =>
    order.items.map((item) => ({
      order_number: order.orderNumber,
      date: order.createdAt.toISOString(),
      status: order.status,
      payment_status: order.paymentStatus,
      payment_method: order.paymentMethod,
      customer: order.customerName,
      phone: order.phone,
      email: order.email ?? "",
      district: order.district,
      address: order.address,
      sku: item.slug,
      item: item.name,
      qty: item.qty,
      unit_price: item.unitPrice,
      order_total: order.total,
      shipping: order.shipping,
      discount: order.discount,
      promo: order.promoCode ?? "",
      courier: order.courier?.consignmentId ?? "",
      source: order.attribution?.source ?? "",
      campaign: order.attribution?.campaign ?? "",
      risk_flags: order.riskFlags.join("; "),
    })),
  );
  download(`orders-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
}

/** Courier-ready manifest: the columns Pathao/Steadfast bulk upload expects. */
export function exportCourierManifest(orders: MerchantOrder[]) {
  const rows = orders.map((order) => ({
    invoice: order.orderNumber,
    name: order.customerName,
    phone: order.phone,
    address: `${order.address}, ${order.district}`,
    cod_amount: order.paymentStatus === "paid" ? 0 : order.total,
    weight: 0.5,
    note: order.customerNote ?? "",
  }));
  download(`courier-manifest-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
}

export function exportCatalogue() {
  const rows = store.tables.products.map((product) => ({
    id: product.slug,
    title: product.name,
    description: product.shortDescription,
    availability: product.stock > 0 ? "in stock" : "out of stock",
    condition: "new",
    price: `${product.price} BDT`,
    link: `https://${ops.state.settings.identity.domain}/product/${product.slug}`,
    image_link: product.images[0] ?? "",
    brand: product.brand,
    google_product_category: "Electronics > Electronics Accessories > Power > Batteries",
    inventory_quantity: product.stock,
  }));
  download(`meta-catalogue-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
}

/* ---------------------------------------------------------------- */
/* Admin session                                                     */
/* ---------------------------------------------------------------- */

/**
 * Preview gate. Production replaces this with the signed, httpOnly session
 * cookie issued by `/api/admin/login` — see `backend/auth.ts`.
 */
export const DEMO_ADMIN_PIN = "246810";
export const ADMIN_SESSION_HOURS = 8;
const MAX_PIN_FAILURES = 5;
const LOCKOUT_SECONDS = 60;

/**
 * Deterministic salted hash (cyrb53, two rounds). This is a convenience gate
 * for the static preview, NOT server-grade protection: anyone with device
 * access can clear browser storage. Production uses server-side auth.
 */
export function hashAdminPin(pin: string): string {
  const input = `gsbd-console:${pin}`;
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let round = 0; round < 2; round += 1) {
    for (let i = 0; i < input.length; i += 1) {
      const ch = input.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  }
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/* ---------------------------------------------------------------- */
/* Staff accounts & role-based access                                */
/* ---------------------------------------------------------------- */

const OWNER_ID = "owner";

/** Every store has at least the original owner account (migrates the old single PIN). */
export function adminUsers(): AdminUser[] {
  const users = ops.state.adminUsers;
  if (users.length) return users;
  return [{ id: OWNER_ID, name: "Store owner", email: "", roleId: "owner", pinHash: ops.state.adminAuth.pinHash, active: true, createdAt: new Date(0).toISOString(), lastLoginAt: null }];
}

function saveUsers(users: AdminUser[]) {
  ops.set({ adminUsers: users });
}

export function rolesList(): AdminRole[] {
  return allRoles(ops.state.adminRoles);
}

export function roleOf(user: AdminUser | null | undefined): AdminRole | undefined {
  return user ? findRole(user.roleId, ops.state.adminRoles) : undefined;
}

export function currentAdmin(): AdminUser | null {
  if (!adminSignedIn()) return null;
  const id = ops.state.adminSession?.userId ?? OWNER_ID;
  const user = adminUsers().find((entry) => entry.id === id);
  return user && user.active ? user : null;
}

export function can(permission: Permission): boolean {
  return roleHas(roleOf(currentAdmin()), permission);
}

export function canOpenSection(section: string): boolean {
  const permission = SECTION_ACCESS[section];
  return permission ? can(permission) : true;
}

/** Append to the activity log as the signed-in staff member. */
export function audit(action: string, target: string, detail?: string) {
  const user = currentAdmin();
  if (!user) return; // storefront/system activity is not staff activity
  ops.pushAudit({ userId: user?.id ?? "system", userName: user?.name ?? "System", roleId: user?.roleId ?? "-", action, target, detail });
}

/** True while the owner account still uses the shipped preview PIN. */
export function usingDefaultAdminPin(): boolean {
  const owner = adminUsers().find((user) => user.roleId === "owner" && user.active);
  return !owner || owner.pinHash === null;
}

export function adminSignedIn(): boolean {
  const session = ops.state.adminSession;
  if (!session) return false;
  const age = Date.now() - new Date(session.at).getTime();
  return Number.isFinite(age) && age >= 0 && age < ADMIN_SESSION_HOURS * 3600000;
}

export function adminSessionExpiresAt(): Date | null {
  const session = ops.state.adminSession;
  return session ? new Date(new Date(session.at).getTime() + ADMIN_SESSION_HOURS * 3600000) : null;
}

export function adminLockRemaining(): number {
  const until = ops.state.adminAuth.lockedUntil;
  if (!until) return 0;
  return Math.max(0, Math.ceil((new Date(until).getTime() - Date.now()) / 1000));
}

function pinMatchesUser(user: AdminUser, pin: string): boolean {
  return user.pinHash ? hashAdminPin(pin) === user.pinHash : user.roleId === "owner" && pin === DEMO_ADMIN_PIN;
}

export type SignInResult = { ok: true } | { ok: false; reason: "locked" | "invalid"; remaining: number; attemptsLeft: number };

export function attemptAdminSignIn(rawPin: string, userId: string = OWNER_ID): SignInResult {
  const locked = adminLockRemaining();
  if (locked > 0) return { ok: false, reason: "locked", remaining: locked, attemptsLeft: 0 };
  const pin = rawPin.trim();
  const auth = ops.state.adminAuth;
  const users = adminUsers();
  const user = users.find((entry) => entry.id === userId && entry.active);
  if (user && /^\d{6}$/.test(pin) && pinMatchesUser(user, pin)) {
    const now = new Date().toISOString();
    ops.set({
      adminSession: { at: now, userId: user.id },
      adminAuth: { ...auth, failures: 0, lockedUntil: null },
      adminUsers: users.map((entry) => (entry.id === user.id ? { ...entry, lastLoginAt: now } : entry)),
    });
    audit("Signed in", user.name);
    return { ok: true };
  }
  const failures = auth.failures + 1;
  if (failures >= MAX_PIN_FAILURES) {
    ops.set({ adminAuth: { ...auth, failures: 0, lockedUntil: new Date(Date.now() + LOCKOUT_SECONDS * 1000).toISOString() } });
    ops.pushAudit({ userId: user?.id ?? "unknown", userName: user?.name ?? "Unknown", roleId: user?.roleId ?? "-", action: "Sign-in locked", target: "Console", detail: "Too many wrong PINs" });
    return { ok: false, reason: "locked", remaining: LOCKOUT_SECONDS, attemptsLeft: 0 };
  }
  ops.set({ adminAuth: { ...auth, failures, lockedUntil: null } });
  return { ok: false, reason: "invalid", remaining: 0, attemptsLeft: MAX_PIN_FAILURES - failures };
}

/** Backwards-compatible boolean wrapper (owner account). */
export function adminSignIn(pin: string): boolean {
  return attemptAdminSignIn(pin).ok;
}

const WEAK_PINS = new Set(["000000", "111111", "123456", "654321", "121212", "112233", "123123", DEMO_ADMIN_PIN]);

export function pinProblem(pin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return "PINs must be exactly 6 digits.";
  if (WEAK_PINS.has(pin) || /^(\d)\1{5}$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin)) {
    return "Choose a less predictable PIN (not the default, repeated or sequential digits).";
  }
  return null;
}

type Result = { ok: true } | { ok: false; error: string };

export function changeAdminPin(current: string, next: string, confirm: string): Result {
  const user = currentAdmin();
  if (!user) return { ok: false, error: "Your session has expired. Sign in again first." };
  if (!pinMatchesUser(user, current.trim())) return { ok: false, error: "The current PIN is not correct." };
  if (next !== confirm) return { ok: false, error: "The new PIN and confirmation do not match." };
  const problem = pinProblem(next);
  if (problem) return { ok: false, error: problem };
  if (next === current.trim()) return { ok: false, error: "The new PIN must be different from the current PIN." };
  saveUsers(adminUsers().map((entry) => (entry.id === user.id ? { ...entry, pinHash: hashAdminPin(next) } : entry)));
  if (user.id === OWNER_ID) ops.set({ adminAuth: { ...ops.state.adminAuth, pinHash: hashAdminPin(next), changedAt: new Date().toISOString() } });
  audit("Changed own PIN", user.name);
  return { ok: true };
}

function activeOwners(users: AdminUser[]) {
  return users.filter((user) => user.active && user.roleId === "owner").length;
}

export function createStaff(input: { name: string; email: string; roleId: string; pin: string }): Result {
  if (!can("team.manage")) return { ok: false, error: "You do not have permission to manage staff." };
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (name.length < 2) return { ok: false, error: "Enter the staff member's name." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "That email address does not look right." };
  const users = adminUsers();
  if (email && users.some((user) => user.email === email)) return { ok: false, error: "Another account already uses this email." };
  if (users.some((user) => user.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: "Another account already uses this name." };
  if (!findRole(input.roleId, ops.state.adminRoles)) return { ok: false, error: "Choose a role." };
  const problem = pinProblem(input.pin);
  if (problem) return { ok: false, error: problem };
  const user: AdminUser = { id: ops.uid(), name, email, roleId: input.roleId, pinHash: hashAdminPin(input.pin), active: true, createdAt: new Date().toISOString(), lastLoginAt: null };
  saveUsers([...users, user]);
  audit("Added staff member", name, `Role: ${findRole(input.roleId, ops.state.adminRoles)?.name}`);
  return { ok: true };
}

export function updateStaff(id: string, patch: { name?: string; email?: string; roleId?: string; active?: boolean }): Result {
  if (!can("team.manage")) return { ok: false, error: "You do not have permission to manage staff." };
  const users = adminUsers();
  const target = users.find((user) => user.id === id);
  if (!target) return { ok: false, error: "That account no longer exists." };
  const me = currentAdmin();
  const next = { ...target, ...patch, name: (patch.name ?? target.name).trim(), email: (patch.email ?? target.email).trim().toLowerCase() };
  if (next.name.length < 2) return { ok: false, error: "Enter a name." };
  if (patch.roleId && !findRole(patch.roleId, ops.state.adminRoles)) return { ok: false, error: "Choose a valid role." };
  if (me?.id === id && (next.active === false || next.roleId !== target.roleId)) return { ok: false, error: "You cannot deactivate yourself or change your own role." };
  const updated = users.map((user) => (user.id === id ? next : user));
  if (activeOwners(updated) === 0) return { ok: false, error: "The store needs at least one active owner." };
  saveUsers(updated);
  const changes = [patch.roleId && patch.roleId !== target.roleId ? `role → ${findRole(patch.roleId, ops.state.adminRoles)?.name}` : "", patch.active === false ? "deactivated" : patch.active === true && !target.active ? "reactivated" : ""].filter(Boolean).join(", ");
  audit("Updated staff member", next.name, changes || undefined);
  return { ok: true };
}

export function resetStaffPin(id: string, pin: string): Result {
  if (!can("team.manage")) return { ok: false, error: "You do not have permission to manage staff." };
  const problem = pinProblem(pin);
  if (problem) return { ok: false, error: problem };
  const users = adminUsers();
  const target = users.find((user) => user.id === id);
  if (!target) return { ok: false, error: "That account no longer exists." };
  saveUsers(users.map((user) => (user.id === id ? { ...user, pinHash: hashAdminPin(pin) } : user)));
  audit("Reset staff PIN", target.name);
  return { ok: true };
}

export function removeStaff(id: string): Result {
  if (!can("team.manage")) return { ok: false, error: "You do not have permission to manage staff." };
  const users = adminUsers();
  const target = users.find((user) => user.id === id);
  if (!target) return { ok: false, error: "That account no longer exists." };
  if (currentAdmin()?.id === id) return { ok: false, error: "You cannot remove your own account." };
  const rest = users.filter((user) => user.id !== id);
  if (activeOwners(rest) === 0) return { ok: false, error: "The store needs at least one active owner." };
  saveUsers(rest);
  audit("Removed staff member", target.name);
  return { ok: true };
}

export function saveRole(role: { id?: string; name: string; description: string; permissions: Permission[] }): Result {
  if (!can("team.manage")) return { ok: false, error: "You do not have permission to manage roles." };
  const name = role.name.trim();
  if (name.length < 2) return { ok: false, error: "Give the role a name." };
  if (BUILTIN_ROLES.some((entry) => entry.id === role.id)) return { ok: false, error: "Built-in roles cannot be edited. Duplicate it instead." };
  const custom = ops.state.adminRoles;
  if (rolesList().some((entry) => entry.name.toLowerCase() === name.toLowerCase() && entry.id !== role.id)) return { ok: false, error: "A role with this name already exists." };
  const permissions = sanitizePermissions(role.permissions);
  if (!permissions.length) return { ok: false, error: "Select at least one permission." };
  if (role.id && custom.some((entry) => entry.id === role.id)) {
    ops.set({ adminRoles: custom.map((entry) => (entry.id === role.id ? { ...entry, name, description: role.description.trim(), permissions } : entry)) });
    audit("Updated role", name, `${permissions.length} permissions`);
  } else {
    ops.set({ adminRoles: [...custom, { id: `role-${ops.uid()}`, name, description: role.description.trim(), permissions, builtin: false }] });
    audit("Created role", name, `${permissions.length} permissions`);
  }
  return { ok: true };
}

export function deleteRole(id: string): Result {
  if (!can("team.manage")) return { ok: false, error: "You do not have permission to manage roles." };
  const role = ops.state.adminRoles.find((entry) => entry.id === id);
  if (!role) return { ok: false, error: "Built-in roles cannot be deleted." };
  const users = adminUsers().filter((user) => user.roleId === id);
  if (users.length) return { ok: false, error: `Reassign ${users.length} staff member${users.length === 1 ? "" : "s"} before deleting this role.` };
  ops.set({ adminRoles: ops.state.adminRoles.filter((entry) => entry.id !== id) });
  audit("Deleted role", role.name);
  return { ok: true };
}

export function adminSignOut() {
  if (adminSignedIn()) audit("Signed out", currentAdmin()?.name ?? "");
  ops.set({ adminSession: null });
}
