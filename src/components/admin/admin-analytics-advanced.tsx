"use client";

/**
 * Analytics & insights section of the merchant console.
 *
 * Runs the advanced analytics engine (`@/lib/analytics-engine`) over the live
 * order book, tracked events and ad spend, and renders the results with the
 * hand-rolled chart kit in `./analytics-charts`:
 *
 *   revenue trend + Holt/seasonal forecast + MAD anomalies · session funnel ·
 *   channel mix + spend/revenue correlation · weekday×hour heatmap · cohort
 *   retention · RFM segments · Pareto ABC · inventory days-of-supply · promos
 *   · a rule-based insight feed.
 */
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight, BadgePercent, BrainCircuit, CircleDollarSign, Download, Flame, Lightbulb,
  MousePointerClick, Repeat, ShieldAlert, ShoppingCart, Sparkles, TrendingUp, TriangleAlert, type LucideIcon,
} from "lucide-react";
import { ops } from "@/db/ops-store";
import { sampleEvents } from "@/db/sample-trading";
import { useStoreVersion } from "@/lib/use-store";
import { allSpend, download, listOrders, toCsv } from "@/lib/ops";
import { readAllProducts } from "@/lib/queries";
import { formatBDT } from "@/lib/format";
import {
  abcPareto, buildDailyMetrics, buildFunnel, channelAnalytics, cohortRetention, compactNumber,
  detectAnomalies, forecastSeries, generateInsights, growthPct, HEATMAP_DAYS, inventoryHealth,
  linearRegression, orderHeatmap, pearson, productSales, promoReport, repeatRate, rfmSegmentation,
  summarizeWindow, type Anomaly, type ChannelRow, type DayMetric, type Insight,
} from "@/lib/analytics-engine";
import { Badge, Button, Empty, PageHead, Panel } from "./admin-ui";
import {
  BarChart, CohortGrid, DonutChart, FunnelChart, Gauge, HBarList, Heatmap, HUES, KpiCard,
  ParetoChart, RadarChart, RevenueTrendChart, ScatterChart, Sparkline,
} from "./analytics-charts";

const RANGES = [
  { id: 7, label: "7 days" },
  { id: 14, label: "14 days" },
  { id: 30, label: "30 days" },
  { id: 90, label: "90 days" },
];

const TONE_STYLE: Record<Insight["tone"], { icon: LucideIcon; cls: string }> = {
  bad: { icon: ShieldAlert, cls: "an-insight-bad" },
  warn: { icon: TriangleAlert, cls: "an-insight-warn" },
  good: { icon: TrendingUp, cls: "an-insight-good" },
  info: { icon: Lightbulb, cls: "an-insight-info" },
};

/** OLS of y on x (the engine's linearRegression assumes x = 0..n-1). */
function olsXY(xs: number[], ys: number[]): { slope: number; intercept: number } {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0 };
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  return { slope, intercept: my - slope * mx };
}

