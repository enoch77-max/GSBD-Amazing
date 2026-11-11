"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, BadgeCheck, Check, ChevronDown, Copy, CreditCard, Download,
  MapPin, MessageSquarePlus, Package, Phone, RotateCcw, Search, Send, Truck, X,
} from "lucide-react";
import { api, ApiError } from "@/lib/live";
import { formatBDT, formatDate } from "@/lib/format";
import { Badge, Button, Drawer, Empty, Panel } from "@/components/admin/admin-ui";

export type OwnerOrder = {
  orderNumber: string; customerName: string; phone: string; email: string | null;
  district: string; address: string; customerNote: string | null;
  paymentMethod: string; deliveryMethod: string; promoCode: string | null;
  subtotal: number; shipping: number; discount: number; total: number;
  status: string; courierProvider: string | null; courierConsignment: string | null;
  createdAt: string; itemCount?: number;
  items: Array<{ id: number; slug: string; name: string; image: string; unitPrice: number; qty: number; packSpec?: { series: number; parallel: number; loadCurrentA?: number; components?: Array<{ key: string; slug: string | null; name: string; qty: number; total: number }> } | null }>;
  events: Array<{ id: number; status: string; label: string; note: string | null; actor: string; createdAt: string }>;
  notes: Array<{ id: number; body: string; actor: string; createdAt: string }>;
  attribution: { source: string; medium: string; campaign: string | null; content: string | null; landingPage: string | null; sessionId: string | null } | null;
  paymentStatus: string; paymentProvider: string; trxId: string | null;
  riskFlags: string[];
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting payment", confirmed: "Confirmed", packing: "Packing", shipped: "Shipped",
  delivered: "Delivered", cancelled: "Cancelled", returned: "Returned", open: "Open", all: "All",
};

const STATUS_FILTERS = ["open", "all", "pending", "confirmed", "packing", "shipped", "delivered", "cancelled", "returned"];

const toneFor = (status: string) =>
  status === "delivered" ? "emerald" : status === "cancelled" || status === "returned" ? "rose" : status === "pending" ? "amber" : status === "shipped" ? "violet" : "volt";

