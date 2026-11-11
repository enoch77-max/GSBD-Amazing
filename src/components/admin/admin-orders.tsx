"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle, BadgeCheck, Check, ChevronDown, Copy, CreditCard, Download, Filter,
  MapPin, MessageSquarePlus, Package, Phone, RotateCcw, Search, Send, Truck, X,
} from "lucide-react";
import { formatBDT, formatDate } from "@/lib/format";
import {
  addOrderNote, advanceStatus, bookCourier, bulkStatus, exportCourierManifest, exportOrders,
  findOrder, listOrders, markRefunded, queueStatusMessage, setPaymentStatus,
  PAYMENT_META, STATUS_FLOW, STATUS_META, type MerchantOrder,
} from "@/lib/ops";
import type { OrderStatus } from "@/db/ops-store";
import { isSampleOrder } from "@/db/sample-trading";
import { can } from "@/lib/ops";
import { Badge, Button, Drawer, Empty, Panel } from "./admin-ui";

type SortKey = "recent" | "value" | "oldest";

const STATUS_FILTERS: Array<{ id: OrderStatus | "all" | "open"; label: string }> = [
  { id: "open", label: "Open" },
  { id: "all", label: "All" },
  { id: "pending", label: "Awaiting payment" },
  { id: "confirmed", label: "Confirmed" },
  { id: "packing", label: "Packing" },
  { id: "shipped", label: "Shipped" },
  { id: "delivered", label: "Delivered" },
  { id: "cancelled", label: "Cancelled" },
  { id: "returned", label: "Returned" },
];

const toneFor = (status: OrderStatus) =>
  status === "delivered" ? "emerald" : status === "cancelled" || status === "returned" ? "rose" : status === "pending" ? "amber" : status === "shipped" ? "violet" : "volt";

