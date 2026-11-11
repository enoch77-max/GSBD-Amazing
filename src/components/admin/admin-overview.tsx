"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, Boxes, CircleDollarSign, PackageCheck, Percent, ShoppingCart, TrendingUp, Truck, Users } from "lucide-react";
import { ops } from "@/db/ops-store";
import { readinessAudit } from "@/lib/settings";
import { formatBDT, formatDate } from "@/lib/format";
import {
  channelReport, computeKpis, dailySeries, listOrders, lowStock, topProducts, inventoryValue,
  STATUS_META, type MerchantOrder,
} from "@/lib/ops";
import { Badge, BarList, Button, CHART_HUES, Donut, Empty, Panel, RevenueChart, Stat } from "./admin-ui";

const RANGES = [
  { id: 7, label: "7 days" },
  { id: 14, label: "14 days" },
  { id: 30, label: "30 days" },
];

export function AdminOverview({ onNavigate, onOpenOrder }: { onNavigate: (tab: string) => void; onOpenOrder: (order: MerchantOrder) => void }) {
  const [days, setDays] = useState(14);
  const orders = useMemo(() => listOrders(), []);
  const settings = ops.state.settings;

  const { current, previous, series, channels, products, issues, stock } = useMemo(() => {
    const now = new Date();
    const from = new Date(now.getTime() - days * 86400000);
    const prevFrom = new Date(now.getTime() - days * 2 * 86400000);
    return {
      current: computeKpis(orders, from, now),
      previous: computeKpis(orders, prevFrom, from),
      series: dailySeries(orders, days),
      channels: channelReport(orders, days),
      products: topProducts(orders, 5),
      issues: readinessAudit(settings),
      stock: lowStock(),
    };
  }, [orders, days, settings]);

  const delta = (now: number, before: number) => (before > 0 ? ((now - before) / before) * 100 : now > 0 ? 100 : 0);
  const blockers = issues.filter((issue) => issue.severity === "blocker");
  const recent = orders.slice(0, 6);
  const statusCounts = (["pending", "confirmed", "packing", "shipped", "delivered", "cancelled"] as const).map((status, index) => ({
    label: STATUS_META[status].label,
    value: orders.filter((order) => order.status === status).length,
    color: CHART_HUES[index % CHART_HUES.length],
  })).filter((slice) => slice.value > 0);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="adm-page-title">Trading overview</h1>
          <p className="text-[0.78rem] text-[#6e6e73]">Live figures from orders, inventory and ad spend.</p>
        </div>
        <div className="flex gap-1.5">
          {RANGES.map((range) => (
            <button key={range.id} type="button" className="adm-chip" data-active={days === range.id} onClick={() => setDays(range.id)}>
              {range.label}
            </button>
          ))}
        </div>
      </div>

      <div className="adm-kpis">
        <Stat label="Revenue" value={formatBDT(current.revenue)} delta={delta(current.revenue, previous.revenue)} hint={`vs previous ${days}d`} icon={<CircleDollarSign size={16} />} />
        <Stat label="Orders" value={String(current.orders)} delta={delta(current.orders, previous.orders)} hint={`${current.units} units sold`} tone="sky" icon={<ShoppingCart size={16} />} />
        <Stat label="Average order" value={formatBDT(current.aov)} delta={delta(current.aov, previous.aov)} hint="per order" tone="emerald" icon={<TrendingUp size={16} />} />
        <Stat label="Ad spend" value={formatBDT(current.spend)} hint={`${channels.length} channels`} tone="amber" icon={<Percent size={16} />} />
        <Stat label="ROAS" value={current.roas ? `${current.roas.toFixed(2)}×` : "—"} delta={delta(current.roas, previous.roas)} hint={current.profit >= 0 ? `${formatBDT(current.profit)} profit` : `${formatBDT(Math.abs(current.profit))} loss`} tone={current.roas >= 2 ? "emerald" : "rose"} icon={<ArrowUpRight size={16} />} />
        <Stat label="COD share" value={`${current.codShare}%`} hint={`${formatBDT(current.revenue - current.paidRevenue)} to collect`} tone="amber" icon={<Truck size={16} />} />
      </div>

      {blockers.length > 0 && (
        <Panel
          title="Before you spend on ads"
          subtitle={`${blockers.length} blocker${blockers.length === 1 ? "" : "s"} must be cleared for a real launch`}
          action={<Button size="sm" variant="primary" onClick={() => onNavigate("settings")}>Open settings</Button>}
        >
          <ul className="adm-checklist">
            {issues.map((issue) => (
              <li key={issue.id}>
                <AlertTriangle size={15} className={issue.severity === "blocker" ? "mt-0.5 shrink-0 text-[#e11d48]" : "mt-0.5 shrink-0 text-[#f59e0b]"} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[0.83rem] font-semibold">
                    {issue.label}
                    <Badge tone={issue.severity === "blocker" ? "rose" : "amber"}>{issue.severity}</Badge>
                  </p>
                  <p className="mt-0.5 text-[0.73rem] leading-relaxed text-[#6e6e73]">{issue.detail}</p>
                </div>
              </li>
            ))}
            {issues.length === 0 && (
              <li><PackageCheck size={15} className="mt-0.5 shrink-0 text-[#10b981]" /><p className="text-[0.83rem]">Every launch check passed. You are clear to take live traffic.</p></li>
            )}
          </ul>
        </Panel>
      )}

      <Panel title="Revenue against ad spend" subtitle={`Daily, last ${days} days · hover a point for the breakdown`}>
        <RevenueChart data={series} />
      </Panel>

      <div className="adm-grid lg:grid-cols-2">
        <Panel title="Channel performance" subtitle="Attributed revenue, spend and return" action={<Button size="sm" variant="ghost" onClick={() => onNavigate("growth")}>Details</Button>}>
          {channels.length === 0 ? (
            <Empty title="No attributed orders yet" body="Orders placed from an ad click carry their source automatically." />
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead><tr><th>Channel</th><th className="text-right">Orders</th><th className="text-right">Revenue</th><th className="text-right">Spend</th><th className="text-right">ROAS</th></tr></thead>
                <tbody>
                  {channels.map((row, index) => (
                    <tr key={row.channel}>
                      <td>
                        <span className="inline-flex items-center gap-2">
                          <i className="size-2 rounded-full" style={{ background: CHART_HUES[index % CHART_HUES.length] }} />
                          <span className="capitalize">{row.channel}</span>
                        </span>
                      </td>
                      <td className="adm-num text-right">{row.orders}</td>
                      <td className="adm-num text-right">{formatBDT(row.revenue)}</td>
                      <td className="adm-num text-right text-[#6e6e73]">{row.spend ? formatBDT(row.spend) : "—"}</td>
                      <td className="adm-num text-right">
                        {row.roas ? <Badge tone={row.roas >= 2 ? "emerald" : row.roas >= 1 ? "amber" : "rose"}>{row.roas.toFixed(2)}×</Badge> : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Order pipeline" subtitle="Every order by current stage">
          {statusCounts.length ? (
            <Donut slices={statusCounts} total={String(orders.length)} caption="orders" />
          ) : (
            <Empty title="No orders yet" />
          )}
        </Panel>
      </div>

      <div className="adm-grid lg:grid-cols-2">
        <Panel title="Best sellers" subtitle="By attributed revenue">
          {products.length ? (
            <BarList rows={products.map((row) => ({ label: row.name, value: row.revenue, caption: `${row.units} units sold` }))} format={formatBDT} />
          ) : (
            <Empty title="Nothing sold in this window" />
          )}
        </Panel>

        <Panel
          title="Reorder alerts"
          subtitle={`${stock.length} SKU${stock.length === 1 ? "" : "s"} at or below ${settings.notifications.lowStockThreshold} units · ${formatBDT(inventoryValue())} stock at retail`}
          action={<Button size="sm" variant="ghost" onClick={() => onNavigate("inventory")}><Boxes size={13} /> Inventory</Button>}
        >
          {stock.length ? (
            <ul className="flex flex-col gap-2.5">
              {stock.slice(0, 6).map((product) => (
                <li key={product.slug} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.8rem] font-medium">{product.name}</p>
                    <p className="text-[0.68rem] text-[#6e6e73]">{product.sku} · {formatBDT(product.price)}</p>
                  </div>
                  <Badge tone={product.stock === 0 ? "rose" : "amber"}>{product.stock === 0 ? "Out of stock" : `${product.stock} left`}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={<PackageCheck size={22} />} title="Stock levels are healthy" />
          )}
        </Panel>
      </div>

      <Panel
        title="Latest orders"
        subtitle="Newest first"
        action={<Button size="sm" variant="ghost" onClick={() => onNavigate("orders")}><Users size={13} /> All orders</Button>}
      >
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th className="text-right">Total</th><th className="text-right">Placed</th></tr></thead>
            <tbody>
              {recent.map((order) => (
                <tr key={order.orderNumber} className="cursor-pointer" onClick={() => onOpenOrder(order)}>
                  <td className="adm-num text-[#4d7c0f]">{order.orderNumber}</td>
                  <td>
                    <p className="font-medium">{order.customerName}</p>
                    <p className="text-[0.68rem] text-[#6e6e73]">{order.district}</p>
                  </td>
                  <td><Badge tone={order.status === "delivered" ? "emerald" : order.status === "cancelled" ? "rose" : "volt"}>{STATUS_META[order.status].label}</Badge></td>
                  <td className="adm-num text-right">{formatBDT(order.total)}</td>
                  <td className="text-right text-[0.72rem] text-[#6e6e73]">{formatDate(order.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
