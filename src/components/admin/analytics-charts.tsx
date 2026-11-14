"use client";

/**
 * Data-visualization primitives for the analytics console.
 * Hand-rolled SVG + div charts (no chart library) so the single-file preview
 * build stays dependency-light and every chart matches the admin theme.
 */
import { useId, useRef, useState, type ReactNode } from "react";
import { cn, formatBDT } from "@/lib/format";
import {
  compactNumber,
  type DayMetric,
  type ForecastPoint,
  type FunnelStage,
  type Cohort,
  type AbcRow,
} from "@/lib/analytics-engine";

export const HUES = ["#65a30d", "#0a84ff", "#f59e0b", "#ec4899", "#10b981", "#8b5cf6", "#f97316", "#14b8a6"];

/* ------------------------------------------------------------------ */
/* Sparkline + KPI card                                                */
/* ------------------------------------------------------------------ */

export function Sparkline({ values, width = 110, height = 30, stroke = "#65a30d", className }: {
  values: number[]; width?: number; height?: number; stroke?: string; className?: string;
}) {
  const id = useId();
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return <div style={{ width, height }} className={className} />;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const x = (i: number) => (clean.length <= 1 ? width / 2 : (i / (clean.length - 1)) * (width - 4)) + 2;
  const y = (v: number) => height - 3 - ((v - min) / span) * (height - 6);
  const line = clean.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(clean.length - 1).toFixed(1)},${height} L${x(0).toFixed(1)},${height} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function KpiCard({ label, value, delta, hint, tone = "volt", icon, spark, sparkColor }: {
  label: string;
  value: string;
  delta?: number;
  hint?: string;
  tone?: "volt" | "sky" | "amber" | "rose" | "emerald" | "violet";
  icon?: ReactNode;
  spark?: number[];
  sparkColor?: string;
}) {
  return (
    <div className="adm-stat an-kpi" data-tone={tone}>
      <div className="flex items-start justify-between gap-2">
        <span className="adm-stat-label">{label}</span>
        {icon && <span className="adm-stat-icon">{icon}</span>}
      </div>
      <strong className="adm-stat-value">{value}</strong>
      <div className="flex items-center gap-2">
        {delta !== undefined && Number.isFinite(delta) && (
          <span className={cn("adm-delta", delta >= 0 ? "is-up" : "is-down")}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {hint && <span className="adm-stat-hint truncate">{hint}</span>}
      </div>
      {spark && spark.length > 1 && (
        <Sparkline values={spark} stroke={sparkColor ?? "#65a30d"} className="an-kpi-spark" />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Revenue trend chart with forecast + anomalies                       */
/* ------------------------------------------------------------------ */

type TrendCell = {
  label: string;
  actual?: number;
  spend?: number;
  orders?: number;
  roas?: number;
  fc?: ForecastPoint;
};

export function RevenueTrendChart({ metrics, forecast, anomalies, showForecast, height = 250 }: {
  metrics: DayMetric[];
  forecast: ForecastPoint[];
  anomalies: Array<{ index: number }>;
  showForecast: boolean;
  height?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId();
  const bandId = useId();

  const cells: TrendCell[] = [
    ...metrics.map((m) => ({ label: m.label, actual: m.revenue, spend: m.spend, orders: m.orders, roas: m.roas })),
    ...(showForecast ? forecast.map((f) => ({ label: f.label, fc: f })) : []),
  ];
  const width = 960;
  const pad = { top: 14, right: 14, bottom: 26, left: 46 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(
    1,
    ...cells.map((c) => Math.max(c.actual ?? 0, c.spend ?? 0, c.fc ? c.fc.upper : 0)),
  );
  const x = (i: number) => pad.left + (cells.length <= 1 ? innerW / 2 : (i / (cells.length - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const actualCount = metrics.length;

  const actualLine = metrics.map((m, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(m.revenue).toFixed(1)}`).join(" ");
  const actualArea = `${actualLine} L${x(actualCount - 1).toFixed(1)},${pad.top + innerH} L${x(0).toFixed(1)},${pad.top + innerH} Z`;
  const spendLine = metrics.map((m, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(m.spend).toFixed(1)}`).join(" ");

  let fcLine = "";
  let band = "";
  if (showForecast && forecast.length) {
    const start = actualCount - 1;
    const pts = [
      { i: start, v: metrics[actualCount - 1]?.revenue ?? 0 },
      ...forecast.map((f, k) => ({ i: actualCount + k, v: f.value })),
    ];
    fcLine = pts.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
    const upper = [
      { i: start, v: metrics[actualCount - 1]?.revenue ?? 0 },
      ...forecast.map((f, k) => ({ i: actualCount + k, v: f.upper })),
    ];
    const lower = [
      { i: start, v: metrics[actualCount - 1]?.revenue ?? 0 },
      ...forecast.map((f, k) => ({ i: actualCount + k, v: f.lower })),
    ];
    band = `${upper.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ")} ` +
      [...lower].reverse().map((p) => `L${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ") + " Z";
  }

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const frac = (event.clientX - rect.left) / rect.width;
    const i = Math.round((frac * width - pad.left) / innerW * (cells.length - 1));
    setHover(Math.max(0, Math.min(cells.length - 1, i)));
  };

  const hoverCell = hover !== null ? cells[hover] : null;
  const anomalySet = new Set(anomalies.map((a) => a.index));

  return (
    <div className="an-trend">
      <svg
        ref={ref}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label="Daily revenue, ad spend and forecast"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#65a30d" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#65a30d" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={bandId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#65a30d" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#65a30d" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={pad.left} x2={width - pad.right} y1={pad.top + innerH * (1 - f)} y2={pad.top + innerH * (1 - f)} stroke="#ececf0" strokeWidth="1" />
            <text x={pad.left - 8} y={pad.top + innerH * (1 - f) + 3} textAnchor="end" className="adm-chart-axis">
              {compactNumber(max * f)}
            </text>
          </g>
        ))}

        {showForecast && band && <path d={band} fill={`url(#${bandId})`} />}
        <path d={actualArea} fill={`url(#${gradientId})`} />
        <path d={actualLine} fill="none" stroke="#65a30d" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        {spendLine && <path d={spendLine} fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeDasharray="5 4" strokeLinecap="round" />}
        {showForecast && fcLine && (
          <path d={fcLine} fill="none" stroke="#65a30d" strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" opacity="0.85" />
        )}

        {/* x labels — thin them out when the range is long */}
        {cells.map((cell, i) => {
          const step = cells.length > 45 ? 7 : cells.length > 21 ? 3 : 1;
          if (i % step !== 0 && i !== cells.length - 1) return null;
          return (
            <text key={i} x={x(i)} y={height - 8} textAnchor={i === 0 ? "start" : i === cells.length - 1 ? "end" : "middle"} className="adm-chart-axis" fill={cell.fc ? "#a1a1a6" : undefined}>{cell.label}</text>
          );
        })}

        {/* anomaly markers */}
        {metrics.map((m, i) =>
          anomalySet.has(i) ? (
            <g key={`an-${i}`}>
              <circle cx={x(i)} cy={y(m.revenue)} r="7" fill="#e11d48" opacity="0.14" />
              <circle cx={x(i)} cy={y(m.revenue)} r="3.2" fill="#e11d48" stroke="#fff" strokeWidth="1.4">
                <title>{`${m.label}: ${formatBDT(m.revenue)} — anomaly (modified z-score)`}</title>
              </circle>
            </g>
          ) : null,
        )}

        {/* hover crosshair */}
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} stroke="#c7c7cc" strokeWidth="1" strokeDasharray="3 3" />
        )}
        {hoverCell?.actual !== undefined && hover !== null && (
          <circle cx={x(hover)} cy={y(hoverCell.actual)} r="4" fill="#65a30d" stroke="#fff" strokeWidth="1.6" />
        )}
        {hoverCell?.fc && hover !== null && (
          <circle cx={x(hover)} cy={y(hoverCell.fc.value)} r="4" fill="#fff" stroke="#65a30d" strokeWidth="2" />
        )}
      </svg>

      {hoverCell && hover !== null && (
        <div
          className="an-trend-tip"
          data-edge={x(hover) / width < 0.2 ? "start" : x(hover) / width > 0.8 ? "end" : undefined}
          style={{ left: `${(x(hover) / width) * 100}%` }}
        >
          <p className="an-trend-tip-date">{hoverCell.label}{hoverCell.fc ? " · forecast" : ""}</p>
          {hoverCell.actual !== undefined && (
            <>
              <p><i style={{ background: "#65a30d" }} /> Revenue <b className="adm-num">{formatBDT(hoverCell.actual)}</b></p>
              <p><i style={{ background: "#f59e0b" }} /> Spend <b className="adm-num">{formatBDT(hoverCell.spend ?? 0)}</b></p>
              <p><i style={{ background: "#0a84ff" }} /> Orders <b className="adm-num">{hoverCell.orders ?? 0}</b>{hoverCell.roas ? ` · ROAS ${hoverCell.roas.toFixed(2)}×` : ""}</p>
            </>
          )}
          {hoverCell.fc && (
            <p><i style={{ background: "#65a30d" }} /> Forecast <b className="adm-num">{formatBDT(hoverCell.fc.value)}</b> <span className="text-[#8e8e93]">({formatBDT(hoverCell.fc.lower)}–{formatBDT(hoverCell.fc.upper)})</span></p>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Generic bar chart                                                   */
/* ------------------------------------------------------------------ */

export function BarChart({ rows, height = 190, format = (v: number) => String(v) }: {
  rows: Array<{ label: string; value: number; color?: string }>;
  height?: number;
  format?: (v: number) => string;
}) {
  const width = 720;
  const pad = { top: 22, right: 8, bottom: 26, left: 40 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...rows.map((r) => r.value));
  const bw = Math.min(56, (innerW / Math.max(1, rows.length)) * 0.62);
  const x = (i: number) => pad.left + (innerW / Math.max(1, rows.length)) * (i + 0.5) - bw / 2;
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} role="img">
      {[0.33, 0.66, 1].map((f) => (
        <g key={f}>
          <line x1={pad.left} x2={width - pad.right} y1={pad.top + innerH * (1 - f)} y2={pad.top + innerH * (1 - f)} stroke="#ececf0" />
          <text x={pad.left - 6} y={pad.top + innerH * (1 - f) + 3} textAnchor="end" className="adm-chart-axis">{compactNumber(max * f)}</text>
        </g>
      ))}
      {rows.map((row, i) => (
        <g key={row.label}>
          <rect x={x(i)} y={y(row.value)} width={bw} height={Math.max(1, pad.top + innerH - y(row.value))} rx="4" fill={row.color ?? "#65a30d"}>
            <title>{`${row.label}: ${format(row.value)}`}</title>
          </rect>
          <text x={x(i) + bw / 2} y={y(row.value) - 6} textAnchor="middle" className="adm-chart-axis" fontWeight="600">{format(row.value)}</text>
          <text x={x(i) + bw / 2} y={height - 8} textAnchor="middle" className="adm-chart-axis">{truncate(row.label, 10)}</text>
        </g>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Horizontal bar list                                                 */
/* ------------------------------------------------------------------ */

export function HBarList({ rows, format = (v: number) => String(v), maxRows = 8 }: {
  rows: Array<{ label: string; value: number; caption?: string; color?: string }>;
  format?: (v: number) => string;
  maxRows?: number;
}) {
  const shown = rows.slice(0, maxRows);
  const max = Math.max(1, ...shown.map((r) => r.value));
  return (
    <div className="adm-barlist">
      {shown.map((row, i) => (
        <div key={row.label}>
          <div className="adm-barlist-head">
            <span className="truncate font-medium">{row.label}</span>
            <span className="adm-num text-[#6e6e73]">{format(row.value)}</span>
          </div>
          <div className="adm-barlist-track">
            <span style={{ width: `${Math.max(2, (row.value / max) * 100)}%`, background: row.color ?? HUES[i % HUES.length] }} />
          </div>
          {row.caption && <p className="adm-barlist-caption">{row.caption}</p>}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Donut                                                               */
/* ------------------------------------------------------------------ */

export function DonutChart({ slices, centerTop, centerBottom }: {
  slices: Array<{ label: string; value: number; color: string }>;
  centerTop: string;
  centerBottom: string;
}) {
  const sum = slices.reduce((acc, s) => acc + s.value, 0) || 1;
  let offset = 0;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="adm-donut">
      <svg viewBox="0 0 140 140" className="size-[140px] shrink-0" role="img" aria-label={centerBottom}>
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#f2f2f7" strokeWidth="16" />
        {slices.map((slice) => {
          const length = (slice.value / sum) * circumference;
          const el = (
            <circle
              key={slice.label}
              cx="70" cy="70" r={radius} fill="none"
              stroke={slice.color} strokeWidth="16"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 70 70)"
            >
              <title>{`${slice.label}: ${slice.value}`}</title>
            </circle>
          );
          offset += length;
          return el;
        })}
        <text x="70" y="67" textAnchor="middle" className="adm-donut-value">{centerTop}</text>
        <text x="70" y="85" textAnchor="middle" className="adm-donut-caption">{centerBottom}</text>
      </svg>
      <ul className="adm-donut-legend">
        {slices.map((slice) => (
          <li key={slice.label}>
            <i style={{ background: slice.color }} />
            <span className="truncate">{slice.label}</span>
            <b className="adm-mono">{slice.value}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Heatmap — weekday × hour                                            */
/* ------------------------------------------------------------------ */

export function Heatmap({ matrix, max, days }: { matrix: number[][]; max: number; days: string[] }) {
  const leftPad = 34;
  const topPad = 6;
  const cellW = 26;
  const cellH = 24;
  const gap = 2;
  const width = leftPad + 24 * (cellW + gap);
  const height = topPad + 7 * (cellH + gap) + 18;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxWidth: 760 }} role="img" aria-label="Orders by weekday and hour">
      {days.map((day, r) => (
        <text key={day} x={leftPad - 8} y={topPad + r * (cellH + gap) + cellH / 2 + 3} textAnchor="end" className="adm-chart-axis" fontWeight="600">{day}</text>
      ))}
      {matrix.map((row, r) =>
        row.map((value, c) => {
          const intensity = value / max;
          return (
            <rect
              key={`${r}-${c}`}
              x={leftPad + c * (cellW + gap)}
              y={topPad + r * (cellH + gap)}
              width={cellW}
              height={cellH}
              rx="4"
              fill={value === 0 ? "#f6f6f8" : `rgba(101, 163, 13, ${(0.10 + 0.85 * intensity).toFixed(2)})`}
            >
              <title>{`${days[r]} ${String(c).padStart(2, "0")}:00 — ${value} order${value === 1 ? "" : "s"}`}</title>
            </rect>
          );
        }),
      )}
      {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
        <text key={h} x={leftPad + h * (cellW + gap) + cellW / 2} y={height - 4} textAnchor="middle" className="adm-chart-axis">
          {h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`}
        </text>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Conversion funnel                                                   */
/* ------------------------------------------------------------------ */

export function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  const top = Math.max(1, ...stages.map((s) => s.sessions));
  return (
    <div className="an-funnel">
      {stages.map((stage, i) => (
        <div key={stage.id} className="an-funnel-row">
          <div className="an-funnel-label">
            <span>{stage.label}</span>
            <span className="adm-num text-[#8e8e93]">{stage.sessions.toLocaleString("en-IN")} sessions · {stage.count.toLocaleString("en-IN")} events</span>
          </div>
          <div className="an-funnel-track">
            <div
              className="an-funnel-bar"
              style={{ width: `${Math.max(1.5, (stage.sessions / top) * 100)}%`, background: HUES[i % HUES.length] }}
            />
          </div>
          <div className="an-funnel-meta adm-num">
            <b>{(stage.overall * 100).toFixed(1)}%</b>
            {i > 0 && (
              <span className={stage.drop > 0.5 ? "text-[#e11d48]" : "text-[#8e8e93]"}>
                ↓ {(stage.drop * 100).toFixed(0)}% · {(stage.rate * 100).toFixed(0)}% of prev
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cohort retention grid                                               */
/* ------------------------------------------------------------------ */

export function CohortGrid({ cohorts }: { cohorts: Cohort[] }) {
  if (!cohorts.length) return null;
  const weeks = cohorts[0].retention.length;
  return (
    <div className="an-cohort-wrap adm-table-wrap">
      <table className="an-cohort">
        <thead>
          <tr>
            <th>Cohort week</th>
            <th className="text-right">Customers</th>
            {Array.from({ length: weeks }, (_, k) => <th key={k} className="text-right">W{k}</th>)}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((cohort) => (
            <tr key={cohort.key}>
              <td className="whitespace-nowrap font-medium">{cohort.label}</td>
              <td className="adm-num text-right">{cohort.size}</td>
              {cohort.retention.map((value, k) => (
                <td key={k} className="text-right">
                  {value === null ? (
                    <span className="text-[#c7c7cc]">·</span>
                  ) : (
                    <span
                      className="an-cohort-cell"
                      data-high={value >= 40}
                      style={{ "--cell": (value / 100).toFixed(2) } as React.CSSProperties}
                      title={`${cohort.label} week ${k}: ${value}% retained`}
                    >
                      {value}%
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pareto (ABC) chart — bars + cumulative line                         */
/* ------------------------------------------------------------------ */

export function ParetoChart({ rows, height = 220, format = formatBDT }: {
  rows: AbcRow[];
  height?: number;
  format?: (v: number) => string;
}) {
  const shown = rows.slice(0, 12);
  const width = 760;
  const pad = { top: 24, right: 40, bottom: 40, left: 46 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxRev = Math.max(1, ...shown.map((r) => r.revenue));
  const bw = Math.min(48, (innerW / Math.max(1, shown.length)) * 0.6);
  const x = (i: number) => pad.left + (innerW / Math.max(1, shown.length)) * (i + 0.5) - bw / 2;
  const yRev = (v: number) => pad.top + innerH - (v / maxRev) * innerH;
  const yCum = (pct: number) => pad.top + innerH - (pct / 100) * innerH;
  const line = shown.map((r, i) => `${i === 0 ? "M" : "L"}${x(i) + bw / 2},${yCum(r.cumulative).toFixed(1)}`).join(" ");
  const clsColor = { A: "#65a30d", B: "#0a84ff", C: "#d1d1d6" } as const;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} role="img" aria-label="Pareto chart of product revenue">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={pad.left} x2={width - pad.right - 24} y1={pad.top + innerH * (1 - f)} y2={pad.top + innerH * (1 - f)} stroke="#ececf0" />
          <text x={pad.left - 6} y={pad.top + innerH * (1 - f) + 3} textAnchor="end" className="adm-chart-axis">{compactNumber(maxRev * f)}</text>
          <text x={width - pad.right + 4} y={pad.top + innerH * (1 - f) + 3} className="adm-chart-axis">{`${Math.round(f * 100)}%`}</text>
        </g>
      ))}
      <line x1={width - pad.right - 24} x2={width - pad.right - 24} y1={pad.top} y2={pad.top + innerH} stroke="#ececf0" />
      {shown.map((row, i) => (
        <g key={row.slug}>
          <rect x={x(i)} y={yRev(row.revenue)} width={bw} height={Math.max(1, pad.top + innerH - yRev(row.revenue))} rx="4" fill={clsColor[row.cls]}>
            <title>{`${row.name} — ${format(row.revenue)} (${row.share}%), class ${row.cls}, cumulative ${row.cumulative}%`}</title>
          </rect>
          <text x={x(i) + bw / 2} y={height - 24} textAnchor="middle" className="adm-chart-axis">{truncate(row.name, 9)}</text>
          <text x={x(i) + bw / 2} y={height - 10} textAnchor="middle" className="adm-chart-axis" fontWeight="700" fill={clsColor[row.cls]}>{row.cls}</text>
        </g>
      ))}
      <path d={line} fill="none" stroke="#1d1d1f" strokeWidth="2" strokeLinejoin="round" />
      {shown.map((row, i) => (
        <circle key={`c-${row.slug}`} cx={x(i) + bw / 2} cy={yCum(row.cumulative)} r="3" fill="#1d1d1f">
          <title>{`Cumulative ${row.cumulative}%`}</title>
        </circle>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Gauge                                                               */
/* ------------------------------------------------------------------ */

export function Gauge({ value, max, display, label, color = "#65a30d", size = 150 }: {
  value: number; max: number; display: string; label: string; color?: string; size?: number;
}) {
  const r = 56;
  const circumference = Math.PI * r; // semicircle
  const frac = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className="an-gauge" style={{ width: size }}>
      <svg viewBox="0 0 140 84" width={size} role="img" aria-label={label}>
        <path d="M 14 74 A 56 56 0 0 1 126 74" fill="none" stroke="#f2f2f7" strokeWidth="12" strokeLinecap="round" />
        <path
          d="M 14 74 A 56 56 0 0 1 126 74"
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${(frac * circumference).toFixed(1)} ${circumference.toFixed(1)}`}
        />
        <text x="70" y="62" textAnchor="middle" className="an-gauge-value">{display}</text>
        <text x="70" y="80" textAnchor="middle" className="adm-chart-axis">{label}</text>
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Radar chart                                                         */
/* ------------------------------------------------------------------ */

export function RadarChart({ labels, series, size = 230 }: {
  labels: string[];
  series: Array<{ name: string; color: string; values: number[] }>; // values 0..1
  size?: number;
}) {
  const cx = 100;
  const cy = 100;
  const r = 66;
  const n = labels.length;
  if (!n) return null;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i: number, f: number) => [cx + Math.cos(angle(i)) * r * f, cy + Math.sin(angle(i)) * r * f] as const;
  const clamp = (v: number) => Math.min(1, Math.max(0.03, Number.isFinite(v) ? v : 0));
  return (
    <svg viewBox="0 0 200 200" style={{ width: size, height: size }} className="mx-auto block" role="img" aria-label="Channel comparison radar">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={labels.map((_, i) => pt(i, f).join(",")).join(" ")} fill={f === 1 ? "#fafafb" : "none"} stroke="#ececf0" strokeWidth="1" />
      ))}
      {labels.map((_, i) => {
        const [x2, y2] = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x2} y2={y2} stroke="#ececf0" />;
      })}
      {series.map((s) => (
        <g key={s.name}>
          <polygon points={s.values.map((v, i) => pt(i, clamp(v)).join(",")).join(" ")} fill={s.color} fillOpacity="0.12" stroke={s.color} strokeWidth="1.8" strokeLinejoin="round">
            <title>{s.name}</title>
          </polygon>
          {s.values.map((v, i) => {
            const [px, py] = pt(i, clamp(v));
            return <circle key={i} cx={px} cy={py} r="2.4" fill={s.color} />;
          })}
        </g>
      ))}
      {labels.map((label, i) => {
        const [lx, ly] = pt(i, 1.22);
        return <text key={label} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="adm-chart-axis" fontWeight="600">{label}</text>;
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Scatter — spend vs revenue with regression line                     */
/* ------------------------------------------------------------------ */

export function ScatterChart({ points, regression, xLabel, yLabel, formatX = compactNumber, formatY = compactNumber }: {
  points: Array<{ x: number; y: number; label: string }>;
  regression?: { slope: number; intercept: number };
  xLabel: string;
  yLabel: string;
  formatX?: (v: number) => string;
  formatY?: (v: number) => string;
}) {
  const width = 420;
  const height = 240;
  const pad = { top: 14, right: 14, bottom: 34, left: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxX = Math.max(1, ...points.map((p) => p.x));
  const maxY = Math.max(1, ...points.map((p) => p.y));
  const sx = (v: number) => pad.left + (v / maxX) * innerW;
  const sy = (v: number) => pad.top + innerH - (v / maxY) * innerH;
  const clipId = useId().replace(/:/g, "");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} role="img" aria-label={`${xLabel} vs ${yLabel}`}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={pad.left} x2={width - pad.right} y1={pad.top + innerH * (1 - f)} y2={pad.top + innerH * (1 - f)} stroke="#ececf0" />
          <text x={pad.left - 6} y={pad.top + innerH * (1 - f) + 3} textAnchor="end" className="adm-chart-axis">{formatY(maxY * f)}</text>
        </g>
      ))}
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <text key={`x${f}`} x={pad.left + innerW * f} y={height - 8} textAnchor="middle" className="adm-chart-axis">{formatX(maxX * f)}</text>
      ))}
      <text x={pad.left + innerW / 2} y={height - 22} textAnchor="middle" className="adm-chart-axis" fontWeight="600">{xLabel}</text>
      <text x="12" y={pad.top + innerH / 2} textAnchor="middle" className="adm-chart-axis" fontWeight="600" transform={`rotate(-90 12 ${pad.top + innerH / 2})`}>{yLabel}</text>
      <defs><clipPath id={clipId}><rect x={pad.left} y={pad.top} width={innerW} height={innerH} /></clipPath></defs>
      {regression && maxX > 0 && (
        <line clipPath={`url(#${clipId})`}
          x1={sx(0)}
          x2={sx(maxX)}
          y1={sy(regression.intercept)}
          y2={sy(regression.intercept + regression.slope * maxX)}
          stroke="#1d1d1f"
          strokeWidth="1.6"
          strokeDasharray="5 4"
        />
      )}
      {points.map((p, i) => (
        <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r="4" fill="#0a84ff" fillOpacity="0.75" stroke="#fff" strokeWidth="1.2">
          <title>{`${p.label}: ${xLabel} ${formatX(p.x)}, ${yLabel} ${formatY(p.y)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
