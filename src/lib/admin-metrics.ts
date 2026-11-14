/**
 * Shared metrics for the merchant console shell, Overview and Analytics.
 * One definition per number so the nav badge, the KPI card and the chart can
 * never disagree.
 */
import { store } from "@/db/local-store";
import { lowStock, listOrders, type MerchantOrder } from "@/lib/ops";

export const EARNING = new Set(["confirmed", "packing", "shipped", "delivered"]);
export const UNFULFILLED = new Set(["pending", "confirmed", "packing"]);

/** An order is a Battery Builder AI conversion when it carries a pack spec or landed on the builder. */
export function isBuilderOrder(order: MerchantOrder): boolean {
  if (order.items.some((item) => item.packSpec)) return true;
  if (order.items.some((item) => item.slug === "custom-battery-pack-service")) return true;
  return Boolean(order.attribution?.landingPage?.includes("pack-builder"));
}

export type CategoryGroup = "Cells" | "BMS" | "Chargers" | "Pre-built Packs" | "Other";
export const CATEGORY_GROUPS: CategoryGroup[] = ["Cells", "BMS", "Chargers", "Pre-built Packs", "Other"];
export const CATEGORY_TONE: Record<CategoryGroup, string> = {
  Cells: "#65a30d", BMS: "#0a84ff", Chargers: "#d97706", "Pre-built Packs": "#8b5cf6", Other: "#94a3b8",
};
/** Blended gross margin assumptions per group (cells are commoditised, boards carry more). */
export const MARGIN_RATE: Record<CategoryGroup, number> = {
  Cells: 0.32, BMS: 0.48, Chargers: 0.44, "Pre-built Packs": 0.38, Other: 0.42,
};

export function categoryOf(slug: string): CategoryGroup {
  const product = store.allProducts().find((entry) => entry.slug === slug);
  const category = product?.categorySlug ?? "";
  if (/charger|tp4056|mppt|solar/i.test(slug)) return "Chargers";
  if (category === "battery-cells") return "Cells";
  if (category === "bms-circuits" || /bms|balancer/i.test(slug)) return "BMS";
  if (category === "battery-packs" || category === "ups-power") return "Pre-built Packs";
  return "Other";
}

export const RANGES = [
  { id: "24h", label: "24h", hours: 24 },
  { id: "7d", label: "7d", hours: 24 * 7 },
  { id: "30d", label: "30d", hours: 24 * 30 },
  { id: "90d", label: "90d", hours: 24 * 90 },
] as const;
export type RangeId = (typeof RANGES)[number]["id"];

const HOUR = 3600000;

function orderMargin(order: MerchantOrder): number {
  return order.items.reduce((sum, item) => sum + item.qty * item.unitPrice * MARGIN_RATE[categoryOf(item.slug)], 0) - order.discount;
}

export type Bucket = { label: string; revenue: number; margin: number; orders: number; builder: number };

/** Revenue / margin buckets for a range: hourly for 24h, daily otherwise. */
export function rangeSeries(orders: MerchantOrder[], range: RangeId): Bucket[] {
  const spec = RANGES.find((entry) => entry.id === range)!;
  const step = range === "24h" ? HOUR : 24 * HOUR;
  const count = Math.round((spec.hours * HOUR) / step);
  const end = range === "24h" ? Math.ceil(Date.now() / HOUR) * HOUR : (() => { const d = new Date(); d.setHours(24, 0, 0, 0); return d.getTime(); })();
  const buckets: Bucket[] = Array.from({ length: count }, (_, index) => {
    const at = new Date(end - (count - index) * step);
    return {
      label: range === "24h" ? at.toLocaleTimeString("en-GB", { hour: "2-digit" }) : at.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      revenue: 0, margin: 0, orders: 0, builder: 0,
    };
  });
  orders.forEach((order) => {
    if (!EARNING.has(order.status)) return;
    const index = Math.floor((order.createdAt.getTime() - (end - count * step)) / step);
    if (index < 0 || index >= count) return;
    const bucket = buckets[index];
    bucket.revenue += order.total;
    bucket.margin += orderMargin(order);
    bucket.orders += 1;
    if (isBuilderOrder(order)) bucket.builder += 1;
  });
  return buckets.map((bucket) => ({ ...bucket, margin: Math.round(bucket.margin) }));
}

export function inRange(orders: MerchantOrder[], hours: number, offsetHours = 0) {
  const to = Date.now() - offsetHours * HOUR;
  const from = to - hours * HOUR;
  return orders.filter((order) => order.createdAt.getTime() > from && order.createdAt.getTime() <= to);
}

export function summarise(orders: MerchantOrder[]) {
  const earning = orders.filter((order) => EARNING.has(order.status));
  const revenue = earning.reduce((sum, order) => sum + order.total, 0);
  const margin = Math.round(earning.reduce((sum, order) => sum + orderMargin(order), 0));
  const builder = earning.filter(isBuilderOrder);
  return {
    revenue, margin, orders: earning.length,
    marginPct: revenue ? (margin / revenue) * 100 : 0,
    builderOrders: builder.length,
    builderRevenue: builder.reduce((sum, order) => sum + order.total, 0),
    attachRate: earning.length ? (builder.length / earning.length) * 100 : 0,
    aov: earning.length ? revenue / earning.length : 0,
  };
}

export function categoryBreakdown(orders: MerchantOrder[]) {
  const totals = new Map<CategoryGroup, { revenue: number; units: number; margin: number }>();
  CATEGORY_GROUPS.forEach((group) => totals.set(group, { revenue: 0, units: 0, margin: 0 }));
  orders.filter((order) => EARNING.has(order.status)).forEach((order) =>
    order.items.forEach((item) => {
      const group = categoryOf(item.slug);
      const entry = totals.get(group)!;
      const value = item.qty * item.unitPrice;
      entry.revenue += value; entry.units += item.qty; entry.margin += value * MARGIN_RATE[group];
    }));
  return CATEGORY_GROUPS.map((group) => ({ group, ...totals.get(group)! })).sort((a, b) => b.revenue - a.revenue);
}

export function pctChange(now: number, before: number): number | null {
  if (before <= 0) return now > 0 ? null : 0;
  return ((now - before) / before) * 100;
}

/** Live counts the shell needs every render (nav badges, search). */
export function shellCounts() {
  const orders = listOrders();
  return {
    pending: orders.filter((order) => order.status === "pending").length,
    unfulfilled: orders.filter((order) => UNFULFILLED.has(order.status)).length,
    lowStock: lowStock().length,
  };
}
