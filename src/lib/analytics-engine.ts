/**
 * Advanced analytics engine for the merchant console.
 *
 * Everything here is a pure, deterministic function over the trading history
 * (orders, tracked events, ad spend, catalogue). No I/O, no randomness, no
 * React — so the same numbers render on every load and the algorithms can be
 * reasoned about:
 *
 *   · statistics      — OLS linear regression (slope / intercept / R²), Pearson
 *                       correlation, SMA / EMA smoothing
 *   · forecasting     — Holt's linear-trend method deseasonalised with
 *                       day-of-week seasonal indices, projected forward with a
 *                       ±1.28σ (80%) residual band
 *   · anomalies       — modified z-score on the median absolute deviation (MAD)
 *   · funnel          — session-based conversion funnel over tracked events
 *   · cohorts         — weekly first-purchase cohorts with retention curves
 *   · RFM             — recency / frequency / monetary quintile segmentation
 *   · Pareto (ABC)    — cumulative revenue share classification (80 / 15 / 5)
 *   · inventory       — days-of-supply and turnover from 30-day velocity
 *   · insights        — rule-based narrative generated from all of the above
 */
import { formatBDT } from "@/lib/format";
import type { MerchantOrder } from "@/lib/ops";
import type { TrackedEvent } from "@/db/ops-store";
import type { Product } from "@/db/schema";

export const REVENUE_STATUSES: ReadonlyArray<MerchantOrder["status"]> = [
  "confirmed",
  "packing",
  "shipped",
  "delivered",
];

export const DAY_MS = 86400000;

/* ------------------------------------------------------------------ */
/* Small date + number helpers                                         */
/* ------------------------------------------------------------------ */