export function OwnerOrders({ focus, onFocusDone, toast }: { focus: string | null; onFocusDone: () => void; toast: (message: string) => void }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("open");
  const [payment, setPayment] = useState("all");
  const [sort, setSort] = useState("recent");
  const [orders, setOrders] = useState<OwnerOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [checked, setChecked] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ status, payment, sort, q: query, limit: "50" });
    const payload = await api<{ orders: OwnerOrder[]; total: number }>(`/api/admin/orders?${params.toString()}`);
    setOrders(payload.orders);
    setTotal(payload.total);
  }, [query, status, payment, sort]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load().catch(() => {}), query ? 350 : 0);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  useEffect(() => {
    if (focus) {
      setSelected(focus);
      onFocusDone();
    }
  }, [focus, onFocusDone]);

  const fail = (error: unknown, fallback: string) => toast(error instanceof ApiError ? error.message : fallback);

  const runBulk = async (next: string) => {
    setBusy(true);
    try {
      const result = await api<{ updated: number }>("/api/admin/orders/bulk", { method: "POST", body: { numbers: checked, status: next } });
      toast(`${result.updated} order${result.updated === 1 ? "" : "s"} moved to ${STATUS_LABEL[next].toLowerCase()}`);
      setChecked([]);
      await load();
    } catch (error) {
      fail(error, "Bulk update failed.");
    } finally {
      setBusy(false);
    }
  };

  const allChecked = orders.length > 0 && orders.every((order) => checked.includes(order.orderNumber));
  const selectedValue = orders.filter((order) => checked.includes(order.orderNumber)).reduce((sum, order) => sum + order.total, 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[1.5rem] font-bold leading-tight">Orders</h1>
          <p className="text-[0.78rem] text-[#6e6e73]">{orders.length} shown · {total} total · fulfil, message and export from here.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => { window.location.assign(`/api/admin/export/orders.csv?status=${status}`); toast("Orders export downloading"); }}><Download size={13} /> Orders CSV</Button>
          <Button size="sm" onClick={() => { window.location.assign("/api/admin/export/manifest.csv"); toast("Courier manifest downloading"); }}><Truck size={13} /> Courier manifest</Button>
        </div>
      </div>

      <Panel>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8e8e93]" />
              <input className="adm-input pl-8" placeholder="Search order, name, phone, district…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search orders" />
            </div>
            <select className="adm-select w-auto" value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort orders">
              <option value="recent">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="value">Highest value</option>
            </select>
            <select className="adm-select w-auto" value={payment} onChange={(event) => setPayment(event.target.value)} aria-label="Payment filter">
              <option value="all">Any payment</option>
              <option value="cod">Cash on delivery</option>
              <option value="prepaid">Prepaid</option>
              <option value="unpaid">Not yet paid</option>
            </select>
          </div>
          <div className="adm-scroll flex gap-1.5 overflow-x-auto pb-1">
            {STATUS_FILTERS.map((filter) => (
              <button key={filter} type="button" className="adm-chip" data-active={status === filter} onClick={() => setStatus(filter)}>
                {STATUS_LABEL[filter]}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      {checked.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#b8de6f] bg-[#f1f9e0] px-3 py-2.5">
          <span className="text-[0.8rem] font-semibold text-[#1d1d1f]">{checked.length} selected · {formatBDT(selectedValue)}</span>
          <div className="ml-auto flex flex-wrap gap-1.5">
            <Button size="sm" disabled={busy} onClick={() => void runBulk("packing")}><Package size={12} /> Mark packing</Button>
            <Button size="sm" disabled={busy} onClick={() => void runBulk("shipped")}><Truck size={12} /> Mark shipped</Button>
            <Button size="sm" disabled={busy} variant="primary" onClick={() => void runBulk("delivered")}><Check size={12} /> Mark delivered</Button>
            <Button size="sm" disabled={busy} variant="danger" onClick={() => void runBulk("cancelled")}><X size={12} /> Cancel</Button>
            <Button size="sm" disabled={busy} variant="ghost" onClick={() => setChecked([])}>Clear</Button>
          </div>
        </div>
      )}

      <Panel>
        {orders.length === 0 ? (
          <Empty icon={<Search size={22} />} title="No orders match" body="Try a different status or clear the search." />
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th className="w-9">
                    <input type="checkbox" className="adm-checkbox" checked={allChecked} onChange={() => setChecked(allChecked ? [] : orders.map((order) => order.orderNumber))} aria-label="Select all orders" />
                  </th>
                  <th>Order</th><th>Customer</th><th>Status</th><th>Payment</th><th className="text-right">Total</th><th className="text-right">Placed</th><th />
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.orderNumber} data-selected={checked.includes(order.orderNumber)}>
                    <td>
                      <input
                        type="checkbox" className="adm-checkbox" checked={checked.includes(order.orderNumber)} aria-label={`Select ${order.orderNumber}`}
                        onChange={() => setChecked((current) => current.includes(order.orderNumber) ? current.filter((entry) => entry !== order.orderNumber) : [...current, order.orderNumber])}
                      />
                    </td>
                    <td><button type="button" className="adm-num text-[#4d7c0f] hover:underline" onClick={() => setSelected(order.orderNumber)}>{order.orderNumber}</button></td>
                    <td><p className="font-medium">{order.customerName}</p><p className="adm-num text-[0.68rem] text-[#6e6e73]">{order.phone} · {order.district}</p></td>
                    <td><Badge tone={toneFor(order.status)}>{STATUS_LABEL[order.status] ?? order.status}</Badge></td>
                    <td className="text-[0.72rem] uppercase text-[#6e6e73]">{order.paymentMethod}</td>
                    <td className="adm-num text-right font-semibold">{formatBDT(order.total)}</td>
                    <td className="text-right text-[0.7rem] text-[#6e6e73]">{formatDate(order.createdAt)}</td>
                    <td className="text-right"><Button size="sm" variant="ghost" onClick={() => setSelected(order.orderNumber)}>Open</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {selected && <OrderDrawer orderNumber={selected} onClose={() => setSelected(null)} onChanged={() => void load()} toast={toast} />}
    </>
  );
}

/* ------------------------------------------------------------------ */

function OrderDrawer({ orderNumber, onClose, onChanged, toast }: {
  orderNumber: string; onClose: () => void; onChanged: () => void; toast: (message: string) => void;
}) {
  const [order, setOrder] = useState<OwnerOrder | null>(null);
  const [note, setNote] = useState("");
  const [trx, setTrx] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmRefund, setConfirmRefund] = useState(false);

  const load = useCallback(async () => {
    const payload = await api<{ order: OwnerOrder }>(`/api/admin/orders/${encodeURIComponent(orderNumber)}`);
    setOrder(payload.order);
  }, [orderNumber]);

  useEffect(() => {
    void load().catch((error: unknown) => toast(error instanceof ApiError ? error.message : "Could not open the order."));
  }, [load, toast]);

  if (!order) {
    return <Drawer open onClose={onClose} title={orderNumber} subtitle="Loading…"><Empty title="Loading order…" /></Drawer>;
  }

  const act = async (body: Record<string, unknown>, message: string) => {
    setBusy(true);
    try {
      const payload = await api<{ order: OwnerOrder }>(`/api/admin/orders/${encodeURIComponent(orderNumber)}`, { method: "PATCH", body });
      setOrder(payload.order);
      onChanged();
      toast(message);
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "That did not work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const refund = async () => {
    setBusy(true);
    try {
      const payload = await api<{ message: string; order: OwnerOrder }>(`/api/admin/orders/${encodeURIComponent(orderNumber)}/refund`, { method: "POST", body: {} });
      setOrder(payload.order);
      setConfirmRefund(false);
      onChanged();
      toast(payload.message);
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Refund failed.");
    } finally {
      setBusy(false);
    }
  };

  const flow = ["pending", "confirmed", "packing", "shipped", "delivered"];
  const nextStatus = flow[flow.indexOf(order.status) + 1];
  const paymentLabel: Record<string, string> = { unpaid: "Unpaid", authorised: "Claimed", paid: "Paid", failed: "Failed", refunded: "Refunded", cod_due: "COD due" };

  return (
    <Drawer
      open
      wide
      onClose={onClose}
      title={order.orderNumber}
      subtitle={`${order.customerName} · ${formatDate(order.createdAt)} · ${order.district}`}
      footer={
        <>
          {nextStatus && (
            <Button variant="primary" disabled={busy} onClick={() => void act({ status: nextStatus }, `Moved to ${STATUS_LABEL[nextStatus].toLowerCase()}`)}>
              <Check size={14} /> Mark {STATUS_LABEL[nextStatus].toLowerCase()}
            </Button>
          )}
          <Button disabled={busy} onClick={() => void act({ bookCourier: true }, "Courier booked")}>
            <Truck size={14} /> {order.courierConsignment ? "Re-book courier" : "Book courier"}
          </Button>
          {order.status !== "cancelled" && (
            <Button variant="danger" disabled={busy} onClick={() => setConfirmCancel((value) => !value)}>
              <X size={14} /> Cancel order
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        <Badge tone={toneFor(order.status)}>{STATUS_LABEL[order.status] ?? order.status}</Badge>
        <Badge tone={order.paymentStatus === "paid" ? "emerald" : order.paymentStatus === "cod_due" ? "sky" : "amber"}>{paymentLabel[order.paymentStatus] ?? order.paymentStatus}</Badge>
        <Badge>{order.deliveryMethod === "express" ? "Express same-day" : "Standard courier"}</Badge>
        {order.attribution?.campaign && order.attribution.campaign !== "(not set)" && <Badge tone="violet">{order.attribution.campaign}</Badge>}
      </div>

      {confirmCancel && (
        <div className="rounded-xl border border-[#fecdd3] bg-[#fef2f2] p-3">
          <p className="text-[0.8rem] font-semibold text-[#b42318]">Cancel {order.orderNumber}?</p>
          <p className="mt-1 text-[0.72rem] text-[#b42318]">Stock is returned to the catalogue and the customer is messaged automatically.</p>
          <input className="adm-input mt-2" placeholder="Reason (shared with the customer)" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} />
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="danger" disabled={busy} onClick={() => { setConfirmCancel(false); void act({ status: "cancelled", note: cancelReason || "Cancelled by the shop" }, "Order cancelled and stock returned"); }}>Confirm cancellation</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmCancel(false)}>Keep order</Button>
          </div>
        </div>
      )}

      {order.riskFlags.length > 0 && (
        <div className="rounded-xl border border-[#f3d38a] bg-[#fffbeb] p-3">
          <p className="flex items-center gap-2 text-[0.8rem] font-semibold text-[#92400e]"><AlertTriangle size={14} /> Fraud screening</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {order.riskFlags.map((flag) => <li key={flag} className="text-[0.73rem] text-[#92400e]">• {flag}</li>)}
          </ul>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[#e3e3e8] bg-[#f5f5f7] p-3">
          <p className="flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#6e6e73]"><MapPin size={12} /> Deliver to</p>
          <p className="mt-1.5 text-[0.8rem] font-medium">{order.customerName}</p>
          <p className="mt-0.5 text-[0.75rem] leading-relaxed text-[#3a3a3c]">{order.address}<br />{order.district}</p>
          <a href={`tel:${order.phone}`} className="adm-num mt-2 inline-flex items-center gap-1.5 text-[0.76rem] text-[#4d7c0f] hover:underline"><Phone size={12} /> {order.phone}</a>
          {order.customerNote && <p className="mt-2 rounded-lg bg-[#ffffff] px-2 py-1.5 text-[0.72rem] text-[#6e6e73]">Note: {order.customerNote}</p>}
        </div>

        <div className="rounded-xl border border-[#e3e3e8] bg-[#f5f5f7] p-3">
          <p className="flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#6e6e73]"><CreditCard size={12} /> Payment</p>
          <p className="mt-1.5 text-[0.8rem] font-medium capitalize">{order.paymentMethod} · {paymentLabel[order.paymentStatus] ?? order.paymentStatus}</p>
          {order.trxId && (
            <p className="adm-num mt-1 flex items-center gap-1.5 text-[0.74rem] text-[#3a3a3c]">
              {order.trxId}
              <button type="button" className="text-[#6e6e73] hover:text-[#4d7c0f]" aria-label="Copy transaction ID" onClick={() => { void navigator.clipboard?.writeText(order.trxId ?? ""); toast("Transaction ID copied"); }}><Copy size={11} /></button>
            </p>
          )}
          {order.paymentStatus !== "paid" && order.paymentStatus !== "refunded" && (
            <div className="mt-2 flex gap-1.5">
              <input className="adm-input" data-size="sm" placeholder="Verified TrxID" value={trx} onChange={(event) => setTrx(event.target.value)} aria-label="Verified transaction ID" />
              <Button size="sm" variant="primary" disabled={busy} onClick={() => { const value = trx; setTrx(""); void act({ paymentStatus: "paid", trxId: value || undefined }, "Payment marked as received"); }}>
                <BadgeCheck size={12} /> Confirm
              </Button>
            </div>
          )}
          {order.paymentStatus === "paid" && order.paymentMethod !== "cod" && !confirmRefund && (
            <Button size="sm" variant="ghost" className="mt-2" disabled={busy} onClick={() => setConfirmRefund(true)}>
              <RotateCcw size={12} /> Refund {formatBDT(order.total)}
            </Button>
          )}
          {confirmRefund && (
            <div className="mt-2 flex gap-1.5">
              <Button size="sm" variant="danger" disabled={busy} onClick={() => void refund()}>Confirm refund</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmRefund(false)}>Keep</Button>
            </div>
          )}
          {order.courierConsignment && (
            <p className="mt-2 rounded-lg bg-[#ffffff] px-2 py-1.5 text-[0.72rem] text-[#3a3a3c]">
              {order.courierProvider} · <span className="adm-num">{order.courierConsignment}</span>
            </p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-[#e3e3e8] bg-[#f5f5f7] p-3">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#6e6e73]">Items</p>
        <ul className="mt-2 flex flex-col divide-y divide-[#efeff3]">
          {order.items.map((item) => (
            <li key={item.id} className="py-2">
              <div className="flex items-center gap-3">
                <span className="adm-num grid size-7 shrink-0 place-items-center rounded-lg bg-[#f2f2f7] text-[0.7rem]">{item.qty}×</span>
                <span className="min-w-0 flex-1 text-[0.79rem]">{item.name}</span>
                <span className="adm-num text-[0.79rem]">{formatBDT(item.qty * item.unitPrice)}</span>
              </div>
              {item.packSpec?.components && <div className="mt-2 rounded-lg bg-[#ffffff] p-2.5">
                <p className="text-[0.67rem] font-semibold text-[#3a3a3c]">Build components · {item.packSpec.series}S{item.packSpec.parallel}P · {item.packSpec.loadCurrentA ?? 10}A expected load</p>
                <ul className="mt-1.5 space-y-1">{item.packSpec.components.map((component) => <li key={component.key} className="flex justify-between gap-2 text-[0.7rem] text-[#6e6e73]"><span>{component.qty} × {component.name}</span><span className="adm-num shrink-0">{formatBDT(component.total)}</span></li>)}</ul>
              </div>}
            </li>
          ))}
        </ul>
        <dl className="adm-kv mt-2 border-t border-[#efeff3] pt-2">
          <dt>Subtotal</dt><dd className="adm-num">{formatBDT(order.subtotal)}</dd>
          <dt>Delivery</dt><dd className="adm-num">{order.shipping === 0 ? "Free" : formatBDT(order.shipping)}</dd>
          {order.discount > 0 && (<><dt className="text-[#15803d]">Discount {order.promoCode}</dt><dd className="adm-num text-[#15803d]">−{formatBDT(order.discount)}</dd></>)}
          <dt className="font-semibold text-[#1d1d1f]">Total</dt><dd className="adm-num text-[0.95rem] font-bold">{formatBDT(order.total)}</dd>
        </dl>
      </div>

      <div className="rounded-xl border border-[#e3e3e8] bg-[#f5f5f7] p-3">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#6e6e73]">Fulfilment timeline</p>
        <ul className="adm-timeline mt-2.5">
          {order.events.map((event) => (
            <li key={event.id}>
              <i style={{ background: "#84cc16" }} />
              <div className="min-w-0">
                <p className="text-[0.79rem] font-medium">{event.label}</p>
                <p className="text-[0.68rem] text-[#6e6e73]">{new Date(event.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {event.actor}</p>
                {event.note && <p className="mt-0.5 text-[0.72rem] text-[#3a3a3c]">{event.note}</p>}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-[#efeff3] pt-2.5">
          <span className="text-[0.7rem] text-[#6e6e73]">Jump to:</span>
          {["confirmed", "packing", "shipped", "delivered", "returned"].filter((entry) => entry !== order.status).map((entry) => (
            <button key={entry} type="button" className="adm-chip" onClick={() => void act({ status: entry }, `Moved to ${STATUS_LABEL[entry].toLowerCase()}`)}>
              {STATUS_LABEL[entry]}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[#e3e3e8] bg-[#f5f5f7] p-3">
        <p className="flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#6e6e73]"><MessageSquarePlus size={12} /> Internal notes</p>
        {order.notes.length > 0 && (
          <ul className="mt-2 flex flex-col gap-2">
            {order.notes.map((entry) => (
              <li key={entry.id} className="rounded-lg bg-[#ffffff] px-2.5 py-2">
                <p className="text-[0.76rem]">{entry.body}</p>
                <p className="mt-0.5 text-[0.66rem] text-[#6e6e73]">{new Date(entry.createdAt).toLocaleString("en-GB")} · {entry.actor}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex gap-1.5">
          <input className="adm-input" placeholder="Called customer, confirmed address…" value={note} onChange={(event) => setNote(event.target.value)} aria-label="Add internal note" />
          <Button size="sm" disabled={busy || !note.trim()} onClick={() => { const value = note; setNote(""); void act({ internalNote: value }, "Note saved"); }}>Add</Button>
        </div>
      </div>

      {order.attribution && (
        <details className="rounded-xl border border-[#e3e3e8] bg-[#f5f5f7] p-3">
          <summary className="flex cursor-pointer items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#6e6e73]">
            <ChevronDown size={12} /> Ad attribution
          </summary>
          <dl className="adm-kv mt-2">
            <dt>Source / medium</dt><dd>{order.attribution.source} / {order.attribution.medium}</dd>
            <dt>Campaign</dt><dd className="truncate">{order.attribution.campaign ?? "—"}</dd>
            <dt>Ad content</dt><dd className="truncate">{order.attribution.content ?? "—"}</dd>
            <dt>Landing page</dt><dd className="truncate">{order.attribution.landingPage ?? "—"}</dd>
            <dt>Session</dt><dd className="adm-num text-[0.7rem]">{order.attribution.sessionId ?? "—"}</dd>
          </dl>
        </details>
      )}

      <Button variant="ghost" size="sm" disabled={busy} onClick={() => void act({ resend: true }, "Status message re-queued")}>
        <Send size={12} /> Resend customer update
      </Button>
    </Drawer>
  );
}
