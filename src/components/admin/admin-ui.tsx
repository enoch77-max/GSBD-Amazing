"use client";

/** Shared primitives for the merchant console: dark instrument-panel styling. */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/format";

export function Panel({ title, subtitle, action, children, className, id }: {
  title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string; id?: string;
}) {
  return (
    <section id={id} className={cn("adm-panel", className)}>
      {(title || action) && (
        <header className="adm-panel-head">
          <div className="min-w-0">
            {title && <h2 className="adm-panel-title">{title}</h2>}
            {subtitle && <p className="adm-panel-sub">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="adm-panel-body">{children}</div>
    </section>
  );
}

export function Stat({ label, value, delta, hint, tone = "volt", icon }: {
  label: string; value: string; delta?: number; hint?: string; tone?: "volt" | "sky" | "amber" | "rose" | "emerald"; icon?: ReactNode;
}) {
  return (
    <div className="adm-stat" data-tone={tone}>
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
        {hint && <span className="adm-stat-hint">{hint}</span>}
      </div>
    </div>
  );
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: string; className?: string }) {
  return <span className={cn("adm-badge", className)} data-tone={tone}>{children}</span>;
}

export function Button({ children, variant = "default", size = "md", className, ...rest }: {
  children: ReactNode; variant?: "default" | "primary" | "accent" | "ghost" | "danger"; size?: "sm" | "md";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={cn("adm-btn", className)} data-variant={variant} data-size={size} {...rest}>
      {children}
    </button>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <label className="adm-field" htmlFor={htmlFor}>
      <span className="adm-field-label">{label}</span>
      {children}
      {hint && <span className="adm-field-hint">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (next: boolean) => void; label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="adm-toggle-row">
      <div className="min-w-0">
        <label htmlFor={id} className="adm-toggle-label">{label}</label>
        {hint && <p className="adm-field-hint">{hint}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="adm-switch"
        data-on={checked}
      >
        <span />
      </button>
    </div>
  );
}

/** Shown when the signed-in role can view a section but not change it. */
export function ReadOnlyNote({ children }: { children?: ReactNode }) {
  return (
    <p className="adm-readonly-note" role="note">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
      {children ?? "View only — your role cannot change this section."}
    </p>
  );
}

export function PageHead({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="adm-page-head">
      <div className="min-w-0">
        <h1 className="adm-page-title">{title}</h1>
        {subtitle && <p className="adm-page-sub">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ icon, title, body }: { icon?: ReactNode; title: string; body?: string }) {
  return (
    <div className="adm-empty">
      {icon && <span className="adm-empty-icon">{icon}</span>}
      <p className="adm-empty-title">{title}</p>
      {body && <p className="adm-empty-body">{body}</p>}
    </div>
  );
}

/** Focus-trapped slide-over used for order detail and editors. */
export function Drawer({ open, onClose, title, subtitle, children, footer, wide }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  /* Hold the latest close handler without re-running the open effect: callers
     often pass a fresh closure each render, and re-running would steal focus
     from the field being typed into. */
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab" || !ref.current) return;
      const focusable = [...ref.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")]
        .filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="adm-drawer-root">
      <button type="button" className="adm-scrim" aria-label="Close panel" onClick={onClose} />
      <div className="adm-drawer" data-wide={wide} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <header className="adm-drawer-head">
          <div className="min-w-0">
            <h2 className="adm-drawer-title">{title}</h2>
            {subtitle && <p className="adm-panel-sub">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="adm-icon-btn"><X size={16} /></button>
        </header>
        <div className="adm-drawer-body adm-scroll">{children}</div>
        {footer && <footer className="adm-drawer-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Charts — hand-rolled SVG, no chart library                          */
/* ------------------------------------------------------------------ */

export type SeriesPoint = { label: string; revenue: number; spend: number; orders: number };

/** Revenue area with an overlaid spend line; hover reads out the day. */
export function RevenueChart({ data, height = 190 }: { data: SeriesPoint[]; height?: number }) {
  const gradientId = useId();
  const width = 720;
  const pad = { top: 16, right: 12, bottom: 26, left: 12 };
  const max = Math.max(1, ...data.map((point) => Math.max(point.revenue, point.spend)));
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (index: number) => pad.left + (data.length <= 1 ? innerW / 2 : (index / (data.length - 1)) * innerW);
  const y = (value: number) => pad.top + innerH - (value / max) * innerH;

  const line = (key: "revenue" | "spend") =>
    data.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");
  const area = `${line("revenue")} L${x(data.length - 1).toFixed(1)},${pad.top + innerH} L${x(0).toFixed(1)},${pad.top + innerH} Z`;

  return (
    <div className="adm-chart">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} role="img" aria-label="Revenue and ad spend over time">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#65a30d" stopOpacity="0.42" />
            <stop offset="60%" stopColor="#4ea87c" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#65a30d" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((fraction) => (
          <line key={fraction} x1={pad.left} x2={width - pad.right} y1={pad.top + innerH * (1 - fraction)} y2={pad.top + innerH * (1 - fraction)} stroke="#ececf0" strokeWidth="1" />
        ))}
        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line("revenue")} fill="none" stroke="#65a30d" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
        <path d={line("spend")} fill="none" stroke="#f59e0b" strokeWidth="1.75" strokeDasharray="5 4" strokeLinecap="round" />
        {data.map((point, index) => (
          <g key={point.label} className="adm-chart-hit">
            <rect x={x(index) - innerW / (data.length * 2)} y={pad.top} width={innerW / data.length} height={innerH} fill="transparent" />
            <circle cx={x(index)} cy={y(point.revenue)} r="3" fill="#ffffff" stroke="#65a30d" strokeWidth="2" className="adm-chart-dot" />
            <title>{`${point.label} · revenue ৳${point.revenue.toLocaleString("en-IN")} · spend ৳${point.spend.toLocaleString("en-IN")} · ${point.orders} orders`}</title>
          </g>
        ))}
        {data.map((point, index) =>
          index % Math.ceil(data.length / 7) === 0 ? (
            <text key={`t-${point.label}`} x={x(index)} y={height - 8} textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"} className="adm-chart-axis">{point.label}</text>
          ) : null,
        )}
      </svg>
      <div className="adm-legend">
        <span><i style={{ background: "#65a30d" }} /> Revenue</span>
        <span><i style={{ background: "#f59e0b" }} /> Ad spend</span>
      </div>
    </div>
  );
}

/** Horizontal bars with direct labels — readable without relying on colour alone. */
export function BarList({ rows, format }: { rows: Array<{ label: string; value: number; caption?: string; tone?: string }>; format: (value: number) => string }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <ul className="adm-barlist">
      {rows.map((row, index) => (
        <li key={row.label}>
          <div className="adm-barlist-head">
            <span className="truncate">{row.label}</span>
            <span className="adm-mono">{format(row.value)}</span>
          </div>
          <div className="adm-barlist-track">
            <span style={{ width: `${Math.max(3, (row.value / max) * 100)}%`, background: row.tone ?? CHART_HUES[index % CHART_HUES.length] }} />
          </div>
          {row.caption && <p className="adm-barlist-caption">{row.caption}</p>}
        </li>
      ))}
    </ul>
  );
}

/** Six separable hues, each paired with a direct label wherever it is used. */
export const CHART_HUES = ["#65a30d", "#0a84ff", "#f59e0b", "#ec4899", "#10b981", "#8b5cf6"];

export function Donut({ slices, total, caption }: { slices: Array<{ label: string; value: number; color: string }>; total: string; caption: string }) {
  const sum = slices.reduce((acc, slice) => acc + slice.value, 0) || 1;
  let offset = 0;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="adm-donut">
      <svg viewBox="0 0 140 140" className="size-[140px] shrink-0" role="img" aria-label={caption}>
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#f2f2f7" strokeWidth="16" />
        {slices.map((slice) => {
          const length = (slice.value / sum) * circumference;
          const element = (
            <circle
              key={slice.label}
              cx="70" cy="70" r={radius} fill="none"
              stroke={slice.color} strokeWidth="16"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 70 70)"
              strokeLinecap="butt"
            >
              <title>{`${slice.label}: ${slice.value}`}</title>
            </circle>
          );
          offset += length;
          return element;
        })}
        <text x="70" y="66" textAnchor="middle" className="adm-donut-value">{total}</text>
        <text x="70" y="84" textAnchor="middle" className="adm-donut-caption">{caption}</text>
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

/**
 * Destructive action guard: the first click arms the button, the second
 * commits. Auto-disarms after 5s and can be cancelled, so an accidental click
 * on "Restore defaults" never wipes a store's configuration.
 */
export function ConfirmButton({ children, confirmLabel = "Click again to confirm", onConfirm, variant = "danger", size = "md", className, disabled }: {
  children: ReactNode; confirmLabel?: string; onConfirm: () => void;
  variant?: "default" | "primary" | "accent" | "ghost" | "danger"; size?: "sm" | "md"; className?: string; disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 5000);
    return () => window.clearTimeout(timer);
  }, [armed]);
  return (
    <span className="adm-confirm" data-armed={armed}>
      {armed ? (
        <>
          <Button variant={variant} size={size} className={className} onClick={() => { setArmed(false); onConfirm(); }} autoFocus>
            <Check size={13} /> {confirmLabel}
          </Button>
          <button type="button" className="adm-confirm-cancel" onClick={() => setArmed(false)}>Cancel</button>
        </>
      ) : (
        <Button variant={variant} size={size} className={className} disabled={disabled} onClick={() => setArmed(true)} aria-live="polite">
          {children}
        </Button>
      )}
    </span>
  );
}