export function AdminAnalyticsAdvanced({ toast }: { toast?: (message: string) => void }) {
  const storeVersion = useStoreVersion();
  const [opsVersion, setOpsVersion] = useState(0);
  const [days, setDays] = useState(30);
  const [showForecast, setShowForecast] = useState(true);

  useEffect(() => ops.subscribe(() => setOpsVersion((v) => v + 1)), []);

  const data = useMemo(() => {
    void opsVersion;
    void storeVersion;
    const now = new Date();
    const orders = listOrders();
    const since = now.getTime() - days * 86400000;
    const windowOrders = orders.filter((order) => order.createdAt.getTime() >= since);
    const spend = allSpend();
    const events = ops.state.sampleData ? [...sampleEvents(), ...ops.state.events] : ops.state.events;
    const products = readAllProducts();

    const metrics = buildDailyMetrics(orders, spend, days, now);
    const prevMetrics = buildDailyMetrics(orders, spend, days, new Date(now.getTime() - days * 86400000));
    const forecast = forecastSeries(metrics, 7);
    const anomalies: Anomaly[] = detectAnomalies(metrics.map((m) => m.revenue)).map((a) => ({
      ...a,
      date: metrics[a.index]?.date ?? "",
      label: metrics[a.index]?.label ?? "",
    }));
    const funnel = buildFunnel(events, days, now);
    const cohorts = cohortRetention(orders, Math.min(8, Math.max(4, Math.floor(days / 7))));
    const rfm = rfmSegmentation(orders, now);
    const abc = abcPareto(productSales(windowOrders));
    const channels = channelAnalytics(windowOrders, spend, days, now);
    const promos = promoReport(windowOrders, ops.state.promoUsage);
    const inventory = inventoryHealth(orders, products, 30, now);
    const heat = orderHeatmap(windowOrders);
    const repeat = repeatRate(orders);
    const insights = generateInsights({
      metrics, previous: prevMetrics, funnel, channels, rfm, abc, inventory, promos, forecast, anomalies, repeat, days,
    });

    /* per-day purchase events for the conversion sparkline */
    const convByDay = new Map<string, number>();
    events.forEach((event) => {
      if (event.name !== "Purchase") return;
      const at = new Date(event.at).getTime();
      if (at < since || at > now.getTime()) return;
      const key = `${new Date(at).getFullYear()}-${String(new Date(at).getMonth() + 1).padStart(2, "0")}-${String(new Date(at).getDate()).padStart(2, "0")}`;
      convByDay.set(key, (convByDay.get(key) ?? 0) + 1);
    });
    const convSpark = metrics.map((m) => convByDay.get(m.date) ?? 0);

    return {
      now, orders, windowOrders, spend, events, products, metrics, prevMetrics, forecast, anomalies,
      funnel, cohorts, rfm, abc, channels, promos, inventory, heat, repeat, insights, convSpark,
    };
  }, [days, opsVersion, storeVersion]);

  const { metrics, prevMetrics, forecast, anomalies, funnel, channels, rfm, abc, inventory, promos, heat, repeat, insights, convSpark } = data;
  const current = summarizeWindow(metrics);
  const previous = summarizeWindow(prevMetrics);
  const regression = linearRegression(metrics.map((m) => m.revenue));
  const purchaseStage = funnel[funnel.length - 1];
  const conversion = purchaseStage ? purchaseStage.overall : 0;
  const next7 = forecast.reduce((s, f) => s + f.value, 0);
  const last7 = metrics.slice(-7).reduce((s, m) => s + m.revenue, 0);
  const spendSeries = metrics.map((m) => m.spend);
  const revenueSeries = metrics.map((m) => m.revenue);
  const corr = pearson(spendSeries, revenueSeries);
  const scatter = olsXY(spendSeries, revenueSeries);
  const peakDay = metrics.reduce((best, m) => (m.revenue > (best?.revenue ?? -1) ? m : best), metrics[0]);

  let peakCell: { day: string; hour: number; value: number } | null = null;
  for (const [r, row] of heat.matrix.entries()) {
    for (const [c, value] of row.entries()) {
      if (value > (peakCell?.value ?? 0)) peakCell = { day: HEATMAP_DAYS[r], hour: c, value };
    }
  }

  const withSales = inventory.filter((row) => row.daysOfSupply !== null);
  const avgSupply = withSales.length
    ? withSales.reduce((s, row) => s + (row.daysOfSupply ?? 0), 0) / withSales.length
    : 0;

  const topChannels = channels.slice(0, 4);
  const RADAR_KEYS = ["revenue", "roas", "orders", "aov"] as const;
  const radarMax = RADAR_KEYS.map((key) => Math.max(1e-9, ...topChannels.map((c) => c[key])));
  const radarSeries = topChannels.map((c, i) => ({
    name: c.channel,
    color: HUES[i % HUES.length],
    values: RADAR_KEYS.map((key, k) => c[key] / radarMax[k]),
  }));

  const exportCsv = () => {
    const rows = metrics.map((m: DayMetric) => ({
      date: m.date,
      revenue_bdt: m.revenue,
      orders: m.orders,
      units: m.units,
      aov_bdt: m.aov,
      ad_spend_bdt: m.spend,
      roas: m.roas,
      cancelled: m.cancelled,
      discount_bdt: m.discount,
      anomalous: anomalies.some((a) => a.index === metrics.indexOf(m)) ? "yes" : "",
    }));
    rows.push({
      date: "TOTAL", revenue_bdt: current.revenue, orders: current.orders, units: current.units,
      aov_bdt: current.aov, ad_spend_bdt: current.spend, roas: current.roas, cancelled: current.cancelled,
      discount_bdt: current.discount, anomalous: "",
    });
    download(`gsbd-analytics-${days}d.csv`, toCsv(rows));
    toast?.(`Exported ${metrics.length} days of analytics as CSV`);
  };

  const hasOrders = data.orders.length > 0;

  return (
    <>
      <PageHead
        title="Analytics & insights"
        subtitle={`Algorithmic reporting over ${data.orders.length} orders, ${data.events.length} tracked events and ${formatBDT(current.spend)} ad spend — last ${days} days.`}
        actions={
          <>
            <div className="flex gap-1.5">
              {RANGES.map((range) => (
                <button key={range.id} type="button" className="adm-chip" data-active={days === range.id} onClick={() => setDays(range.id)}>
                  {range.label}
                </button>
              ))}
            </div>
            <button type="button" className="adm-chip" data-active={showForecast} onClick={() => setShowForecast((v) => !v)} title="Toggle the Holt + seasonal forecast overlay">
              <Sparkles size={12} className="inline" /> Forecast
            </button>
            <Button size="sm" variant="ghost" onClick={exportCsv}><Download size={13} /> Export CSV</Button>
          </>
        }
      />

      {!hasOrders && (
        <Panel>
          <Empty
            icon={<BrainCircuit size={22} />}
            title="No orders yet — analytics are warming up"
            body="Place a test order from the storefront (or keep the generated sample history on) and this dashboard fills in automatically."
          />
        </Panel>
      )}

      {/* ---------------- KPI row ---------------- */}
      <div className="adm-kpis">
        <KpiCard label="Revenue" value={formatBDT(current.revenue)} delta={growthPct(current.revenue, previous.revenue)} hint={`vs previous ${days}d`} icon={<CircleDollarSign size={16} />} spark={revenueSeries} sparkColor="#65a30d" />
        <KpiCard label="Orders" value={String(current.orders)} delta={growthPct(current.orders, previous.orders)} hint={`${current.units} units · ${current.cancelled} cancelled`} tone="sky" icon={<ShoppingCart size={16} />} spark={metrics.map((m) => m.orders)} sparkColor="#0a84ff" />
        <KpiCard label="Avg order value" value={formatBDT(current.aov)} delta={growthPct(current.aov, previous.aov)} hint={`COD share ${current.codShare}%`} tone="emerald" icon={<TrendingUp size={16} />} spark={metrics.map((m) => m.aov)} sparkColor="#10b981" />
        <KpiCard label="Conversion" value={`${(conversion * 100).toFixed(1)}%`} hint={funnel[0]?.sessions ? `${purchaseStage?.sessions ?? 0} of ${funnel[0].sessions} sessions` : "no events yet"} tone="violet" icon={<MousePointerClick size={16} />} spark={convSpark} sparkColor="#8b5cf6" />
        <KpiCard label="ROAS" value={current.spend > 0 ? `${current.roas.toFixed(2)}×` : "—"} delta={current.spend > 0 ? growthPct(current.roas, previous.roas) : undefined} hint={`${formatBDT(current.spend)} ad spend`} tone={current.roas >= 2 ? "emerald" : "amber"} icon={<ArrowUpRight size={16} />} spark={metrics.map((m) => m.roas)} sparkColor="#f59e0b" />
        <KpiCard label="Repeat buyers" value={`${repeat.rate}%`} hint={`${repeat.repeaters} of ${repeat.customers} customers`} tone="amber" icon={<Repeat size={16} />} />
      </div>

      {/* ---------------- Trend + forecast ---------------- */}
      <Panel
        title="Revenue trend, forecast & anomalies"
        subtitle={`Daily revenue vs ad spend · dashed projection = Holt's linear trend with day-of-week seasonality, shaded band = 80% interval · red dots = MAD z-score anomalies`}
        action={
          <div className="flex items-center gap-3 text-[0.7rem] text-[#6e6e73]">
            <span className="flex items-center gap-1.5"><i className="inline-block size-2 rounded-full bg-[#65a30d]" /> Revenue</span>
            <span className="flex items-center gap-1.5"><i className="inline-block size-2 rounded-full bg-[#f59e0b]" /> Ad spend</span>
            {showForecast && <span className="flex items-center gap-1.5"><i className="inline-block size-2 rounded-full border-2 border-dashed border-[#65a30d]" /> Forecast</span>}
          </div>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <RevenueTrendChart metrics={metrics} forecast={forecast} anomalies={anomalies} showForecast={showForecast} />
          <dl className="adm-kv an-side-stats">
            <dt>Trend (OLS)</dt><dd>{regression.slope >= 0 ? "+" : ""}{formatBDT(Math.round(regression.slope))}/day · R² {(regression.r2 * 100).toFixed(0)}%</dd>
            <dt>Next 7 days</dt><dd>{formatBDT(next7)} {last7 > 0 && <span className={next7 >= last7 ? "text-[#15803d]" : "text-[#b42318]"}>({growthPct(next7, last7) >= 0 ? "+" : ""}{growthPct(next7, last7).toFixed(1)}%)</span>}</dd>
            <dt>Last 7 days</dt><dd>{formatBDT(last7)}</dd>
            <dt>Peak day</dt><dd>{peakDay ? `${peakDay.label} · ${formatBDT(peakDay.revenue)}` : "—"}</dd>
            <dt>Anomalies</dt><dd>{anomalies.length ? `${anomalies.length} (${anomalies.map((a) => a.label).join(", ")})` : "none"}</dd>
            <dt>Spend ↔ revenue r</dt><dd>{corr.toFixed(2)} {Math.abs(corr) >= 0.6 ? "(strong link)" : ""}</dd>
            <dt>Discount given</dt><dd>{formatBDT(current.discount)}</dd>
          </dl>
        </div>
      </Panel>

      {/* ---------------- Insight feed ---------------- */}
      <Panel
        title="Insight feed"
        subtitle="Generated by the analytics engine from trend, anomalies, funnel, channels, RFM, Pareto and inventory rules"
        action={<Badge tone="neutral"><BrainCircuit size={11} /> {insights.length} insights</Badge>}
      >
        <div className="grid gap-3 md:grid-cols-2">
          {insights.map((insight) => {
            const tone = TONE_STYLE[insight.tone];
            const Icon = tone.icon;
            return (
              <div key={insight.id} className={`an-insight ${tone.cls}`}>
                <span className="an-insight-icon"><Icon size={15} /></span>
                <div className="min-w-0">
                  <p className="an-insight-title">{insight.title}</p>
                  <p className="an-insight-body">{insight.body}</p>
                </div>
              </div>
            );
          })}
          {insights.length === 0 && <Empty title="No insights yet" body="Add orders, ad spend or tracking events and the engine will start surfacing patterns." />}
        </div>
      </Panel>

      {/* ---------------- Funnel + channels ---------------- */}
      <div className="adm-grid lg:grid-cols-2">
        <Panel
          title="Conversion funnel"
          subtitle={`Session-based · ${funnel[0]?.sessions ?? 0} sessions in the last ${days}d · overall conversion ${(conversion * 100).toFixed(1)}%`}
          action={<Badge tone={conversion >= 0.02 ? "emerald" : "amber"}>{(conversion * 100).toFixed(1)}% visit→buy</Badge>}
        >
          {funnel[0]?.sessions ? (
            <>
              <FunnelChart stages={funnel} />
              <p className="mt-3 text-[0.72rem] leading-relaxed text-[#6e6e73]">
                Stages are counted per session (a session reaches a stage if it fired that event), so the funnel is
                monotone. Raw event counts are shown next to each bar. Search is tracked but not a funnel gate.
              </p>
            </>
          ) : (
            <Empty icon={<MousePointerClick size={22} />} title="No tracking events in this window" body="Browse the storefront to generate PageView → Purchase events, or keep sample history enabled." />
          )}
        </Panel>

        <Panel
          title="Channel mix"
          subtitle={`Attributed revenue over the last ${days}d — ROAS needs logged ad spend (Growth & ads)`}
        >
          {channels.length ? (
            <>
              <HBarList
                rows={channels.map((row) => ({
                  label: row.channel.charAt(0).toUpperCase() + row.channel.slice(1),
                  value: row.revenue,
                  caption: `${row.orders} orders · ${row.spend > 0 ? `ROAS ${row.roas.toFixed(2)}× · CPA ${formatBDT(row.cpa)}` : "no spend logged"} · AOV ${formatBDT(row.aov)}`,
                }))}
          format={formatBDT}
              />
              <div className="mt-4 flex flex-wrap gap-1.5">
                {channels.map((row) => (
                  <Badge key={row.channel} tone={row.spend > 0 && row.roas >= 2 ? "emerald" : row.spend > 0 && row.roas >= 1 ? "amber" : "neutral"}>
                    {row.channel}: {row.spend > 0 ? `${row.roas.toFixed(2)}×` : "organic"} · {row.share}%
                  </Badge>
                ))}
              </div>
            </>
          ) : (
            <Empty title="No attributed orders in this window" />
          )}
        </Panel>
      </div>

      {/* ---------------- Marketing efficiency + heatmap ---------------- */}
      <div className="adm-grid lg:grid-cols-2">
        <Panel
          title="Ad spend vs revenue"
          subtitle={`Daily Pearson r = ${corr.toFixed(2)} — ${Math.abs(corr) >= 0.6 ? "spend and revenue move together strongly" : Math.abs(corr) >= 0.3 ? "a moderate link" : "little visible link (attribution or seasonality may dominate)"}`}
        >
          <div className="grid items-center gap-4 sm:grid-cols-2">
            <ScatterChart
              points={metrics.map((m) => ({ x: m.spend, y: m.revenue, label: m.label }))}
              regression={scatter}
              xLabel="Ad spend / day"
              yLabel="Revenue / day"
              formatX={(v) => compactNumber(v)}
              formatY={(v) => compactNumber(v)}
            />
            {topChannels.length >= 2 ? (
              <div>
                <p className="mb-1 text-center text-[0.72rem] font-semibold uppercase tracking-wide text-[#6e6e73]">Top channels, normalised</p>
                <RadarChart labels={["Revenue", "ROAS", "Orders", "AOV"]} series={radarSeries} />
                <div className="mt-1 flex flex-wrap justify-center gap-1.5">
                  {topChannels.map((c, i) => (
                    <Badge key={c.channel} tone="neutral"><i className="inline-block size-2 rounded-full" style={{ background: HUES[i % HUES.length] }} /> <span className="capitalize">{c.channel}</span></Badge>
                  ))}
                </div>
              </div>
            ) : (
              <Empty title="Log ad spend to unlock channel comparison" body="Growth & ads → ad spend entries feed ROAS, CPA and this radar." />
            )}
          </div>
        </Panel>

        <Panel
          title="When customers buy"
          subtitle={peakCell ? `Peak: ${peakCell.day} ${peakCell.hour}:00–${peakCell.hour + 1}:00 with ${peakCell.value} orders · cell colour = order count` : "Order volume by weekday and hour"}
          action={<Badge tone="neutral"><Flame size={11} /> {data.windowOrders.length} orders</Badge>}
        >
          <Heatmap matrix={heat.matrix} max={heat.max} days={HEATMAP_DAYS} />
        </Panel>
      </div>

      {/* ---------------- Cohorts + RFM ---------------- */}
      <div className="adm-grid lg:grid-cols-2">
        <Panel
          title="Cohort retention"
          subtitle="Weekly first-purchase cohorts — % of the cohort that ordered again in week Wk (Monday-start weeks)"
        >
          {data.cohorts.length ? (
            <CohortGrid cohorts={data.cohorts} />
          ) : (
            <Empty title="Not enough history for cohorts" body="Cohorts appear once customers have first orders across at least two weeks." />
          )}
        </Panel>

        <Panel
          title="Customer segments (RFM)"
          subtitle="Recency · Frequency · Monetary scored in quintiles (1–5), then bucketed into classic segments"
        >
          {rfm.segments.length ? (
            <div className="grid items-start gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
              <DonutChart
                slices={rfm.segments.map((s) => ({ label: s.label, value: s.count, color: s.color }))}
                centerTop={String(rfm.customers.length)}
                centerBottom="customers"
              />
              <ul className="flex flex-col gap-2">
                {rfm.segments.map((segment) => (
                  <li key={segment.id} className="rounded-lg border border-[#efeff3] bg-[#fafafb] p-2.5">
                    <p className="flex items-center gap-2 text-[0.8rem] font-semibold">
                      <i className="size-2 rounded-full" style={{ background: segment.color }} />
                      {segment.label}
                      <span className="ml-auto adm-num text-[#6e6e73]">{segment.count} · {formatBDT(segment.revenue)} · {segment.share}%</span>
                    </p>
                    <p className="mt-0.5 text-[0.7rem] leading-relaxed text-[#6e6e73]">{segment.blurb}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <Empty title="No customers yet" />
          )}
        </Panel>
      </div>

      {/* ---------------- Pareto + inventory ---------------- */}
      <div className="adm-grid lg:grid-cols-2">
        <Panel
          title="Product Pareto (ABC analysis)"
          subtitle="Bars = revenue per SKU (top 12), line = cumulative share. A ≈ 80% · B ≈ next 15% · C = the long tail"
          action={
            <div className="flex items-center gap-3 text-[0.7rem] text-[#6e6e73]">
              <span className="flex items-center gap-1"><i className="inline-block size-2 rounded-sm bg-[#65a30d]" /> A</span>
              <span className="flex items-center gap-1"><i className="inline-block size-2 rounded-sm bg-[#0a84ff]" /> B</span>
              <span className="flex items-center gap-1"><i className="inline-block size-2 rounded-sm bg-[#d1d1d6]" /> C</span>
            </div>
          }
        >
          {abc.length ? (
            <ParetoChart rows={abc} />
          ) : (
            <Empty title="Nothing sold in this window" />
          )}
        </Panel>

        <Panel
          title="Inventory health"
          subtitle="Days of supply = current stock ÷ 30-day sales velocity — the reorder radar"
          action={
            <div className="flex items-center gap-2">
              <Gauge
                value={avgSupply}
                max={45}
                display={`${avgSupply.toFixed(0)}d`}
                label="avg days of supply"
                color={avgSupply < 14 ? "#e11d48" : avgSupply < 30 ? "#f59e0b" : "#65a30d"}
                size={110}
              />
            </div>
          }
        >
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr><th>Product</th><th className="text-right">Stock</th><th className="text-right">Sold 30d</th><th className="text-right">Per day</th><th className="text-right">Days left</th><th className="text-right">Status</th></tr>
              </thead>
              <tbody>
                {inventory.slice(0, 8).map((row) => (
                  <tr key={row.slug}>
                    <td>
                      <p className="max-w-[220px] truncate text-[0.8rem] font-medium">{row.name}</p>
                      <p className="text-[0.66rem] text-[#8e8e93]">{row.sku}</p>
                    </td>
                    <td className="adm-num text-right">{row.stock}</td>
                    <td className="adm-num text-right">{row.sold}</td>
                    <td className="adm-num text-right">{row.dailyRate.toFixed(1)}</td>
                    <td className="adm-num text-right">{row.daysOfSupply === null ? "—" : Math.round(row.daysOfSupply)}</td>
                    <td className="text-right">
                      <Badge tone={row.status === "out" || row.status === "critical" ? "rose" : row.status === "low" ? "amber" : row.status === "slow" ? "neutral" : "emerald"}>
                        {row.status === "out" ? "Out of stock" : row.status === "critical" ? "Critical" : row.status === "low" ? "Low" : row.status === "slow" ? "No sales" : "Healthy"}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {inventory.length === 0 && (
                  <tr><td colSpan={6}><Empty title="Catalogue is empty" /></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      {/* ---------------- Promos + methodology ---------------- */}
      <div className="adm-grid lg:grid-cols-2">
        <Panel
          title="Promo code performance"
          subtitle={`Discount codes redeemed in the last ${days}d — watch the effective discount rate (discount ÷ gross)`}
        >
          {promos.length ? (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead><tr><th>Code</th><th className="text-right">Uses</th><th className="text-right">Revenue</th><th className="text-right">Discount</th><th className="text-right">AOV</th><th className="text-right">Disc. rate</th></tr></thead>
                <tbody>
                  {promos.map((row) => {
                    const rate = row.revenue + row.discount > 0 ? Math.round((row.discount / (row.revenue + row.discount)) * 100) : 0;
                    return (
                      <tr key={row.code}>
                        <td><span className="adm-code">{row.code}</span></td>
                        <td className="adm-num text-right">{row.uses}</td>
                        <td className="adm-num text-right">{formatBDT(row.revenue)}</td>
                        <td className="adm-num text-right text-[#6e6e73]">{formatBDT(row.discount)}</td>
                        <td className="adm-num text-right">{formatBDT(row.aov)}</td>
                        <td className="text-right"><Badge tone={rate <= 15 ? "emerald" : rate <= 25 ? "amber" : "rose"}>{rate}%</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon={<BadgePercent size={22} />} title="No promo codes used in this window" body="Orders placed with a code (GLOW10, FREESHIP, BUILDER300…) show up here with their true cost." />
          )}
        </Panel>

        <Panel title="Orders by day of week" subtitle={`Last ${days}d — weekly seasonality the forecast engine learns from`}>
          {metrics.some((m) => m.orders > 0) ? (
            <BarChart
              rows={(() => {
                const byDow = new Map<number, { orders: number; revenue: number }>();
                data.windowOrders.forEach((order) => {
                  const d = order.createdAt.getDay();
                  const entry = byDow.get(d) ?? { orders: 0, revenue: 0 };
                  entry.orders += 1;
                  entry.revenue += order.total;
                  byDow.set(d, entry);
                });
                const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                return Array.from({ length: 7 }, (_, d) => ({
                  label: names[d],
                  value: byDow.get(d)?.orders ?? 0,
                  color: HUES[(d + 6) % HUES.length],
                }));
              })()}
              format={(v) => String(v)}
            />
          ) : (
            <Empty title="No orders in this window" />
          )}
        </Panel>
      </div>

      <Panel>
        <details className="an-method">
          <summary><BrainCircuit size={14} /> How these numbers are computed</summary>
          <div className="an-method-body">
            <p><b>Forecast</b> — daily revenue is deseasonalised with day-of-week seasonal indices (mean-normalised), projected with Holt's linear-trend method (α 0.5, β 0.25), then re-seasonalised; the shaded band is ±1.28σ of the residuals (≈80%).</p>
            <p><b>Anomalies</b> — modified z-score 0.6745·(x−median)/MAD with |score| ≥ 2.8 flagged in red.</p>
            <p><b>Trend</b> — ordinary least squares over the daily series; R² reported as fit quality.</p>
            <p><b>Funnel</b> — per-session furthest stage reached across PageView → ViewContent → AddToCart → InitiateCheckout → AddPaymentInfo → Purchase.</p>
            <p><b>Cohorts</b> — customers bucketed by the Monday-start week of their first order; retention = share with any order in week k.</p>
            <p><b>RFM</b> — recency/frequency/monetary ranked into quintiles (1–5) and mapped to Champions / Loyal / Potential / New / Promising / At risk / Hibernating.</p>
            <p><b>Pareto (ABC)</b> — SKUs sorted by revenue; cumulative share ≤80% = A, ≤95% = B, else C.</p>
            <p><b>Inventory</b> — days of supply = stock ÷ (30-day units sold ÷ 30); turnover implied from the same velocity.</p>
            <p><b>Correlation</b> — Pearson r between daily ad spend and daily revenue.</p>
          </div>
        </details>
      </Panel>
    </>
  );
}
