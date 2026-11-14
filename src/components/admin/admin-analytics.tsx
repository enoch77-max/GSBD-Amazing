"use client";

/**
 * Analytics — three high-signal views and nothing else:
 *   1. Revenue vs gross margin over the selected range
 *   2. Top performing categories (Cells, BMS, Chargers, Pre-built Packs)
 *   3. Battery Builder AI attach rate
 * The model-heavy workbench (forecasts, RFM, cohorts) sits behind a toggle.
 */
import { useId, useMemo, useState } from "react";
import { ArrowLeft, FlaskConical, Zap } from "lucide-react";
import { listOrders } from "@/lib/ops";
import { formatBDT } from "@/lib/format";
import {
  categoryBreakdown, CATEGORY_TONE, inRange, pctChange, rangeSeries, RANGES, summarise, type Bucket, type RangeId,
} from "@/lib/admin-metrics";
import { PageHead } from "./admin-ui";
import { TrendPill } from "./admin-overview";
import { AdminAnalyticsAdvanced } from "./admin-analytics-advanced";

const compact = (value: number) =>
  value >= 100000 ? `৳${(value / 100000).toFixed(1)}L` : value >= 1000 ? `৳${Math.round(value / 1000)}k` : `৳${Math.round(value)}`;

export function AdminAnalytics() {
  const [range, setRange] = useState<RangeId>("30d");
  const [advanced, setAdvanced] = useState(false);

  const data = useMemo(() => {
    const orders = listOrders();
    const hours = RANGES.find((entry) => entry.id === range)!.hours;
    const now = summarise(inRange(orders, hours));
    const before = summarise(inRange(orders, hours, hours));
    return {
      now, before,
      series: rangeSeries(orders, range),
      categories: categoryBreakdown(inRange(orders, hours)),
    };
  }, [range]);

  if (advanced) {
    return (
      <>
        <button type="button" className="ax-link w-fit" onClick={() => setAdvanced(false)}><ArrowLeft size={14} /> Back to analytics</button>
        <AdminAnalyticsAdvanced />
      </>
    );
  }

  const { now, before } = data;
  const builderAov = now.builderOrders ? now.builderRevenue / now.builderOrders : 0;
  const otherAov = now.orders - now.builderOrders ? (now.revenue - now.builderRevenue) / (now.orders - now.builderOrders) : 0;
  const aovLift = otherAov ? ((builderAov - otherAov) / otherAov) * 100 : 0;
  const categoryTotal = data.categories.reduce((sum, row) => sum + row.revenue, 0) || 1;
  const rangeLabel = range === "24h" ? "last 24 hours" : `last ${range.replace("d", " days")}`;

  return (
    <>
      <PageHead
        title="Analytics"
        subtitle={`${now.orders} orders · ${rangeLabel}`}
        actions={
          <div className="ax-seg" role="radiogroup" aria-label="Time range">
            {RANGES.map((entry) => (
              <button key={entry.id} type="button" role="radio" aria-checked={range === entry.id} data-active={range === entry.id} onClick={() => setRange(entry.id)}>
                {entry.label}
              </button>
            ))}
          </div>
        }
      />

      <section className="ax-kpis" aria-label="Period summary">
        <Kpi label="Revenue" value={formatBDT(now.revenue)} delta={pctChange(now.revenue, before.revenue)} />
        <Kpi label="Gross margin" value={formatBDT(now.margin)} delta={pctChange(now.margin, before.margin)} />
        <Kpi label="Margin rate" value={`${now.marginPct.toFixed(1)}%`} delta={now.marginPct - before.marginPct} suffix="pt" />
        <Kpi label="AI attach rate" value={`${now.attachRate.toFixed(1)}%`} delta={now.attachRate - before.attachRate} suffix="pt" accent />
      </section>

      <section className="ax-card">
        <header className="ax-card-head">
          <div>
            <h2 className="ax-title-sm">Revenue vs. margin</h2>
            <p className="ax-caption mt-0.5">{range === "24h" ? "Hourly" : "Daily"} · gross margin after category cost and discounts</p>
          </div>
          <div className="ax-legend">
            <span><i style={{ background: "#1d1d1f" }} /> Revenue</span>
            <span><i style={{ background: "#65a30d" }} /> Margin</span>
          </div>
        </header>
        <div className="ax-card-body"><RevenueMarginChart data={data.series} /></div>
      </section>

      <div className="ax-two">
        <section className="ax-card">
          <header className="ax-card-head">
            <div>
              <h2 className="ax-title-sm">Top categories</h2>
              <p className="ax-caption mt-0.5">Share of product revenue</p>
            </div>
          </header>
          <ul className="ax-cats">
            {data.categories.filter((row) => row.revenue > 0).map((row) => (
              <li key={row.group}>
                <div className="ax-cat-head">
                  <span className="ax-body flex items-center gap-2 font-medium"><i className="ax-dot is-static" style={{ background: CATEGORY_TONE[row.group] }} />{row.group}</span>
                  <span className="ax-body ax-num font-semibold">{compact(row.revenue)}</span>
                </div>
                <div className="ax-bar"><span style={{ width: `${Math.max(2, (row.revenue / categoryTotal) * 100)}%`, background: CATEGORY_TONE[row.group] }} /></div>
                <div className="ax-cat-meta ax-caption">
                  <span>{Math.round((row.revenue / categoryTotal) * 100)}% of revenue · {row.units} units</span>
                  <span>{row.revenue ? Math.round((row.margin / row.revenue) * 100) : 0}% margin</span>
                </div>
              </li>
            ))}
            {categoryTotal <= 1 && <li className="ax-empty">No product sales in this range.</li>}
          </ul>
        </section>

        <section className="ax-card" data-accent="true">
          <header className="ax-card-head">
            <div>
              <h2 className="ax-title-sm flex items-center gap-1.5"><Zap size={14} className="text-[#4d7c0f]" /> Battery AI attach rate</h2>
              <p className="ax-caption mt-0.5">Orders built or landed through the Battery Builder</p>
            </div>
          </header>
          <div className="ax-card-body">
            <div className="ax-attach">
              <Ring value={now.attachRate} />
              <dl className="ax-attach-stats">
                <div><dt className="ax-caption">AI orders</dt><dd className="ax-body ax-num font-semibold">{now.builderOrders}</dd></div>
                <div><dt className="ax-caption">AI revenue</dt><dd className="ax-body ax-num font-semibold">{compact(now.builderRevenue)}</dd></div>
                <div>
                  <dt className="ax-caption">AOV lift</dt>
                  <dd className="ax-body flex items-center gap-1.5"><span className="ax-num font-semibold">{compact(builderAov)}</span>{now.builderOrders > 0 && <TrendPill value={aovLift} label="vs non-builder orders" />}</dd>
                </div>
              </dl>
            </div>
            <AttachBars data={data.series} />
          </div>
        </section>
      </div>

      <button type="button" className="ax-advanced" onClick={() => setAdvanced(true)}>
        <FlaskConical size={15} />
        <span className="min-w-0 flex-1 text-left">
          <span className="ax-body block font-semibold">Advanced models</span>
          <span className="ax-caption block">Forecasts, anomaly detection, RFM segments, cohorts and reorder planning</span>
        </span>
        <span className="ax-link">Open</span>
      </button>
    </>
  );
}

