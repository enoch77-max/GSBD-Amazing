/**
 * Operations service — the layer the merchant console drives.
 *
 * Order lifecycle, fraud screening, courier booking, customer messaging,
 * reporting and exports. The preview runs it against the local tables; the same
 * functions are what `src/app/api/admin/**` call against Postgres in production.
 */
import { store } from "@/db/local-store";
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
      const product = store.tables.products.find((entry) => entry.slug === item.slug);
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
  const order = findOrder(orderNumber);
  if (!order || !body.trim()) return null;
  ops.patchOrder(orderNumber, {
    notes: [...order.notes, { id: ops.uid(), at: new Date().toISOString(), body: body.trim(), actor }],
  });
  return findOrder(orderNumber);
}

export function setPaymentStatus(orderNumber: string, status: PaymentStatus, trxId?: string) {
  ops.patchOrder(orderNumber, { paymentStatus: status, trxId: trxId ?? ops.getOrderPatch(orderNumber).trxId });
  return findOrder(orderNumber);
}

export function markRefunded(orderNumber: string, amount: number) {
  ops.patchOrder(orderNumber, { paymentStatus: "refunded", refundAmount: amount });
  return advanceStatus(orderNumber, "returned", `Refunded ${formatBDT(amount)}`);
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
  const product = store.tables.products.find((entry) => entry.slug === slug);
  if (!product) return null;
  store.patchProduct(slug, { stock: Math.max(0, Math.round(stock)) });
  return store.tables.products.find((entry) => entry.slug === slug) ?? null;
}

export function updatePrice(slug: string, price: number, compareAtPrice?: number | null) {
  store.patchProduct(slug, {
    price: Math.max(0, Math.round(price)),
    ...(compareAtPrice !== undefined ? { compareAtPrice: compareAtPrice === null ? null : Math.max(0, Math.round(compareAtPrice)) } : {}),
  });
  return store.tables.products.find((entry) => entry.slug === slug) ?? null;
}

export function toggleFeatured(slug: string) {
  const product = store.tables.products.find((entry) => entry.slug === slug);
  if (!product) return null;
  store.patchProduct(slug, { featured: !product.featured });
  return store.tables.products.find((entry) => entry.slug === slug) ?? null;
}

export function lowStock(): Product[] {
  const threshold = ops.state.settings.notifications.lowStockThreshold;
  return store.tables.products.filter((product) => product.stock <= threshold).sort((a, b) => a.stock - b.stock);
}

export function inventoryValue(): number {
  return store.tables.products.reduce((sum, product) => sum + product.stock * product.price, 0);
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

export function adminSignedIn(): boolean {
  const session = ops.state.adminSession;
  if (!session) return false;
  return Date.now() - new Date(session.at).getTime() < 8 * 3600000;
}

export function adminSignIn(pin: string): boolean {
  if (pin.trim() !== DEMO_ADMIN_PIN) return false;
  ops.set({ adminSession: { at: new Date().toISOString() } });
  return true;
}

export function adminSignOut() {
  ops.set({ adminSession: null });
}
