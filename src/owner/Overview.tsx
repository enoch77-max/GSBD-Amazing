"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight, Boxes, CircleDollarSign, PackageCheck, Percent, ShoppingCart, TrendingUp, Truck } from "lucide-react";
import { api } from "@/lib/live";
import { formatBDT, formatDate } from "@/lib/format";
import { Badge, BarList, Button, CHART_HUES, Donut, Empty, Panel, RevenueChart, Stat } from "@/components/admin/admin-ui";

type Kpi = {
  revenue: number; orders: number; aov: number; units: number; cancelled: number;
  pending: number; codShare: number; paidRevenue: number; spend: number; roas: number; profit: number;
};

type OverviewPayload = {
  current: Kpi;
  previous: Kpi;
  series: Array<{ date: string; label: string; revenue: number; orders: number; spend: number }>;
  channels: Array<{ channel: string; orders: number; revenue: number; spend: number; roas: number; aov: number }>;
  topProducts: Array<{ slug: string; name: string; units: number; revenue: number }>;
  statusCounts: Array<{ status: string; count: number }>;
  lowStock: Array<{ slug: string; name: string; sku: string; price: number; stock: number }>;
  recent: Array<{ orderNumber: string; customerName: string; district: string; status: string; total: number; createdAt: string }>;
  issues: Array<{ id: string; label: string; detail: string; severity: string; href: string }>;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting payment", confirmed: "Confirmed", packing: "Packing", shipped: "Shipped",
  delivered: "Delivered", cancelled: "Cancelled", returned: "Returned",
};