export function AdminOrders({
  selected, onSelect, toast,
}: {
  selected: string | null;
  onSelect: (orderNumber: string | null) => void;
  toast: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<OrderStatus | "all" | "open">("open");
  const [payment, setPayment] = useState<"all" | "cod" | "prepaid" | "unpaid">("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [checked, setChecked] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [revision, setRevision] = useState(0);

  const refresh = () => setRevision((value) => value + 1);

  const orders = useMemo(() => listOrders(), [revision]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    let rows = orders.filter((order) => {
      if (status === "open" && ["delivered", "cancelled", "returned"].includes(order.status)) return false;
      if (status !== "all" && status !== "open" && order.status !== status) return false;
      if (payment === "cod" && order.paymentMethod !== "cod") return false;
      if (payment === "prepaid" && order.paymentMethod === "cod") return false;
      if (payment === "unpaid" && order.paymentStatus === "paid") return false;
      if (!term) return true;
      return [order.orderNumber, order.customerName, order.phone, order.district, order.address, order.trxId ?? "", order.courier?.consignmentId ?? ""]
        .join(" ").toLowerCase().includes(term);
    });
    if (sort === "value") rows = [...rows].sort((a, b) => b.total - a.total);
    if (sort === "oldest") rows = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return rows;
  }, [orders, query, status, payment, sort]);

  const openOrder = selected ? findOrder(selected) : null;
  const allChecked = filtered.length > 0 && filtered.every((order) => checked.includes(order.orderNumber));
  const selectedValue = filtered.filter((order) => checked.includes(order.orderNumber)).reduce((sum, order) => sum + order.total, 0);

  const toggleAll = () => setChecked(allChecked ? [] : filtered.map((order) => order.orderNumber));
  const toggleOne = (orderNumber: string) =>
    setChecked((current) => (current.includes(orderNumber) ? current.filter((entry) => entry !== orderNumber) : [...current, orderNumber]));

  const runBulk = (next: OrderStatus) => {
    const count = bulkStatus(checked, next);
    toast(`${count} order${count === 1 ? "" : "s"} moved to ${STATUS_META[next].label.toLowerCase()}`);
    setChecked([]);
    refresh();
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="adm-page-title">Orders</h1>
          <p className="text-[0.78rem] text-[#6e6e73]">{filtered.length} shown · {orders.length} total · fulfil, message and export from here.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={!can("orders.export")} onClick={() => { exportOrders(filtered); toast(`Exported ${filtered.length} orders to CSV`); }}><Download size={13} /> Orders CSV</Button>
          <Button size="sm" disabled={!can("orders.export")} onClick={() => { exportCourierManifest(filtered.filter((order) => order.status !== "cancelled")); toast("Courier manifest downloaded"); }}><Truck size={13} /> Courier manifest</Button>
        </div>
      </div>

      <Panel>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8e8e93]" />
              <input
                className="adm-input pl-8"
                placeholder="Search order, name, phone, district, TrxID…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search orders"
              />
            </div>
            <select className="adm-select w-auto" value={sort} onChange={(event) => setSort(event.target.value as SortKey)} aria-label="Sort orders">
              <option value="recent">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="value">Highest value</option>
            </select>
            <Button size="sm" variant={showFilters ? "primary" : "default"} onClick={() => setShowFilters((value) => !value)}>
              <Filter size={13} /> Filters
            </Button>
          </div>

          <div className="adm-scroll flex gap-1.5 overflow-x-auto pb-1">
            {STATUS_FILTERS.map((filter) => {
              const count = filter.id === "all" ? orders.length
                : filter.id === "open" ? orders.filter((order) => !["delivered", "cancelled", "returned"].includes(order.status)).length
                : orders.filter((order) => order.status === filter.id).length;
              return (
                <button key={filter.id} type="button" className="adm-chip" data-active={status === filter.id} onClick={() => setStatus(filter.id)}>
                  {filter.label} <span className="adm-mono opacity-60">{count}</span>
                </button>
              );
            })}
          </div>

          {showFilters && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e3e3e8] bg-[#f5f5f7] p-3">
              <span className="text-[0.7rem] uppercase tracking-[0.1em] text-[#6e6e73]">Payment</span>
              {(["all", "cod", "prepaid", "unpaid"] as const).map((option) => (
                <button key={option} type="button" className="adm-chip" data-active={payment === option} onClick={() => setPayment(option)}>
                  {option === "all" ? "Any" : option === "cod" ? "Cash on delivery" : option === "prepaid" ? "Prepaid" : "Not yet paid"}
                </button>
              ))}
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { setPayment("all"); setStatus("open"); setQuery(""); setSort("recent"); }}>
                <RotateCcw size={12} /> Reset
              </Button>
            </div>
          )}
        </div>
      </Panel>

      {checked.length > 0 && can("orders.manage") && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#b8de6f] bg-[#f1f9e0] px-3 py-2.5">
          <span className="text-[0.8rem] font-semibold text-[#1d1d1f]">{checked.length} selected · {formatBDT(selectedValue)}</span>
          <div className="ml-auto flex flex-wrap gap-1.5">
            <Button size="sm" onClick={() => runBulk("packing")}><Package size={12} /> Mark packing</Button>
            <Button size="sm" onClick={() => runBulk("shipped")}><Truck size={12} /> Mark shipped</Button>
            <Button size="sm" variant="primary" onClick={() => runBulk("delivered")}><Check size={12} /> Mark delivered</Button>
            <Button size="sm" variant="danger" onClick={() => runBulk("cancelled")}><X size={12} /> Cancel</Button>
            <Button size="sm" variant="ghost" onClick={() => setChecked([])}>Clear</Button>
          </div>
        </div>
      )}

      <Panel>
        {filtered.length === 0 ? (
          <Empty icon={<Search size={22} />} title="No orders match" body="Try a different status, clear the search, or widen the payment filter." />
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th className="w-9"><input type="checkbox" className="adm-checkbox" checked={allChecked} onChange={toggleAll} aria-label="Select all orders" /></th>
                  <th>Order</th><th>Customer</th><th>Status</th><th>Payment</th><th>Source</th>
                  <th className="text-right">Total</th><th className="text-right">Placed</th><th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => (
                  <tr key={order.orderNumber} data-selected={checked.includes(order.orderNumber)}>
                    <td><input type="checkbox" className="adm-checkbox" checked={checked.includes(order.orderNumber)} onChange={() => toggleOne(order.orderNumber)} aria-label={`Select ${order.orderNumber}`} /></td>
                    <td>
                      <button type="button" className="adm-num text-[#4d7c0f] hover:underline" onClick={() => onSelect(order.orderNumber)}>{order.orderNumber}</button>
                      {isSampleOrder(order.orderNumber) && <span className="ml-1.5 align-middle text-[0.6rem] uppercase tracking-[0.08em] text-[#8e8e93]">sample</span>}
                      {order.riskFlags.length > 0 && (
                        <span className="ml-1.5 inline-flex align-middle text-[#f59e0b]" title={order.riskFlags.join(" · ")}><AlertTriangle size={12} /></span>
                      )}
                    </td>
                    <td>
                      <p className="font-medium">{order.customerName}</p>
                      <p className="adm-num text-[0.68rem] text-[#6e6e73]">{order.phone} · {order.district}</p>
                    </td>
                    <td><Badge tone={toneFor(order.status)}>{STATUS_META[order.status].label}</Badge></td>
                    <td>
                      <span className={`text-[0.74rem] font-medium ${order.paymentStatus === "paid" ? "text-[#15803d]" : order.paymentStatus === "cod_due" ? "text-[#0369a1]" : "text-[#92400e]"}`}>
                        {PAYMENT_META[order.paymentStatus].label}
                      </span>
                      <p className="text-[0.66rem] uppercase text-[#6e6e73]">{order.paymentMethod}</p>
                    </td>
                    <td className="text-[0.72rem] capitalize text-[#6e6e73]">{order.attribution?.source ?? "direct"}</td>
                    <td className="adm-num text-right font-semibold">{formatBDT(order.total)}</td>
                    <td className="text-right text-[0.7rem] text-[#6e6e73]">{formatDate(order.createdAt)}</td>
                    <td className="text-right"><Button size="sm" variant="ghost" onClick={() => onSelect(order.orderNumber)}>Open</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <OrderDrawer
        order={openOrder}
        onClose={() => onSelect(null)}
        onChange={refresh}
        toast={toast}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */

function OrderDrawer({ order, onClose, onChange, toast }: {
  order: MerchantOrder | null;
  onClose: () => void;
  onChange: () => void;
  toast: (message: string) => void;
}) {
  const [note, setNote] = useState("");
  const [trx, setTrx] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!order) return null;
  const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(order.status) + 1];
  const itemsTotal = order.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);

  const act = (fn: () => void, message: string) => { fn(); onChange(); toast(message); };

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
            <Button variant="primary" disabled={!can("orders.manage")} onClick={() => act(() => advanceStatus(order.orderNumber, nextStatus), `Moved to ${STATUS_META[nextStatus].label.toLowerCase()}`)}>
              <Check size={14} /> Mark {STATUS_META[nextStatus].label.toLowerCase()}
            </Button>
          )}
          <Button onClick={async () => { setBusy(true); const result = await bookCourier(order.orderNumber); setBusy(false); onChange(); toast(result.message); }} disabled={busy || !can("orders.manage")}>
            <Truck size={14} /> {order.courier ? "Re-book courier" : "Book courier"}
          </Button>
          <Button disabled={!can("orders.manage")} onClick={() => act(() => queueStatusMessage(order.orderNumber, order.status), "Status message queued to the customer")}>
            <Send size={14} /> Resend update
          </Button>
          {order.status !== "cancelled" && (
            <Button variant="danger" disabled={!can("orders.manage")} onClick={() => setConfirmCancel((value) => !value)}>
              <X size={14} /> Cancel order
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        <Badge tone={toneFor(order.status)}>{STATUS_META[order.status].label}</Badge>
        <Badge tone={order.paymentStatus === "paid" ? "emerald" : order.paymentStatus === "cod_due" ? "sky" : "amber"}>{PAYMENT_META[order.paymentStatus].label}</Badge>
        <Badge>{order.deliveryMethod === "express" ? "Express same-day" : "Standard courier"}</Badge>
        {order.attribution?.campaign && order.attribution.campaign !== "(not set)" && <Badge tone="violet">{order.attribution.campaign}</Badge>}
      </div>

      {confirmCancel && (
        <div className="rounded-xl border border-[#fecdd3] bg-[#fef2f2] p-3">
          <p className="text-[0.8rem] font-semibold text-[#b42318]">Cancel {order.orderNumber}?</p>
          <p className="mt-1 text-[0.72rem] text-[#b42318]">Stock is returned to the catalogue and the customer is messaged automatically.</p>
          <input className="adm-input mt-2" placeholder="Reason (shared with the customer)" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} />
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="danger" onClick={() => { act(() => advanceStatus(order.orderNumber, "cancelled", cancelReason || "Cancelled by the shop"), "Order cancelled and stock returned"); setConfirmCancel(false); setCancelReason(""); }}>Confirm cancellation</Button>
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
          <p className="mt-2 text-[0.7rem] text-[#92400e]">Call the customer before dispatching. Take an advance for repeat refusals.</p>
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
          <p className="mt-1.5 text-[0.8rem] font-medium capitalize">{order.paymentMethod} · {PAYMENT_META[order.paymentStatus].label}</p>
          {order.trxId && (
            <p className="adm-num mt-1 flex items-center gap-1.5 text-[0.74rem] text-[#3a3a3c]">
              {order.trxId}
              <button type="button" className="text-[#6e6e73] hover:text-[#4d7c0f]" aria-label="Copy transaction ID" onClick={() => { void navigator.clipboard?.writeText(order.trxId ?? ""); toast("Transaction ID copied"); }}><Copy size={11} /></button>
            </p>
          )}
          {order.paymentStatus !== "paid" && (
            <div className="mt-2 flex gap-1.5">
              <input className="adm-input" data-size="sm" placeholder="Verified TrxID" value={trx} onChange={(event) => setTrx(event.target.value)} aria-label="Verified transaction ID" />
              <Button size="sm" variant="primary" disabled={!can("orders.payments")} onClick={() => { act(() => setPaymentStatus(order.orderNumber, "paid", trx || undefined), "Payment marked as received"); setTrx(""); }}>
                <BadgeCheck size={12} /> Confirm
              </Button>
            </div>
          )}
          {order.paymentStatus === "paid" && order.paymentMethod !== "cod" && (
            <Button size="sm" variant="ghost" className="mt-2" disabled={!can("orders.payments")} onClick={() => act(() => markRefunded(order.orderNumber, order.total), `Refund of ${formatBDT(order.total)} queued`)}>
              <RotateCcw size={12} /> Refund {formatBDT(order.total)}
            </Button>
          )}
          {order.courier && (
            <p className="mt-2 rounded-lg bg-[#ffffff] px-2 py-1.5 text-[0.72rem] text-[#3a3a3c]">
              {order.courier.provider} · <span className="adm-num">{order.courier.consignmentId}</span>
            </p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-[#e3e3e8] bg-[#f5f5f7] p-3">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#6e6e73]">Items</p>
        <ul className="mt-2 flex flex-col divide-y divide-[#efeff3]">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-2">
              <span className="adm-num grid size-7 shrink-0 place-items-center rounded-lg bg-[#f2f2f7] text-[0.7rem]">{item.qty}×</span>
              <span className="min-w-0 flex-1 truncate text-[0.79rem]">{item.name}</span>
              <span className="adm-num text-[0.79rem]">{formatBDT(item.qty * item.unitPrice)}</span>
            </li>
          ))}
        </ul>
        <dl className="adm-kv mt-2 border-t border-[#efeff3] pt-2">
          <dt>Subtotal</dt><dd className="adm-num">{formatBDT(itemsTotal)}</dd>
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
              <i style={{ background: STATUS_META[event.status].dot }} />
              <div className="min-w-0">
                <p className="text-[0.79rem] font-medium">{event.label}</p>
                <p className="text-[0.68rem] text-[#6e6e73]">{new Date(event.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {event.actor}</p>
                {event.note && <p className="mt-0.5 text-[0.72rem] text-[#3a3a3c]">{event.note}</p>}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-[#efeff3] pt-2.5">
          <span className="text-[0.7rem] text-[#6e6e73]">Jump to:</span>
          {(["confirmed", "packing", "shipped", "delivered", "returned"] as OrderStatus[]).filter((status) => status !== order.status).map((status) => (
            <button key={status} type="button" className="adm-chip" disabled={!can("orders.manage")} onClick={() => act(() => advanceStatus(order.orderNumber, status), `Moved to ${STATUS_META[status].label.toLowerCase()}`)}>
              {STATUS_META[status].label}
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
                <p className="mt-0.5 text-[0.66rem] text-[#6e6e73]">{new Date(entry.at).toLocaleString("en-GB")} · {entry.actor}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex gap-1.5">
          <input
            className="adm-input" placeholder="Called customer, confirmed address…" value={note}
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && note.trim()) { act(() => addOrderNote(order.orderNumber, note), "Note saved"); setNote(""); } }}
            aria-label="Add internal note"
          />
          <Button size="sm" disabled={!note.trim() || !can("orders.manage")} onClick={() => { act(() => addOrderNote(order.orderNumber, note), "Note saved"); setNote(""); }}>Add</Button>
        </div>
      </div>

      {order.attribution && (
        <details className="rounded-xl border border-[#e3e3e8] bg-[#f5f5f7] p-3">
          <summary className="flex cursor-pointer items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#6e6e73]">
            <ChevronDown size={12} /> Ad attribution
          </summary>
          <dl className="adm-kv mt-2">
            <dt>Source / medium</dt><dd>{order.attribution.source} / {order.attribution.medium}</dd>
            <dt>Campaign</dt><dd className="truncate">{order.attribution.campaign}</dd>
            <dt>Ad content</dt><dd className="truncate">{order.attribution.content}</dd>
            <dt>Landing page</dt><dd className="truncate">{order.attribution.landingPage}</dd>
            <dt>Session</dt><dd className="adm-num text-[0.7rem]">{order.attribution.sessionId}</dd>
          </dl>
        </details>
      )}
    </Drawer>
  );
}
