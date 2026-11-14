"use client";

/**
 * Overview — the daily pulse. Four numbers that change what you do today, a
 * prioritised action list with one-tap fixes, and the latest orders. Anything
 * that is a report rather than a to-do lives in Analytics.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, BatteryWarning, ChevronRight, CircleDollarSign, Package, PackageCheck, Send, ShieldAlert, ShoppingCart, Zap } from "lucide-react";
import { ops } from "@/db/ops-store";
import { readinessAudit } from "@/lib/settings";
import { formatBDT, timeAgo } from "@/lib/format";
import { flushOutbox, listOrders, lowStock, queueAbandonedCart, STATUS_META, type MerchantOrder } from "@/lib/ops";
import { categoryOf, EARNING, isBuilderOrder, pctChange, UNFULFILLED } from "@/lib/admin-metrics";
import { PageHead } from "./admin-ui";

type Tone = "rose" | "amber" | "sky" | "emerald";
type Task = { id: string; tone: Tone; icon: React.ReactNode; title: string; meta: string; action: string; run: () => void; open: () => void };

export function TrendPill({ value, suffix = "%", invert = false, label }: { value: number | null; suffix?: string; invert?: boolean; label?: string }) {
  if (value === null) return <span className="ax-pill" data-tone="neutral">new</span>;
  const rounded = Math.round(value);
  const good = invert ? rounded <= 0 : rounded >= 0;
  return (
    <span className="ax-pill" data-tone={rounded === 0 ? "neutral" : good ? "up" : "down"} title={label}>
      {rounded > 0 ? "+" : rounded < 0 ? "−" : "±"}{Math.abs(rounded)}{suffix}
    </span>
  );
}

function startOfToday() { const date = new Date(); date.setHours(0, 0, 0, 0); return date.getTime(); }

export function AdminOverview({ onNavigate, onOpenOrder, toast }: {
  onNavigate: (dest: string, sub?: string) => void;
  onOpenOrder: (order: MerchantOrder) => void;
  toast: (message: string) => void;
}) {
  const [version, setVersion] = useState(0);

  const data = useMemo(() => {
    void version;
    const orders = listOrders();
    const today = startOfToday();
    const now = Date.now();
    const elapsed = now - today;
    const yesterday = today - 86400000;
    const earning = (order: MerchantOrder) => EARNING.has(order.status);

    const todays = orders.filter((order) => order.createdAt.getTime() >= today);
    const yesterdayToTime = orders.filter((order) => order.createdAt.getTime() >= yesterday && order.createdAt.getTime() < yesterday + elapsed);
    const revenueToday = todays.filter(earning).reduce((sum, order) => sum + order.total, 0);
    const revenueYesterday = yesterdayToTime.filter(earning).reduce((sum, order) => sum + order.total, 0);

    const unfulfilled = orders.filter((order) => UNFULFILLED.has(order.status));
    const stale = unfulfilled.filter((order) => now - order.createdAt.getTime() > 48 * 3600000);

    const low = lowStock();
    const out = low.filter((product) => product.stock === 0);

    const week = orders.filter((order) => order.createdAt.getTime() >= now - 7 * 86400000 && earning(order));
    const prevWeek = orders.filter((order) => order.createdAt.getTime() >= now - 14 * 86400000 && order.createdAt.getTime() < now - 7 * 86400000 && earning(order));
    const builderWeek = week.filter(isBuilderOrder).length;
    const builderPrev = prevWeek.filter(isBuilderOrder).length;

    return { orders, todays, revenueToday, revenueYesterday, unfulfilled, stale, low, out, builderWeek, builderPrev, weekCount: week.length };
  }, [version]);

  const refresh = () => setVersion((value) => value + 1);

  /* ---------- prioritised tasks ---------- */
  const tasks: Task[] = [];
  const criticalCells = data.low.filter((product) => categoryOf(product.slug) === "Cells");
  const awaitingShipment = data.orders.filter((order) => order.status === "packing" || order.status === "confirmed");
  const pendingPayment = data.orders.filter((order) => order.status === "pending");
  const risky = data.unfulfilled.filter((order) => order.riskFlags.length > 0);
  const queued = ops.state.outbox.filter((row) => row.status === "queued");
  const carts = ops.state.carts.filter((cart) => !cart.recovered && !cart.reminded);
  const blockers = readinessAudit(ops.state.settings).filter((issue) => issue.severity === "blocker");
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  if (data.out.length) tasks.push({
    id: "out", tone: "rose", icon: <BatteryWarning size={16} />,
    title: `${plural(data.out.length, "product")} sold out`, meta: data.out.slice(0, 2).map((p) => p.name).join(", "),
    action: "Restock", run: () => onNavigate("inventory"), open: () => onNavigate("inventory"),
  });
  if (criticalCells.length) tasks.push({
    id: "cells", tone: "rose", icon: <BatteryWarning size={16} />,
    title: `${plural(criticalCells.length, "cell")} critically low`, meta: criticalCells.slice(0, 2).map((p) => `${p.name} (${p.stock})`).join(", "),
    action: "Reorder", run: () => onNavigate("inventory"), open: () => onNavigate("inventory"),
  });
  if (awaitingShipment.length) tasks.push({
    id: "ship", tone: "amber", icon: <PackageCheck size={16} />,
    title: `${plural(awaitingShipment.length, "order")} awaiting shipment`, meta: data.stale.length ? `${data.stale.length} older than 48 hours` : "Pack and book the courier",
    action: "Ship", run: () => onNavigate("orders"), open: () => onNavigate("orders"),
  });
  if (risky.length) tasks.push({
    id: "risk", tone: "rose", icon: <ShieldAlert size={16} />,
    title: `${plural(risky.length, "order")} flagged for risk`, meta: risky[0].riskFlags[0] ?? "Check before dispatch",
    action: "Review", run: () => onOpenOrder(risky[0]), open: () => onOpenOrder(risky[0]),
  });
  if (pendingPayment.length) tasks.push({
    id: "pay", tone: "sky", icon: <CircleDollarSign size={16} />,
    title: `${plural(pendingPayment.length, "payment")} to verify`, meta: "bKash / Nagad claims waiting for a TrxID check",
    action: "Verify", run: () => onOpenOrder(pendingPayment[0]), open: () => onNavigate("orders"),
  });
  if (queued.length) tasks.push({
    id: "outbox", tone: "amber", icon: <Send size={16} />,
    title: `${plural(queued.length, "customer message")} queued`, meta: "Confirmations and courier updates not yet sent",
    action: "Send all", run: () => { flushOutbox(); refresh(); toast(`${plural(queued.length, "message")} sent`); }, open: () => onNavigate("marketing", "growth"),
  });
  if (carts.length) tasks.push({
    id: "carts", tone: "sky", icon: <ShoppingCart size={16} />,
    title: `${plural(carts.length, "abandoned cart")} to recover`, meta: `${formatBDT(carts.reduce((sum, cart) => sum + cart.value, 0))} left at checkout`,
    action: "Remind", run: () => { carts.forEach((cart) => queueAbandonedCart(cart.id)); refresh(); toast(`${plural(carts.length, "reminder")} queued`); }, open: () => onNavigate("marketing", "growth"),
  });
  if (blockers.length) tasks.push({
    id: "blockers", tone: "amber", icon: <AlertTriangle size={16} />,
    title: `${plural(blockers.length, "launch blocker")}`, meta: blockers.slice(0, 2).map((issue) => issue.label).join(" · "),
    action: "Fix", run: () => onNavigate("settings", "settings"), open: () => onNavigate("settings", "settings"),
  });

  const builderShare = data.weekCount ? Math.round((data.builderWeek / data.weekCount) * 100) : 0;
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHead
        title={greeting}
        subtitle={`${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} · ${tasks.length ? `${plural(tasks.length, "thing")} need${tasks.length === 1 ? "s" : ""} you` : "nothing urgent"}`}
      />

      {/* ---------- KPI strip ---------- */}
      <section className="ax-kpis" aria-label="Today at a glance">
        <button type="button" className="ax-kpi" onClick={() => onNavigate("analytics")}>
          <span className="ax-caption">Today’s revenue</span>
          <strong className="ax-kpi-value">{formatBDT(data.revenueToday)}</strong>
          <span className="ax-kpi-foot"><TrendPill value={pctChange(data.revenueToday, data.revenueYesterday)} label="vs yesterday at this time" /> <span className="ax-caption">vs yesterday</span></span>
        </button>
        <button type="button" className="ax-kpi" onClick={() => onNavigate("orders")}>
          <span className="ax-caption">Unfulfilled orders</span>
          <strong className="ax-kpi-value">{data.unfulfilled.length}</strong>
          <span className="ax-kpi-foot">
            <span className="ax-pill" data-tone={data.stale.length ? "down" : "up"}>{data.stale.length ? `${data.stale.length} late` : "on time"}</span>
            <span className="ax-caption">{data.todays.length} new today</span>
          </span>
        </button>
        <button type="button" className="ax-kpi" onClick={() => onNavigate("inventory")}>
          <span className="ax-caption">Low stock alerts</span>
          <strong className="ax-kpi-value">{data.low.length}</strong>
          <span className="ax-kpi-foot">
            <span className="ax-pill" data-tone={data.out.length ? "down" : data.low.length ? "warn" : "up"}>{data.out.length ? `${data.out.length} out` : data.low.length ? "reorder" : "healthy"}</span>
            <span className="ax-caption">at ≤{ops.state.settings.notifications.lowStockThreshold} units</span>
          </span>
        </button>
        <button type="button" className="ax-kpi" data-accent="true" onClick={() => onNavigate("pack-ai")}>
          <span className="ax-caption flex items-center gap-1"><Zap size={11} /> Battery AI conversions</span>
          <strong className="ax-kpi-value">{data.builderWeek}</strong>
          <span className="ax-kpi-foot"><TrendPill value={pctChange(data.builderWeek, data.builderPrev)} label="vs previous 7 days" /> <span className="ax-caption">7d · {builderShare}% of orders</span></span>
        </button>
      </section>

      <div className="ax-overview-grid">
        {/* ---------- needs attention ---------- */}
        <section className="ax-card" aria-labelledby="attention-title">
          <header className="ax-card-head">
            <h2 id="attention-title" className="ax-title-sm">Needs attention</h2>
            {tasks.length > 0 && <span className="ax-pill" data-tone="neutral">{tasks.length}</span>}
          </header>
          {tasks.length === 0 ? (
            <div className="ax-empty"><span className="ax-dot is-static" data-tone="emerald" /> All caught up. New tasks appear here the moment they need you.</div>
          ) : (
            <ul className="ax-tasks">
              {tasks.map((task) => (
                <li key={task.id} className="ax-task" data-tone={task.tone}>
                  <button type="button" className="ax-task-main" onClick={task.open}>
                    <span className="ax-task-icon">{task.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="ax-body block font-semibold">{task.title}</span>
                      <span className="ax-caption block truncate">{task.meta}</span>
                    </span>
                  </button>
                  <button type="button" className="ax-task-action" onClick={task.run}>{task.action}</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------- latest orders ---------- */}
        <section className="ax-card" aria-labelledby="latest-title">
          <header className="ax-card-head">
            <h2 id="latest-title" className="ax-title-sm">Latest orders</h2>
            <button type="button" className="ax-link" onClick={() => onNavigate("orders")}>All orders <ArrowRight size={13} /></button>
          </header>
          {data.orders.length === 0 ? (
            <div className="ax-empty"><Package size={15} /> No orders yet.</div>
          ) : (
            <ul className="ax-rows">
              {data.orders.slice(0, 6).map((order) => (
                <li key={order.orderNumber}>
                  <button type="button" className="ax-row" onClick={() => onOpenOrder(order)}>
                    <i className="ax-dot is-static" style={{ background: STATUS_META[order.status].dot }} title={STATUS_META[order.status].label} aria-label={STATUS_META[order.status].label} />
                    <span className="min-w-0 flex-1">
                      <span className="ax-body block truncate font-medium">{order.customerName}{isBuilderOrder(order) && <Zap size={11} className="ml-1 inline text-[#4d7c0f]" aria-label="Battery Builder order" />}</span>
                      <span className="ax-caption block truncate">{order.orderNumber} · {timeAgo(order.createdAt)}</span>
                    </span>
                    <span className="ax-body ax-num font-semibold">{formatBDT(order.total)}</span>
                    <ChevronRight size={15} className="ax-row-chevron" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