/** Local calendar day key (YYYY-MM-DD) — the business day in Bangladesh. */
export function localDayKey(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function compactNumber(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 1000)}k`;
  if (Math.abs(value) >= 1_000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}

export function growthPct(current: number, previous: number): number {
  if (previous > 0) return ((current - previous) / previous) * 100;
  return current > 0 ? 100 : 0;
}

/** Compound daily growth rate between two totals over `periods` days. */
export function cagrDaily(first: number, last: number, periods: number): number {
  if (first <= 0 || last <= 0 || periods <= 0) return 0;
  return (Math.pow(last / first, 1 / periods) - 1) * 100;
}

/* ------------------------------------------------------------------ */
/* Statistics                                                          */
/* ------------------------------------------------------------------ */

export type Regression = { slope: number; intercept: number; r2: number };

/** Ordinary least squares over x = 0..n-1. */
export function linearRegression(values: number[]): Regression {
  const n = values.length;
  if (n === 0) return { slope: 0, intercept: 0, r2: 0 };
  if (n === 1) return { slope: 0, intercept: values[0], r2: 0 };
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, v) => sum + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = i - meanX;
    const dy = values[i] - meanY;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const intercept = meanY - slope * meanX;
  const r2 = syy > 0 ? (sxy * sxy) / (sxx * syy) : 0;
  return { slope, intercept, r2: Math.min(1, Math.max(0, r2)) };
}

export function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const meanX = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const meanY = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return 0;
  return sxy / Math.sqrt(sxx * syy);
}

/** Simple moving average; leading `window - 1` slots are null. */
export function sma(values: number[], window: number): Array<number | null> {
  return values.map((_, i) => {
    if (i < window - 1) return null;
    const slice = values.slice(i - window + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

/** Exponential moving average. */
export function ema(values: number[], alpha: number): number[] {
  if (!values.length) return [];
  let acc = values[0];
  return values.map((v) => {
    acc = alpha * v + (1 - alpha) * acc;
    return acc;
  });
}

/* ------------------------------------------------------------------ */
/* Forecasting — Holt's linear trend + weekly seasonality              */
/* ------------------------------------------------------------------ */

export function holtProjection(
  values: number[],
  horizon: number,
  alpha = 0.5,
  beta = 0.25,
): { points: number[]; level: number; trend: number } {
  if (values.length === 0) return { points: [], level: 0, trend: 0 };
  let level = values[0];
  let trend = values.length > 1 ? values[1] - values[0] : 0;
  for (let i = 1; i < values.length; i += 1) {
    const prevLevel = level;
    level = alpha * values[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }
  const points = Array.from({ length: Math.max(0, horizon) }, (_, k) => Math.max(0, level + trend * (k + 1)));
  return { points, level, trend };
}

/** Day-of-week (period) multiplicative seasonal indices, mean-normalised to 1. */
export function seasonalIndices(values: number[], period = 7): number[] {
  const sums = new Array(period).fill(0);
  const counts = new Array(period).fill(0);
  values.forEach((v, i) => {
    sums[i % period] += v;
    counts[i % period] += 1;
  });
  const mean = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  return sums.map((sum, i) => {
    if (!counts[i] || mean <= 0) return 1;
    return (sum / counts[i]) / mean;
  });
}

export type ForecastPoint = { date: string; label: string; value: number; lower: number; upper: number };

/**
 * Project daily revenue `horizon` days ahead: deseasonalise with the weekly
 * indices, run Holt's linear trend on the flat series, re-apply the seasonal
 * factor, and attach an 80% band from the residual standard deviation.
 */
export function forecastSeries(metrics: DayMetric[], horizon = 7): ForecastPoint[] {
  if (!metrics.length) return [];
  const values = metrics.map((m) => m.revenue);
  const seasonal = seasonalIndices(values, 7);
  const deseasonalised = values.map((v, i) => (seasonal[i % 7] > 0 ? v / seasonal[i % 7] : v));
  const { points } = holtProjection(deseasonalised, horizon);
  const { slope, intercept } = linearRegression(deseasonalised);
  const residuals = deseasonalised.map((v, i) => v - (intercept + slope * i));
  const sigma =
    Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / Math.max(1, residuals.length)) || 1;
  const last = new Date(`${metrics[metrics.length - 1].date}T00:00:00`);
  return points.map((point, k) => {
    const phase = (metrics.length + k) % 7;
    const factor = seasonal[phase];
    const value = Math.max(0, point * factor);
    const date = new Date(last.getTime() + (k + 1) * DAY_MS);
    const key = localDayKey(date);
    return {
      date: key,
      label: dayLabel(key),
      value: Math.round(value),
      lower: Math.round(Math.max(0, value - 1.28 * sigma * factor)),
      upper: Math.round(value + 1.28 * sigma * factor),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Anomaly detection — modified z-score (MAD)                          */
/* ------------------------------------------------------------------ */

export type Anomaly = { index: number; date: string; label: string; value: number; score: number };

export function detectAnomalies(
  values: number[],
  threshold = 2.8,
): Array<{ index: number; value: number; score: number }> {
  if (values.length < 5) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const deviations = values.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = deviations[Math.floor(deviations.length / 2)] || 1e-9;
  const out: Array<{ index: number; value: number; score: number }> = [];
  values.forEach((value, index) => {
    const score = (0.6745 * (value - median)) / mad;
    if (Math.abs(score) >= threshold) out.push({ index, value, score });
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Daily metrics                                                       */
/* ------------------------------------------------------------------ */

export type DayMetric = {
  date: string;
  label: string;
  revenue: number;
  orders: number;
  units: number;
  aov: number;
  spend: number;
  roas: number;
  cancelled: number;
  codOrders: number;
  discount: number;
};

export type SpendRow = { date: string; channel: string; amount: number };

export function buildDailyMetrics(orders: MerchantOrder[], spend: SpendRow[], days: number, now = new Date()): DayMetric[] {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const spendByDay = new Map<string, number>();
  spend.forEach((row) => {
    /* Spend rows are stored as UTC day keys; bucket them into local days. */
    const key = localDayKey(new Date(`${row.date}T00:00:00Z`));
    spendByDay.set(key, (spendByDay.get(key) ?? 0) + row.amount);
  });
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(end.getTime() - (days - 1 - i) * DAY_MS);
    const key = localDayKey(day);
    const dayOrders = orders.filter((order) => localDayKey(order.createdAt) === key);
    const earning = dayOrders.filter((order) => REVENUE_STATUSES.includes(order.status));
    const revenue = earning.reduce((sum, order) => sum + order.total, 0);
    const units = earning.reduce((sum, order) => sum + order.items.reduce((n, item) => n + item.qty, 0), 0);
    const daySpend = spendByDay.get(key) ?? 0;
    return {
      date: key,
      label: dayLabel(key),
      revenue,
      orders: dayOrders.length,
      units,
      aov: earning.length ? Math.round(revenue / earning.length) : 0,
      spend: daySpend,
      roas: daySpend > 0 ? Math.round((revenue / daySpend) * 100) / 100 : 0,
      cancelled: dayOrders.filter((o) => o.status === "cancelled" || o.status === "returned").length,
      codOrders: earning.filter((o) => o.paymentMethod === "cod").length,
      discount: earning.reduce((sum, order) => sum + order.discount, 0),
    };
  });
}

export type WindowSummary = {
  revenue: number;
  orders: number;
  units: number;
  aov: number;
  spend: number;
  roas: number;
  cancelled: number;
  discount: number;
  codShare: number;
};

export function summarizeWindow(metrics: DayMetric[]): WindowSummary {
  const revenue = metrics.reduce((s, m) => s + m.revenue, 0);
  const orders = metrics.reduce((s, m) => s + m.orders, 0);
  const units = metrics.reduce((s, m) => s + m.units, 0);
  const spend = metrics.reduce((s, m) => s + m.spend, 0);
  const cancelled = metrics.reduce((s, m) => s + m.cancelled, 0);
  const codOrders = metrics.reduce((s, m) => s + m.codOrders, 0);
  const earningCount = Math.max(1, orders - cancelled);
  return {
    revenue,
    orders,
    units,
    aov: Math.round(revenue / earningCount),
    spend,
    roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : 0,
    cancelled,
    discount: metrics.reduce((s, m) => s + m.discount, 0),
    codShare: Math.round((codOrders / earningCount) * 100),
  };
}

/* ------------------------------------------------------------------ */
/* Conversion funnel (session based)                                   */
/* ------------------------------------------------------------------ */

export const FUNNEL_STAGES = ["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "AddPaymentInfo", "Purchase"] as const;

export const FUNNEL_LABELS: Record<(typeof FUNNEL_STAGES)[number], string> = {
  PageView: "Visited store",
  ViewContent: "Viewed a product",
  AddToCart: "Added to bag",
  InitiateCheckout: "Started checkout",
  AddPaymentInfo: "Added payment",
  Purchase: "Purchased",
};

export type FunnelStage = {
  id: string;
  label: string;
  count: number;
  sessions: number;
  /** share of the previous stage */
  rate: number;
  /** share of all sessions that reached the top of funnel */
  overall: number;
  /** fraction lost vs the previous stage */
  drop: number;
};

export function buildFunnel(events: TrackedEvent[], days: number, now = new Date()): FunnelStage[] {
  const since = now.getTime() - days * DAY_MS;
  const scoped = events.filter((event) => {
    const at = new Date(event.at).getTime();
    return Number.isFinite(at) && at >= since && at <= now.getTime();
  });
  const stageIndex = new Map<string, number>(FUNNEL_STAGES.map((stage, index) => [stage, index]));
  const counts = new Map<string, number>();
  const sessionMax = new Map<string, number>();
  scoped.forEach((event) => {
    counts.set(event.name, (counts.get(event.name) ?? 0) + 1);
    const index = stageIndex.get(event.name);
    if (index === undefined) return;
    const session = event.sessionId || "anonymous";
    if ((sessionMax.get(session) ?? -1) < index) sessionMax.set(session, index);
  });
  const topSessions = [...sessionMax.values()].filter((v) => v >= 0).length;
  let previous = Math.max(1, topSessions);
  return FUNNEL_STAGES.map((id, index) => {
    const sessions = [...sessionMax.values()].filter((v) => v >= index).length;
    const count = counts.get(id) ?? 0;
    const stage: FunnelStage = {
      id,
      label: FUNNEL_LABELS[id],
      count,
      sessions,
      rate: previous > 0 ? sessions / previous : 0,
      overall: topSessions > 0 ? sessions / topSessions : 0,
      drop: previous > 0 ? Math.max(0, 1 - sessions / previous) : 0,
    };
    previous = Math.max(1, sessions);
    return stage;
  });
}

/* ------------------------------------------------------------------ */
/* Cohort retention                                                    */
/* ------------------------------------------------------------------ */

export type Cohort = { key: string; label: string; size: number; retention: Array<number | null> };

function weekStartLocal(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - dow);
  return x;
}

export function cohortRetention(orders: MerchantOrder[], weeks = 8, now = new Date()): Cohort[] {
  void now;
  const earning = orders.filter((order) => REVENUE_STATUSES.includes(order.status));
  const byPhone = new Map<string, number[]>();
  earning.forEach((order) => {
    const phone = order.phone.replace(/\D/g, "");
    const list = byPhone.get(phone) ?? [];
    list.push(order.createdAt.getTime());
    byPhone.set(phone, list);
  });
  const cohorts = new Map<string, { start: number; members: string[] }>();
  byPhone.forEach((times, phone) => {
    const first = Math.min(...times);
    const start = weekStartLocal(new Date(first)).getTime();
    const key = localDayKey(new Date(start));
    const entry = cohorts.get(key) ?? { start, members: [] };
    entry.members.push(phone);
    cohorts.set(key, entry);
  });
  const keys = [...cohorts.keys()].sort().slice(-weeks);
  return keys.map((key, cohortIndex) => {
    const entry = cohorts.get(key)!;
    const retention: Array<number | null> = [];
    for (let k = 0; k < keys.length; k += 1) {
      if (cohortIndex + k >= keys.length) {
        retention.push(null);
        continue;
      }
      const targetStart = entry.start + k * 7 * DAY_MS;
      const targetEnd = targetStart + 7 * DAY_MS;
      const alive = entry.members.filter((phone) =>
        (byPhone.get(phone) ?? []).some((t) => t >= targetStart && t < targetEnd),
      ).length;
      retention.push(entry.members.length ? Math.round((alive / entry.members.length) * 100) : null);
    }
    return { key, label: dayLabel(key), size: entry.members.length, retention };
  });
}

/* ------------------------------------------------------------------ */
/* RFM segmentation                                                    */
/* ------------------------------------------------------------------ */

export type RfmCustomer = {
  phone: string;
  name: string;
  recencyDays: number;
  frequency: number;
  monetary: number;
  r: number;
  f: number;
  m: number;
  segment: string;
};

export type RfmSegment = {
  id: string;
  label: string;
  blurb: string;
  color: string;
  count: number;
  revenue: number;
  share: number;
};

export const RFM_SEGMENTS: Record<string, { label: string; blurb: string; color: string }> = {
  Champions: { label: "Champions", blurb: "Buy often and recently — protect them with early access and rewards.", color: "#65a30d" },
  Loyal: { label: "Loyal customers", blurb: "Steady repeat buyers; upsell bundles and warranties.", color: "#0a84ff" },
  "Potential loyalist": { label: "Potential loyalists", blurb: "Recent buyers with room to buy more — nurture with follow-ups.", color: "#10b981" },
  "New customer": { label: "New customers", blurb: "First purchase only — onboard them before the second-week drop-off.", color: "#8b5cf6" },
  Promising: { label: "Promising", blurb: "Recent, low frequency — a well-timed offer can convert them.", color: "#f59e0b" },
  "At risk": { label: "At risk", blurb: "Used to buy more; win-back campaigns pay off here.", color: "#f97316" },
  Hibernating: { label: "Hibernating", blurb: "Long gone and infrequent — reactivate or stop spending on them.", color: "#e11d48" },
};

function quintileScore(sortedAsc: number[], value: number, invert: boolean): number {
  if (!sortedAsc.length) return 3;
  let rank = sortedAsc.findIndex((v) => v >= value);
  if (rank === -1) rank = sortedAsc.length;
  const pct = rank / sortedAsc.length;
  const score = 1 + Math.min(4, Math.floor(pct * 5));
  return invert ? 6 - score : score;
}

function segmentOf(r: number, f: number): string {
  if (r >= 4 && f >= 4) return "Champions";
  if (r >= 3 && f >= 4) return "Loyal";
  if (r >= 4 && f >= 2) return "Potential loyalist";
  if (r >= 4) return "New customer";
  if (r >= 3 && f >= 2) return "Promising";
  if (f >= 3) return "At risk";
  return "Hibernating";
}

export function rfmSegmentation(orders: MerchantOrder[], now = new Date()): { customers: RfmCustomer[]; segments: RfmSegment[] } {
  const earning = orders.filter((order) => REVENUE_STATUSES.includes(order.status));
  const map = new Map<string, { name: string; last: number; count: number; spend: number }>();
  earning.forEach((order) => {
    const phone = order.phone.replace(/\D/g, "");
    const entry = map.get(phone) ?? { name: order.customerName, last: 0, count: 0, spend: 0 };
    entry.name = order.customerName;
    entry.count += 1;
    entry.spend += order.total;
    entry.last = Math.max(entry.last, order.createdAt.getTime());
    map.set(phone, entry);
  });
  const rows = [...map.entries()].map(([phone, entry]) => ({
    phone,
    name: entry.name,
    recencyDays: Math.max(0, Math.floor((now.getTime() - entry.last) / DAY_MS)),
    frequency: entry.count,
    monetary: entry.spend,
  }));
  const recencyAsc = rows.map((r) => r.recencyDays).sort((a, b) => a - b);
  const freqAsc = rows.map((r) => r.frequency).sort((a, b) => a - b);
  const moneyAsc = rows.map((r) => r.monetary).sort((a, b) => a - b);
  const customers: RfmCustomer[] = rows.map((row) => {
    const r = quintileScore(recencyAsc, row.recencyDays, true);
    const f = quintileScore(freqAsc, row.frequency, false);
    const m = quintileScore(moneyAsc, row.monetary, false);
    return { ...row, r, f, m, segment: segmentOf(r, f) };
  });
  const totalRevenue = customers.reduce((s, c) => s + c.monetary, 0) || 1;
  const bySegment = new Map<string, RfmSegment>();
  customers.forEach((c) => {
    const meta = RFM_SEGMENTS[c.segment];
    const entry = bySegment.get(c.segment) ?? {
      id: c.segment, label: meta.label, blurb: meta.blurb, color: meta.color, count: 0, revenue: 0, share: 0,
    };
    entry.count += 1;
    entry.revenue += c.monetary;
    bySegment.set(c.segment, entry);
  });
  const segments = [...bySegment.values()]
    .map((s) => ({ ...s, share: Math.round((s.revenue / totalRevenue) * 100) }))
    .sort((a, b) => b.revenue - a.revenue);
  return { customers, segments };
}

/* ------------------------------------------------------------------ */
/* Pareto / ABC classification                                         */
/* ------------------------------------------------------------------ */

export type AbcRow = {
  slug: string;
  name: string;
  units: number;
  revenue: number;
  share: number;
  cumulative: number;
  cls: "A" | "B" | "C";
};

export function abcPareto(items: Array<{ slug: string; name: string; units: number; revenue: number }>): AbcRow[] {
  const sorted = [...items].sort((a, b) => b.revenue - a.revenue);
  const total = sorted.reduce((s, i) => s + i.revenue, 0) || 1;
  let cumulative = 0;
  return sorted.map((row) => {
    cumulative += row.revenue;
    const cum = cumulative / total;
    return {
      ...row,
      share: Math.round((row.revenue / total) * 100),
      cumulative: Math.round(cum * 1000) / 10,
      cls: cum <= 0.8 ? "A" : cum <= 0.95 ? "B" : "C",
    };
  });
}

export function productSales(orders: MerchantOrder[]): Array<{ slug: string; name: string; units: number; revenue: number }> {
  const map = new Map<string, { slug: string; name: string; units: number; revenue: number }>();
  orders
    .filter((order) => REVENUE_STATUSES.includes(order.status))
    .forEach((order) =>
      order.items.forEach((item) => {
        const entry = map.get(item.slug) ?? { slug: item.slug, name: item.name, units: 0, revenue: 0 };
        entry.units += item.qty;
        entry.revenue += item.qty * item.unitPrice;
        map.set(item.slug, entry);
      }),
    );
  return [...map.values()];
}

/* ------------------------------------------------------------------ */
/* Heatmap — day of week × hour of day                                 */
/* ------------------------------------------------------------------ */

export const HEATMAP_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function orderHeatmap(orders: MerchantOrder[]): { matrix: number[][]; max: number } {
  const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
  orders.forEach((order) => {
    const d = order.createdAt;
    const row = (d.getDay() + 6) % 7;
    matrix[row][d.getHours()] += 1;
  });
  const max = Math.max(1, ...matrix.flat());
  return { matrix, max };
}

/* ------------------------------------------------------------------ */
/* Inventory health — velocity, days of supply, turnover              */
/* ------------------------------------------------------------------ */

export type InventoryRow = {
  slug: string;
  name: string;
  sku: string;
  stock: number;
  price: number;
  sold: number;
  revenue: number;
  dailyRate: number;
  daysOfSupply: number | null;
  status: "out" | "critical" | "low" | "slow" | "healthy";
};

export function inventoryHealth(
  orders: MerchantOrder[],
  products: Product[],
  days = 30,
  now = new Date(),
): InventoryRow[] {
  const since = now.getTime() - days * DAY_MS;
  const soldMap = new Map<string, { units: number; revenue: number }>();
  orders
    .filter((order) => REVENUE_STATUSES.includes(order.status) && order.createdAt.getTime() >= since)
    .forEach((order) =>
      order.items.forEach((item) => {
        const entry = soldMap.get(item.slug) ?? { units: 0, revenue: 0 };
        entry.units += item.qty;
        entry.revenue += item.qty * item.unitPrice;
        soldMap.set(item.slug, entry);
      }),
    );
  return products
    .map((product) => {
      const sold = soldMap.get(product.slug) ?? { units: 0, revenue: 0 };
      const dailyRate = sold.units / days;
      const daysOfSupply = dailyRate > 0 ? product.stock / dailyRate : null;
      const status: InventoryRow["status"] =
        product.stock <= 0 ? "out"
          : sold.units === 0 ? "slow"
          : daysOfSupply !== null && daysOfSupply < 7 ? "critical"
          : daysOfSupply !== null && daysOfSupply < 14 ? "low"
          : "healthy";
      return {
        slug: product.slug,
        name: product.name,
        sku: product.sku,
        stock: product.stock,
        price: product.price,
        sold: sold.units,
        revenue: sold.revenue,
        dailyRate,
        daysOfSupply,
        status,
      };
    })
    .sort((a, b) => {
      const rank = { out: 0, critical: 1, low: 2, slow: 3, healthy: 4 };
      return rank[a.status] - rank[b.status] || (a.daysOfSupply ?? 9999) - (b.daysOfSupply ?? 9999);
    });
}

/* ------------------------------------------------------------------ */
/* Promotions                                                          */
/* ------------------------------------------------------------------ */

export type PromoRow = { code: string; uses: number; revenue: number; discount: number; aov: number };

export function promoReport(orders: MerchantOrder[], promoUsage: Record<string, string[]> = {}): PromoRow[] {
  const earning = orders.filter((order) => REVENUE_STATUSES.includes(order.status) && order.promoCode);
  const map = new Map<string, { uses: Set<string>; revenue: number; discount: number }>();
  earning.forEach((order) => {
    const code = (order.promoCode ?? "").toUpperCase();
    const entry = map.get(code) ?? { uses: new Set<string>(), revenue: 0, discount: 0 };
    entry.uses.add(order.orderNumber);
    entry.revenue += order.total;
    entry.discount += order.discount;
    map.set(code, entry);
  });
  Object.entries(promoUsage).forEach(([code, numbers]) => {
    const key = code.toUpperCase();
    const entry = map.get(key) ?? { uses: new Set<string>(), revenue: 0, discount: 0 };
    (numbers ?? []).forEach((n) => entry.uses.add(n));
    map.set(key, entry);
  });
  return [...map.entries()]
    .map(([code, entry]) => ({
      code,
      uses: entry.uses.size,
      revenue: entry.revenue,
      discount: entry.discount,
      aov: entry.uses.size ? Math.round(entry.revenue / entry.uses.size) : 0,
    }))
    .filter((row) => row.uses > 0 || row.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);
}

/* ------------------------------------------------------------------ */
/* Channel analytics                                                   */
/* ------------------------------------------------------------------ */

export type ChannelRow = {
  channel: string;
  orders: number;
  revenue: number;
  spend: number;
  roas: number;
  aov: number;
  cpa: number;
  share: number;
};

export function channelAnalytics(orders: MerchantOrder[], spend: SpendRow[], days: number, now = new Date()): ChannelRow[] {
  const since = now.getTime() - days * DAY_MS;
  const earning = orders.filter(
    (order) => REVENUE_STATUSES.includes(order.status) && order.createdAt.getTime() >= since,
  );
  const revenueMap = new Map<string, { orders: number; revenue: number }>();
  earning.forEach((order) => {
    const channel = order.attribution?.source ?? inferChannel(order);
    const entry = revenueMap.get(channel) ?? { orders: 0, revenue: 0 };
    entry.orders += 1;
    entry.revenue += order.total;
    revenueMap.set(channel, entry);
  });
  const spendMap = new Map<string, number>();
  spend.forEach((row) => {
    if (new Date(`${row.date}T00:00:00Z`).getTime() < since) return;
    const key = row.channel === "meta" ? "facebook" : row.channel;
    spendMap.set(key, (spendMap.get(key) ?? 0) + row.amount);
  });
  const channels = new Set([...revenueMap.keys(), ...spendMap.keys()]);
  const totalRevenue = [...revenueMap.values()].reduce((s, e) => s + e.revenue, 0) || 1;
  return [...channels]
    .map((channel) => {
      const entry = revenueMap.get(channel) ?? { orders: 0, revenue: 0 };
      const channelSpend = spendMap.get(channel) ?? 0;
      return {
        channel,
        orders: entry.orders,
        revenue: entry.revenue,
        spend: channelSpend,
        roas: channelSpend > 0 ? Math.round((entry.revenue / channelSpend) * 100) / 100 : 0,
        aov: entry.orders ? Math.round(entry.revenue / entry.orders) : 0,
        cpa: entry.orders > 0 && channelSpend > 0 ? Math.round(channelSpend / entry.orders) : 0,
        share: Math.round((entry.revenue / totalRevenue) * 100),
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

export function repeatRate(orders: MerchantOrder[]): { rate: number; repeaters: number; customers: number } {
  const earning = orders.filter((order) => REVENUE_STATUSES.includes(order.status));
  const phones = new Map<string, number>();
  earning.forEach((order) => {
    const phone = order.phone.replace(/\D/g, "");
    phones.set(phone, (phones.get(phone) ?? 0) + 1);
  });
  const customers = phones.size;
  const repeaters = [...phones.values()].filter((n) => n > 1).length;
  return { rate: customers ? Math.round((repeaters / customers) * 100) : 0, repeaters, customers };
}

/* ------------------------------------------------------------------ */
/* Insight generation                                                  */
/* ------------------------------------------------------------------ */

export type Insight = { id: string; tone: "good" | "warn" | "bad" | "info"; title: string; body: string };

export type InsightInput = {
  metrics: DayMetric[];
  previous: DayMetric[];
  funnel: FunnelStage[];
  channels: ChannelRow[];
  rfm: { customers: RfmCustomer[]; segments: RfmSegment[] };
  abc: AbcRow[];
  inventory: InventoryRow[];
  promos: PromoRow[];
  forecast: ForecastPoint[];
  anomalies: Anomaly[];
  repeat: { rate: number; repeaters: number; customers: number };
  days: number;
};

const TONE_RANK: Record<Insight["tone"], number> = { bad: 0, warn: 1, good: 2, info: 3 };

export function generateInsights(input: InsightInput): Insight[] {
  const { metrics, previous, funnel, channels, rfm, abc, inventory, promos, forecast, anomalies, repeat, days } = input;
  const insights: Insight[] = [];
  const current = summarizeWindow(metrics);
  const before = summarizeWindow(previous);
  const revenueValues = metrics.map((m) => m.revenue);
  const regression = linearRegression(revenueValues);
  const last7 = metrics.slice(-7).reduce((s, m) => s + m.revenue, 0);
  const next7 = forecast.reduce((s, f) => s + f.value, 0);

  /* Trend */
  if (metrics.length >= 5 && regression.r2 >= 0.25) {
    const perDay = regression.slope;
    if (perDay > 0) {
      insights.push({
        id: "trend-up",
        tone: "good",
        title: "Revenue is trending up",
        body: `OLS trend adds ≈ ${formatBDT(Math.round(perDay))}/day (R² ${(regression.r2 * 100).toFixed(0)}%). Over the last ${days} days that is ${growthPct(current.revenue, before.revenue).toFixed(1)}% vs the previous window.`,
      });
    } else if (perDay < 0) {
      insights.push({
        id: "trend-down",
        tone: "warn",
        title: "Revenue is trending down",
        body: `OLS trend loses ≈ ${formatBDT(Math.round(-perDay))}/day (R² ${(regression.r2 * 100).toFixed(0)}%). Window-over-window revenue moved ${growthPct(current.revenue, before.revenue).toFixed(1)}% — check the funnel leak and channel ROAS below.`,
      });
    }
  }

  /* Anomalies */
  if (anomalies.length) {
    insights.push({
      id: "anomalies",
      tone: anomalies.some((a) => a.score < 0) ? "bad" : "warn",
      title: `${anomalies.length} anomalous day${anomalies.length === 1 ? "" : "s"} detected`,
      body: `Modified z-score (MAD) flagged ${anomalies.map((a) => `${a.label} (${formatBDT(a.value)})`).join(", ")}. Spikes usually mean a campaign push; dips often mean stock-outs or tracking gaps.`,
    });
  }

  /* Forecast */
  if (forecast.length && last7 > 0) {
    const delta = growthPct(next7, last7);
    insights.push({
      id: "forecast",
      tone: delta >= 0 ? "good" : "warn",
      title: `Forecast: next 7 days ≈ ${formatBDT(next7)}`,
      body: `Holt's linear trend + day-of-week seasonality projects ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% vs the last 7 days (${formatBDT(last7)}), 80% band ${formatBDT(Math.round(forecast.reduce((s, f) => s + f.lower, 0)))} – ${formatBDT(Math.round(forecast.reduce((s, f) => s + f.upper, 0)))}.`,
    });
  }

  /* Funnel */
  if (funnel.length && funnel[0].sessions > 0) {
    let leak: FunnelStage | null = null;
    for (let i = 1; i < funnel.length; i += 1) {
      if (!leak || funnel[i].drop > leak.drop) leak = funnel[i];
    }
    const purchase = funnel[funnel.length - 1];
    if (leak) {
      const leakIndex = funnel.indexOf(leak);
      const prevLabel = leakIndex > 0 ? funnel[leakIndex - 1].label : "top of funnel";
      insights.push({
        id: "funnel-leak",
        tone: leak.drop > 0.5 ? "bad" : "warn",
        title: `Biggest funnel leak: ${prevLabel} → ${leak.label}`,
        body: `${(leak.drop * 100).toFixed(0)}% of sessions drop between these stages. Overall visit-to-purchase conversion is ${(purchase.overall * 100).toFixed(1)}% (${purchase.sessions} of ${funnel[0].sessions} sessions).`,
      });
    }
  } else {
    insights.push({
      id: "funnel-empty",
      tone: "info",
      title: "No tracking events in this window",
      body: "Browse the storefront (or keep sample history on) to populate the PageView → Purchase funnel.",
    });
  }

  /* Channels */
  const paid = channels.filter((c) => c.spend > 0);
  if (paid.length) {
    const best = [...paid].sort((a, b) => b.roas - a.roas)[0];
    const worst = [...paid].sort((a, b) => a.roas - b.roas)[0];
    insights.push({
      id: "channel-best",
      tone: best.roas >= 2 ? "good" : "info",
      title: `${cap(best.channel)} is your best channel`,
      body: `ROAS ${best.roas.toFixed(2)}× on ${formatBDT(best.spend)} spend across ${best.orders} orders (AOV ${formatBDT(best.aov)}, CPA ${formatBDT(best.cpa)}). Worst: ${cap(worst.channel)} at ${worst.roas.toFixed(2)}× — shift budget toward ${cap(best.channel)}.`,
    });
  } else if (channels.length) {
    const direct = channels.find((c) => c.channel === "direct");
    insights.push({
      id: "channel-direct",
      tone: "info",
      title: "Mostly organic traffic",
      body: direct
        ? `${direct.share}% of revenue is direct/unattributed. Log ad spend in Growth & ads to measure true ROAS per channel.`
        : "No attribution data yet — orders land as direct until UTM/click IDs are captured.",
    });
  }

  /* Repeat buyers */
  if (repeat.customers > 0) {
    insights.push({
      id: "repeat",
      tone: repeat.rate >= 25 ? "good" : "info",
      title: `${repeat.rate}% of customers buy more than once`,
      body: `${repeat.repeaters} of ${repeat.customers} customers placed 2+ orders. The cohort grid below shows whether week-1 buyers return in weeks 2–6.`,
    });
  }

  /* RFM at risk */
  const atRisk = rfm.segments.find((s) => s.id === "At risk");
  const hibernating = rfm.segments.find((s) => s.id === "Hibernating");
  if (atRisk || hibernating) {
    const count = (atRisk?.count ?? 0) + (hibernating?.count ?? 0);
    const revenue = (atRisk?.revenue ?? 0) + (hibernating?.revenue ?? 0);
    if (count > 0) {
      insights.push({
        id: "rfm-risk",
        tone: "warn",
        title: `${count} customers are at risk or hibernating`,
        body: `They hold ${formatBDT(revenue)} of lifetime revenue (${atRisk ? `${atRisk.count} at risk` : ""}${atRisk && hibernating ? ", " : ""}${hibernating ? `${hibernating.count} hibernating` : ""}). A win-back WhatsApp blast is the highest-ROI move.`,
      });
    }
  }

  /* Pareto */
  const classA = abc.filter((row) => row.cls === "A");
  if (classA.length && abc.length > 3) {
    insights.push({
      id: "pareto",
      tone: "info",
      title: `${classA.length} products drive 80% of revenue`,
      body: `Pareto split: ${classA.length} A-class SKUs (${formatBDT(classA.reduce((s, r) => s + r.revenue, 0))}), ${abc.filter((r) => r.cls === "B").length} B-class, ${abc.filter((r) => r.cls === "C").length} C-class. Keep A-class stock bulletproof; C-class is a delisting candidate.`,
    });
  }

  /* Inventory */
  const critical = inventory.filter((row) => row.status === "out" || row.status === "critical");
  if (critical.length) {
    insights.push({
      id: "inventory",
      tone: critical.some((r) => r.status === "out") ? "bad" : "warn",
      title: `${critical.length} SKU${critical.length === 1 ? "" : "s"} need reordering now`,
      body: `${critical.slice(0, 4).map((r) => `${r.name} (${r.daysOfSupply === null ? "no sales" : `${Math.round(r.daysOfSupply)}d of stock left`})`).join(", ")}${critical.length > 4 ? "…" : ""}. Days-of-supply = current stock ÷ 30-day daily velocity.`,
    });
  }

  /* Promos */
  if (promos.length) {
    const best = promos[0];
    const rate = best.revenue + best.discount > 0 ? Math.round((best.discount / (best.revenue + best.discount)) * 100) : 0;
    insights.push({
      id: "promo",
      tone: "good",
      title: `${best.code} is your top promo code`,
      body: `${best.uses} uses, ${formatBDT(best.revenue)} revenue, ${formatBDT(best.discount)} discount given (AOV ${formatBDT(best.aov)}). Effective discount rate ${rate}% — healthy while under ~15%.`,
    });
  }

  return insights.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]);
}

function cap(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