export function OwnerOverview({ onOpenOrder }: { onOpenOrder: (orderNumber: string) => void }) {
  const [days, setDays] = useState(14);
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api<OverviewPayload>(`/api/admin/overview?days=${days}`));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not load the overview.");
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <Panel title="Trading overview">
        <Empty icon={<AlertTriangle size={22} />} title="Could not load figures" body={error} />
        <div className="mt-3 flex justify-center"><Button size="sm" onClick={() => void load()}>Try again</Button></div>
      </Panel>
    );
  }
  if (!data) {
    return (
      <Panel title="Trading overview" subtitle="Loading live figures…">
        <div className="adm-kpis">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="adm-stat"><span className="adm-stat-label">…</span></div>)}</div>
      </Panel>
    );
  }

  const { current, previous } = data;
  const delta = (now: number, before: number) => (before > 0 ? ((now - before) / before) * 100 : now > 0 ? 100 : 0);
  const blockers = data.issues.filter((issue) => issue.severity === "blocker");
  const slices = data.statusCounts.map((entry, index) => ({
    label: STATUS_LABEL[entry.status] ?? entry.status,
    value: entry.count,
    color: CHART_HUES[index % CHART_HUES.length],
  }));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[1.5rem] font-bold leading-tight">Trading overview</h1>
          <p className="text-[0.78rem] text-[#8aa697]">Live figures from orders, inventory and ad spend.</p>
        </div>
        <div className="flex gap-1.5">
          {[7, 14, 30].map((value) => (
            <button key={value} type="button" className="adm-chip" data-active={days === value} onClick={() => setDays(value)}>
              {value} days
            </button>
          ))}
        </div>
      </div>

      <div className="adm-kpis">
        <Stat label="Revenue" value={formatBDT(current.revenue)} delta={delta(current.revenue, previous.revenue)} hint={`vs previous ${days}d`} icon={<CircleDollarSign size={16} />} />
        <Stat label="Orders" value={String(current.orders)} delta={delta(current.orders, previous.orders)} hint={`${current.units} units`} tone="sky" icon={<ShoppingCart size={16} />} />
        <Stat label="Average order" value={formatBDT(current.aov)} delta={delta(current.aov, previous.aov)} hint="per order" tone="emerald" icon={<TrendingUp size={16} />} />
        <Stat label="Ad spend" value={formatBDT(current.spend)} hint={`${data.channels.length} channels`} tone="amber" icon={<Percent size={16} />} />
        <Stat label="ROAS" value={current.roas ? `${current.roas.toFixed(2)}×` : "—"} delta={delta(current.roas, previous.roas)} hint={current.profit >= 0 ? `${formatBDT(current.profit)} profit` : `${formatBDT(Math.abs(current.profit))} loss`} tone={current.roas >= 2 ? "emerald" : "rose"} icon={<ArrowUpRight size={16} />} />
        <Stat label="COD share" value={`${current.codShare}%`} hint={`${formatBDT(current.revenue - current.paidRevenue)} to collect`} tone="amber" icon={<Truck size={16} />} />
      </div>

      {blockers.length > 0 && (
        <Panel title="Before you spend on ads" subtitle={`${blockers.length} blocker${blockers.length === 1 ? "" : "s"} must be cleared for a real launch`}>
          <ul className="adm-checklist">
            {data.issues.map((issue) => (
              <li key={issue.id}>
                <AlertTriangle size={15} className={issue.severity === "blocker" ? "mt-0.5 shrink-0 text-[#fb7185]" : "mt-0.5 shrink-0 text-[#f59e0b]"} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[0.83rem] font-semibold">
                    {issue.label}
                    <Badge tone={issue.severity === "blocker" ? "rose" : "amber"}>{issue.severity}</Badge>
                  </p>
                  <p className="mt-0.5 text-[0.73rem] leading-relaxed text-[#8aa697]">{issue.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Revenue against ad spend" subtitle={`Daily, last ${days} days · hover a point for the breakdown`}>
        <RevenueChart data={data.series} />
      </Panel>

      <div className="adm-grid lg:grid-cols-2">
        <Panel title="Channel performance" subtitle="Attributed revenue, spend and return">
          {data.channels.length === 0 ? (
            <Empty title="No attributed orders yet" body="Orders placed from an ad click carry their source automatically." />
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead><tr><th>Channel</th><th className="text-right">Orders</th><th className="text-right">Revenue</th><th className="text-right">Spend</th><th className="text-right">ROAS</th></tr></thead>
                <tbody>
                  {data.channels.map((row, index) => (
                    <tr key={row.channel}>
                      <td><span className="inline-flex items-center gap-2"><i className="size-2 rounded-full" style={{ background: CHART_HUES[index % CHART_HUES.length] }} /><span className="capitalize">{row.channel}</span></span></td>
                      <td className="adm-num text-right">{row.orders}</td>
                      <td className="adm-num text-right">{formatBDT(row.revenue)}</td>
                      <td className="adm-num text-right text-[#8aa697]">{row.spend ? formatBDT(row.spend) : "—"}</td>
                      <td className="adm-num text-right">{row.roas ? <Badge tone={row.roas >= 2 ? "emerald" : row.roas >= 1 ? "amber" : "rose"}>{row.roas.toFixed(2)}×</Badge> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Order pipeline" subtitle="Every order by current stage">
          {slices.length ? <Donut slices={slices} total={String(slices.reduce((sum, slice) => sum + slice.value, 0))} caption="orders" /> : <Empty title="No orders yet" />}
        </Panel>
      </div>

      <div className="adm-grid lg:grid-cols-2">
        <Panel title="Best sellers" subtitle="By attributed revenue">
          {data.topProducts.length ? (
            <BarList rows={data.topProducts.map((row) => ({ label: row.name, value: row.revenue, caption: `${row.units} units sold` }))} format={formatBDT} />
          ) : (
            <Empty title="Nothing sold in this window" />
          )}
        </Panel>

        <Panel title="Reorder alerts" subtitle={`${data.lowStock.length} SKU${data.lowStock.length === 1 ? "" : "s"} running low`}>
          {data.lowStock.length ? (
            <ul className="flex flex-col gap-2.5">
              {data.lowStock.map((product) => (
                <li key={product.slug} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.8rem] font-medium">{product.name}</p>
                    <p className="text-[0.68rem] text-[#8aa697]">{product.sku} · {formatBDT(product.price)}</p>
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

      <Panel title="Latest orders" subtitle="Newest first — click a row to open it">
        {data.recent.length === 0 ? (
          <Empty icon={<Boxes size={22} />} title="No orders yet" body="When the first order lands it appears here instantly." />
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th className="text-right">Total</th><th className="text-right">Placed</th></tr></thead>
              <tbody>
                {data.recent.map((order) => (
                  <tr key={order.orderNumber} className="cursor-pointer" onClick={() => onOpenOrder(order.orderNumber)}>
                    <td className="adm-num text-[#c9f16b]">{order.orderNumber}</td>
                    <td><p className="font-medium">{order.customerName}</p><p className="text-[0.68rem] text-[#8aa697]">{order.district}</p></td>
                    <td><Badge tone={order.status === "delivered" ? "emerald" : order.status === "cancelled" ? "rose" : "volt"}>{STATUS_LABEL[order.status] ?? order.status}</Badge></td>
                    <td className="adm-num text-right">{formatBDT(order.total)}</td>
                    <td className="text-right text-[0.72rem] text-[#8aa697]">{formatDate(order.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