function Kpi({ label, value, delta, suffix = "%", accent }: { label: string; value: string; delta: number | null; suffix?: string; accent?: boolean }) {
  return (
    <div className="ax-kpi" data-static="true" data-accent={accent || undefined}>
      <span className="ax-caption">{label}</span>
      <strong className="ax-kpi-value">{value}</strong>
      <span className="ax-kpi-foot"><TrendPill value={delta} suffix={suffix} /> <span className="ax-caption">vs previous</span></span>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function RevenueMarginChart({ data }: { data: Bucket[] }) {
  const gradient = useId();
  const [hover, setHover] = useState<number | null>(null);
  const width = 760;
  const height = 240;
  const pad = { top: 12, right: 8, bottom: 26, left: 44 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const raw = Math.max(1, ...data.map((point) => point.revenue));
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const max = Math.ceil(raw / magnitude) * magnitude;
  const x = (index: number) => pad.left + (data.length <= 1 ? innerW / 2 : (index / (data.length - 1)) * innerW);
  const y = (value: number) => pad.top + innerH - (value / max) * innerH;
  const path = (key: "revenue" | "margin") => data.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`).join("");
  const area = `${path("margin")}L${x(data.length - 1)},${pad.top + innerH}L${x(0)},${pad.top + innerH}Z`;
  const every = Math.max(1, Math.ceil(data.length / 6));
  const active = hover !== null ? data[hover] : null;

  return (
    <div className="ax-chart">
      <div className="ax-chart-readout" aria-live="polite">
        {active ? (
          <>
            <span className="ax-caption">{active.label}</span>
            <span className="ax-body"><b className="ax-num">{formatBDT(active.revenue)}</b> revenue</span>
            <span className="ax-body"><b className="ax-num text-[#4d7c0f]">{formatBDT(active.margin)}</b> margin</span>
            <span className="ax-caption">{active.orders} orders</span>
          </>
        ) : <span className="ax-caption">Hover or tap the chart for detail</span>}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height: "auto", maxHeight: height }} role="img" aria-label="Revenue and gross margin over time"
        onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#65a30d" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#65a30d" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((fraction) => (
          <g key={fraction}>
            <line x1={pad.left} x2={width - pad.right} y1={y(max * fraction)} y2={y(max * fraction)} stroke="#ececf0" strokeDasharray={fraction ? "3 4" : undefined} />
            <text x={pad.left - 8} y={y(max * fraction) + 3.5} textAnchor="end" className="adm-chart-axis">{compact(max * fraction)}</text>
          </g>
        ))}
        <path d={area} fill={`url(#${gradient})`} />
        <path d={path("margin")} fill="none" stroke="#65a30d" strokeWidth="2" strokeLinejoin="round" />
        <path d={path("revenue")} fill="none" stroke="#1d1d1f" strokeWidth="2" strokeLinejoin="round" />
        {hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} stroke="#1d1d1f" strokeOpacity=".2" />
            <circle cx={x(hover)} cy={y(data[hover].revenue)} r="4" fill="#fff" stroke="#1d1d1f" strokeWidth="2" />
            <circle cx={x(hover)} cy={y(data[hover].margin)} r="4" fill="#fff" stroke="#65a30d" strokeWidth="2" />
          </g>
        )}
        {data.map((point, index) => (
          <rect key={index} x={x(index) - innerW / data.length / 2} y={pad.top} width={innerW / data.length} height={innerH} fill="transparent"
            onMouseEnter={() => setHover(index)} onClick={() => setHover(index)} />
        ))}
        {data.map((point, index) => (index % every === 0 || index === data.length - 1) && (index === data.length - 1 || data.length - 1 - index >= every / 2) ? (
          <text key={`l${index}`} x={x(index)} y={height - 8} textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"} className="adm-chart-axis">{point.label}</text>
        ) : null)}
      </svg>
    </div>
  );
}

function Ring({ value }: { value: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const length = (Math.min(100, Math.max(0, value)) / 100) * circumference;
  return (
    <svg viewBox="0 0 110 110" className="ax-ring" role="img" aria-label={`Attach rate ${value.toFixed(1)}%`}>
      <circle cx="55" cy="55" r={radius} fill="none" stroke="#efeff3" strokeWidth="10" />
      <circle cx="55" cy="55" r={radius} fill="none" stroke="#65a30d" strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${length} ${circumference}`} transform="rotate(-90 55 55)" />
      <text x="55" y="60" textAnchor="middle" className="ax-ring-value">{value.toFixed(0)}%</text>
    </svg>
  );
}

/** Builder vs other orders per bucket (grouped down to ≤ 14 bars). */
function AttachBars({ data }: { data: Bucket[] }) {
  const size = Math.max(1, Math.ceil(data.length / 14));
  const groups: Array<{ label: string; builder: number; orders: number }> = [];
  for (let index = 0; index < data.length; index += size) {
    const slice = data.slice(index, index + size);
    groups.push({ label: slice[0].label, builder: slice.reduce((s, b) => s + b.builder, 0), orders: slice.reduce((s, b) => s + b.orders, 0) });
  }
  const max = Math.max(1, ...groups.map((group) => group.orders));
  return (
    <div className="ax-attach-bars" role="img" aria-label="Builder orders against all orders over time">
      {groups.map((group, index) => (
        <span key={index} className="ax-attach-col" title={`${group.label}: ${group.builder} of ${group.orders} orders via Battery Builder`}>
          <span className="ax-attach-total" style={{ height: `${(group.orders / max) * 100}%` }}>
            <span className="ax-attach-ai" style={{ height: group.orders ? `${(group.builder / group.orders) * 100}%` : 0 }} />
          </span>
        </span>
      ))}
    </div>
  );
}
