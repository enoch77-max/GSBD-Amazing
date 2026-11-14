"use client";

/**
 * Orders — fast fulfilment at scale.
 *
 * Queue pills (All / To Ship / Hold & Issue / Warranty & RMA) slice the book by
 * the job to be done, not by raw status. Rows show only what a packer needs:
 * order number, customer, units + thumbnail, total, payment dot, fulfilment
 * badge. Everything else lives in the drawer.
 */
import { useMemo, useState } from "react";
import {
  AlertTriangle, BadgeCheck, Check, Copy, Hash, MapPin, Package, PackageCheck, Phone, Printer,
  RotateCcw, Search, ShieldCheck, Truck, Wrench, X,
} from "lucide-react";
import { formatBDT, formatDate, timeAgo } from "@/lib/format";
import {
  advanceStatus, bookCourier, can, findOrder, listOrders, PAYMENT_META, queueStatusMessage,
  setOrderHold, setOrderSerials, setOrderTracking, setOrderWarranty, STATUS_FLOW, STATUS_META,
  printOrderLabel, type MerchantOrder,
} from "@/lib/ops";
import type { OrderStatus } from "@/db/ops-store";
import { isSampleOrder } from "@/db/sample-trading";
import { ActionMenu } from "./action-menu";
import { ProductThumb } from "./product-thumb";
import { Badge, Button, Drawer, Empty, PageHead, Panel } from "./admin-ui";

type Queue = "all" | "ship" | "issue" | "rma";

const isOpen = (order: MerchantOrder) => order.status === "pending" || order.status === "confirmed" || order.status === "packing";
const isRma = (order: MerchantOrder) => order.warranty?.status === "open" || order.status === "returned";
const isIssue = (order: MerchantOrder) =>
  !isRma(order) &&
  (order.riskFlags.length > 0 ||
    Boolean(order.hold?.on) ||
    order.paymentStatus === "failed" ||
    (order.status === "pending" && Date.now() - order.createdAt.getTime() > 12 * 3600000));

const PAYMENT_DOT: Record<string, string> = {
  paid: "#16a34a", authorised: "#0a84ff", cod_due: "#f59e0b", unpaid: "#8e8e93", failed: "#e11d48", refunded: "#7c3aed",
};

const statusTone = (status: OrderStatus) =>
  status === "delivered" ? "emerald" : status === "cancelled" || status === "returned" ? "rose" : status === "pending" ? "amber" : status === "shipped" ? "violet" : "volt";

export function AdminOrders({ selected, onSelect, toast }: {
  selected: string | null;
  onSelect: (orderNumber: string | null) => void;
  toast: (message: string) => void;
}) {
  const [version, setVersion] = useState(0);
  const [queue, setQueue] = useState<Queue>("ship");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "oldest" | "value">("recent");
  const [checked, setChecked] = useState<string[]>([]);

  const orders = useMemo(() => { void version; return listOrders(); }, [version]);
  const refresh = () => setVersion((value) => value + 1);

  const queues = useMemo(() => ({
    all: orders.length,
    ship: orders.filter(isOpen).length,
    issue: orders.filter(isIssue).length,
    rma: orders.filter(isRma).length,
  }), [orders]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const scoped = orders.filter((order) =>
      (queue === "all" || (queue === "ship" && isOpen(order)) || (queue === "issue" && isIssue(order)) || (queue === "rma" && isRma(order))) &&
      (!term || `${order.orderNumber} ${order.customerName} ${order.phone} ${order.district}`.toLowerCase().includes(term)),
    );
    return [...scoped].sort((a, b) =>
      sort === "value" ? b.total - a.total : sort === "oldest" ? a.createdAt.getTime() - b.createdAt.getTime() : b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }, [orders, queue, query, sort]);

  const openOrder = selected ? findOrder(selected) : null;
  const togglePick = (orderNumber: string) =>
    setChecked((current) => (current.includes(orderNumber) ? current.filter((n) => n !== orderNumber) : [...current, orderNumber]));
  const allPicked = filtered.length > 0 && filtered.every((order) => checked.includes(order.orderNumber));

  const runBulk = (status: OrderStatus) => {
    checked.forEach((orderNumber) => advanceStatus(orderNumber, status, "Bulk update"));
    setChecked([]);
    refresh();
    toast(`${checked.length} order${checked.length === 1 ? "" : "s"} marked ${STATUS_META[status].label.toLowerCase()}`);
  };

  const QUEUES: Array<{ id: Queue; label: string; count: number }> = [
    { id: "ship", label: "To ship", count: queues.ship },
    { id: "issue", label: "Hold / issue", count: queues.issue },
    { id: "rma", label: "Warranty / RMA", count: queues.rma },
    { id: "all", label: "All", count: queues.all },
  ];

  const primaryThumb = (order: MerchantOrder) => order.items[0]?.image ?? null;
  const itemCount = (order: MerchantOrder) => order.items.reduce((sum, item) => sum + item.qty, 0);

  const rowMenu = (order: MerchantOrder) => (
    <ActionMenu
      label={`Actions for ${order.orderNumber}`}
      items={[
        { label: "Open order", icon: <Package size={15} />, onClick: () => onSelect(order.orderNumber) },
        { label: "Print label", icon: <Printer size={15} />, onClick: () => { if (printOrderLabel(order)) toast(`Label sent to printer`); else toast("Allow pop-ups to print the label"); } },
        { label: "Copy order number", icon: <Copy size={15} />, onClick: () => { void navigator.clipboard?.writeText(order.orderNumber); toast("Order number copied"); } },
        {
          label: order.hold?.on ? "Release hold" : "Put on hold",
          icon: order.hold?.on ? <RotateCcw size={15} /> : <ShieldCheck size={15} />,
          onClick: () => { setOrderHold(order.orderNumber, !order.hold?.on); refresh(); toast(order.hold?.on ? "Hold released" : "Order put on hold"); },
          disabled: !can("orders.manage"),
        },
        {
          label: order.warranty?.status === "open" ? "Resolve warranty claim" : "Open warranty claim",
          icon: <Wrench size={15} />,
          onClick: () => { setOrderWarranty(order.orderNumber, order.warranty?.status === "open" ? "resolve" : "open"); refresh(); toast(order.warranty?.status === "open" ? "Warranty claim resolved" : "Warranty claim opened"); },
          disabled: !can("orders.manage"),
        },
      ]}
    />
  );

  return (
    <>
      <PageHead
        title="Orders"
        subtitle={`${queues.ship} to ship · ${queues.issue} need a look · ${queues.rma} warranty claim${queues.rma === 1 ? "" : "s"}`}
      />

      <Panel>
        <div className="flex flex-col gap-3">
          <div className="ax-seg wrap" role="tablist" aria-label="Order queue">
            {QUEUES.map((entry) => (
              <button key={entry.id} type="button" role="tab" aria-selected={queue === entry.id} data-active={queue === entry.id} onClick={() => setQueue(entry.id)}>
                {entry.label}
                <span className="ax-seg-count" data-tone={entry.id === "issue" ? "alert" : entry.id === "rma" ? "violet" : entry.id === "ship" ? "live" : "neutral"}>{entry.count}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--adm-faint)]" />
              <input className="adm-input pl-9" placeholder="Order #, name, phone or district…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search orders" />
            </div>
            <select className="adm-select sm:w-48" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Sort orders">
              <option value="recent">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="value">Highest value</option>
            </select>
          </div>
        </div>
      </Panel>

      {checked.length > 0 && can("orders.manage") && (
        <div className="ax-bulkbar" role="region" aria-label="Bulk order actions">
          <span className="ax-body font-semibold">{checked.length} selected</span>
          <div className="ml-auto flex flex-wrap gap-1.5">
            <Button size="sm" onClick={() => runBulk("packing")}>Mark packing</Button>
            <Button size="sm" onClick={() => runBulk("shipped")}>Mark shipped</Button>
            <Button size="sm" variant="primary" onClick={() => runBulk("delivered")}>Delivered</Button>
            <Button size="sm" variant="ghost" onClick={() => setChecked([])}>Clear</Button>
          </div>
        </div>
      )}

      <Panel>
        {filtered.length === 0 ? (
          <Empty icon={<InboxIcon />} title="Nothing in this queue" body={queue === "ship" ? "Every order is packed and on its way." : "No orders match this queue or search."} />
        ) : (
          <>
            {/* Desktop table — only the fields a packer needs */}
            <div className="hidden md:block adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th className="w-9"><input type="checkbox" className="adm-checkbox" aria-label="Select all orders in view" checked={allPicked} onChange={() => setChecked(allPicked ? [] : filtered.map((order) => order.orderNumber))} /></th>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Items</th>
                    <th className="text-right">Total</th>
                    <th className="text-center">Payment</th>
                    <th>Fulfilment</th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((order) => (
                    <tr key={order.orderNumber} data-selected={checked.includes(order.orderNumber)}>
                      <td><input type="checkbox" className="adm-checkbox" aria-label={`Select ${order.orderNumber}`} checked={checked.includes(order.orderNumber)} onChange={() => togglePick(order.orderNumber)} /></td>
                      <td>
                        <button type="button" className="ax-order-id" onClick={() => onSelect(order.orderNumber)}>{order.orderNumber}</button>
                        <p className="ax-caption">{formatDate(order.createdAt)}</p>
                      </td>
                      <td>
                        <p className="ax-body font-medium">{order.customerName}</p>
                        <p className="ax-caption">{order.district}</p>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <ProductThumb src={primaryThumb(order)} />
                          <span className="ax-caption whitespace-nowrap">{itemCount(order)} unit{itemCount(order) === 1 ? "" : "s"}<br />{order.items.length} line{order.items.length === 1 ? "" : "s"}</span>
                        </div>
                      </td>
                      <td className="adm-num text-right font-semibold">{formatBDT(order.total)}</td>
                      <td className="text-center">
                        <span className="ax-paydot" title={PAYMENT_META[order.paymentStatus].label} aria-label={PAYMENT_META[order.paymentStatus].label}>
                          <i style={{ background: PAYMENT_DOT[order.paymentStatus] ?? "#8e8e93" }} />
                          {PAYMENT_META[order.paymentStatus].label}
                        </span>
                      </td>
                      <td>
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge tone={statusTone(order.status)}>{STATUS_META[order.status].label}</Badge>
                          {order.hold?.on && <Badge tone="amber">Hold</Badge>}
                          {order.warranty?.status === "open" && <Badge tone="violet">RMA</Badge>}
                          {order.riskFlags.length > 0 && <Badge tone="rose">Risk</Badge>}
                        </div>
                      </td>
                      <td className="text-right">{rowMenu(order)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards — same six facts, stacked */}
            <ul className="flex flex-col gap-2.5 md:hidden">
              {filtered.map((order) => (
                <li key={order.orderNumber}>
                  <div className="ax-order-card" data-selected={checked.includes(order.orderNumber) || undefined}>
                    <div className="ax-order-card-top">
                      <label className="ax-check-hit">
                        <input type="checkbox" className="adm-checkbox" aria-label={`Select ${order.orderNumber}`} checked={checked.includes(order.orderNumber)} onChange={() => togglePick(order.orderNumber)} />
                      </label>
                      <button type="button" className="ax-order-id" onClick={() => onSelect(order.orderNumber)}>{order.orderNumber}</button>
                      <Badge tone={statusTone(order.status)}>{STATUS_META[order.status].label}</Badge>
                    </div>
                    <button type="button" className="ax-order-card-body" onClick={() => onSelect(order.orderNumber)}>
                      <ProductThumb src={primaryThumb(order)} size="lg" />
                      <span className="min-w-0 flex-1">
                        <span className="ax-body block truncate font-semibold">{order.customerName}</span>
                        <span className="ax-caption block">
                          {itemCount(order)} unit{itemCount(order) === 1 ? "" : "s"} · {order.district} · {timeAgo(order.createdAt)}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="ax-paydot" aria-label={`Payment ${PAYMENT_META[order.paymentStatus].label}`}>
                            <i style={{ background: PAYMENT_DOT[order.paymentStatus] ?? "#8e8e93" }} />
                            {PAYMENT_META[order.paymentStatus].label}
                          </span>
                          {order.hold?.on && <span className="ax-pill" data-tone="down">Hold</span>}
                          {order.warranty?.status === "open" && <span className="ax-pill" data-tone="info">RMA</span>}
                          {order.riskFlags.length > 0 && <span className="ax-pill" data-tone="warn">Risk</span>}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="ax-body adm-num block font-bold">{formatBDT(order.total)}</span>
                      </span>
                    </button>
                    <div className="ax-order-card-foot">
                      <button type="button" className="ax-link" onClick={() => onSelect(order.orderNumber)}>Open order</button>
                      {rowMenu(order)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      {openOrder && <OrderDrawer order={openOrder} onClose={() => onSelect(null)} onChange={refresh} toast={toast} />}
    </>
  );
}

function InboxIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M3 12h5l2 3h4l2-3h5" /><rect x="3" y="4" width="18" height="16" rx="2" />
    </svg>
  );
}

/* ================================================================== */
/* Drawer — the only place with the full record                       */
/* ================================================================== */

function OrderDrawer({ order, onClose, onChange, toast }: {
  order: MerchantOrder;
  onClose: () => void;
  onChange: () => void;
  toast: (message: string) => void;
}) {
  const [serialInput, setSerialInput] = useState("");
  const [tracking, setTracking] = useState(order.trackingNumber ?? order.courier?.consignmentId ?? "");
  const [issue, setIssue] = useState(order.warranty?.issue ?? "");
  const [busy, setBusy] = useState(false);
  const manage = can("orders.manage");
  const units = order.items.reduce((sum, item) => sum + item.qty, 0);
  const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(order.status) + 1];

  const act = (run: () => void, message: string) => { run(); onChange(); toast(message); };
  const copy = (value: string, message: string) => { void navigator.clipboard?.writeText(value); toast(message); };

  const addSerial = () => {
    const parts = serialInput.split(/[\s,;]+/).filter(Boolean);
    if (!parts.length) return;
    act(() => setOrderSerials(order.orderNumber, [...order.serials, ...parts]), `${parts.length} serial${parts.length === 1 ? "" : "s"} recorded`);
    setSerialInput("");
  };

  return (
    <Drawer
      open
      wide
      onClose={onClose}
      title={order.orderNumber}
      subtitle={`${order.customerName} · ${formatDate(order.createdAt)}`}
      footer={
        <>
          {nextStatus ? (
            <Button
              variant="primary"
              disabled={!manage}
              onClick={() => act(() => advanceStatus(order.orderNumber, nextStatus), `Moved to ${STATUS_META[nextStatus].label.toLowerCase()}`)}
            >
              <PackageCheck size={15} /> {nextStatus === "shipped" ? "Mark fulfilled · ship" : `Mark ${STATUS_META[nextStatus].label.toLowerCase()}`}
            </Button>
          ) : (
            <Button variant="primary" disabled onClick={() => undefined}><BadgeCheck size={15} /> Fulfilled</Button>
          )}
          <Button onClick={() => { if (printOrderLabel(order)) toast("Parcel label opened for printing"); else toast("Allow pop-ups to print the label"); }}>
            <Printer size={15} /> Print label
          </Button>
          <ActionMenu
            label="More order actions"
            items={[
              { label: order.courier ? "Re-book courier" : "Book courier", icon: <Truck size={15} />, disabled: !manage, onClick: async () => { setBusy(true); const result = await bookCourier(order.orderNumber); setBusy(false); onChange(); toast(result.message); } },
              { label: "Resend update to customer", icon: <Phone size={15} />, disabled: !manage, onClick: () => act(() => queueStatusMessage(order.orderNumber, order.status), "Status message queued") },
              { label: order.hold?.on ? "Release hold" : "Put on hold", icon: <ShieldCheck size={15} />, disabled: !manage, onClick: () => act(() => setOrderHold(order.orderNumber, !order.hold?.on), order.hold?.on ? "Hold released" : "Order put on hold") },
              { label: "Cancel order", icon: <X size={15} />, tone: "danger", disabled: !manage || order.status === "cancelled", onClick: () => act(() => advanceStatus(order.orderNumber, "cancelled", "Cancelled from console"), "Order cancelled") },
            ]}
          />
          {busy && <span className="ax-caption">Working…</span>}
        </>
      }
    >
      <div className="ax-drawer-stack">
        {/* status strip */}
        <div className="ax-status-strip">
          <Badge tone={statusTone(order.status)}>{STATUS_META[order.status].label}</Badge>
          <span className="ax-paydot"><i style={{ background: PAYMENT_DOT[order.paymentStatus] ?? "#8e8e93" }} />{PAYMENT_META[order.paymentStatus].label}</span>
          {isSampleOrder(order.orderNumber) && <Badge tone="neutral">Sample</Badge>}
          {order.hold?.on && <Badge tone="amber">On hold</Badge>}
          {order.warranty?.status === "open" && <Badge tone="violet">Warranty open</Badge>}
        </div>

        {/* shipping address */}
        <section className="ax-drawer-section">
          <header className="ax-drawer-section-head">
            <h3><MapPin size={14} /> Shipping address</h3>
            <button type="button" className="ax-icon-btn" aria-label="Copy shipping address" onClick={() => copy(`${order.customerName}\n${order.address}\n${order.district}\n${order.phone}`, "Address copied")}>
              <Copy size={16} />
            </button>
          </header>
          <div className="ax-address">
            <p className="ax-body font-semibold">{order.customerName}</p>
            <p className="ax-caption">{order.address}</p>
            <p className="ax-caption">{order.district} · <span className="adm-num">{order.phone}</span></p>
            {order.email && <p className="ax-caption truncate">{order.email}</p>}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <a className="adm-btn" data-size="sm" href={`tel:${order.phone}`}><Phone size={13} /> Call</a>
            <a className="adm-btn" data-size="sm" href={`https://wa.me/88${order.phone.replace(/^0/, "")}`} target="_blank" rel="noreferrer">WhatsApp</a>
            <Button size="sm" variant="ghost" onClick={() => copy(order.phone, "Phone number copied")}><Copy size={13} /> Copy phone</Button>
          </div>
        </section>

        {/* line items */}
        <section className="ax-drawer-section">
          <header className="ax-drawer-section-head">
            <h3><Package size={14} /> Line items <span className="ax-caption">{units} unit{units === 1 ? "" : "s"}</span></h3>
          </header>
          <ul className="ax-drawer-items">
            {order.items.map((item) => (
              <li key={item.id}>
                <ProductThumb src={item.image} />
                <span className="min-w-0 flex-1">
                  <span className="ax-body block font-medium leading-snug">{item.name}</span>
                  <span className="ax-caption block">৳{item.unitPrice.toLocaleString("en-IN")} × {item.qty}</span>
                </span>
                <span className="adm-num ax-body font-semibold">৳{(item.unitPrice * item.qty).toLocaleString("en-IN")}</span>
              </li>
            ))}
          </ul>
          <dl className="ax-kv mt-3">
            <dt>Subtotal</dt><dd>{formatBDT(order.subtotal)}</dd>
            <dt>Delivery</dt><dd>{formatBDT(order.shipping)}</dd>
            {order.discount > 0 && <><dt>Discount {order.promoCode ? `(${order.promoCode})` : ""}</dt><dd>−{formatBDT(order.discount)}</dd></>}
            <dt className="font-semibold text-[var(--adm-ink)]">Total</dt><dd className="font-semibold">{formatBDT(order.total)}</dd>
          </dl>
        </section>

        {/* serials */}
        <section className="ax-drawer-section">
          <header className="ax-drawer-section-head">
            <h3><Hash size={14} /> Serial / batch numbers</h3>
            <span className="ax-caption">{order.serials.length}/{units}</span>
          </header>
          {order.serials.length > 0 && (
            <ul className="ax-chips">
              {order.serials.map((serial) => (
                <li key={serial}>
                  <span className="adm-num">{serial}</span>
                  <button type="button" aria-label={`Remove serial ${serial}`} disabled={!manage}
                    onClick={() => act(() => setOrderSerials(order.orderNumber, order.serials.filter((entry) => entry !== serial)), "Serial removed")}>
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="ax-inline-form">
            <input className="adm-input" value={serialInput} onChange={(event) => setSerialInput(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addSerial(); } }}
              placeholder="Scan or type serials, comma separated" aria-label="Serial or batch numbers" disabled={!manage} />
            <Button size="sm" onClick={addSerial} disabled={!manage || !serialInput.trim()}><Check size={14} /> Add</Button>
          </div>
          <p className="ax-caption mt-1.5">Recorded on the printed label so warranty claims can be traced to a batch.</p>
        </section>

        {/* tracking */}
        <section className="ax-drawer-section">
          <header className="ax-drawer-section-head"><h3><Truck size={14} /> Carrier tracking</h3></header>
          <div className="ax-inline-form">
            <input className="adm-input adm-num" value={tracking} onChange={(event) => setTracking(event.target.value)}
              placeholder="Consignment / tracking number" aria-label="Carrier tracking number" disabled={!manage} />
            <Button size="sm" disabled={!manage || tracking === (order.trackingNumber ?? order.courier?.consignmentId ?? "")}
              onClick={() => act(() => setOrderTracking(order.orderNumber, tracking), tracking ? "Tracking number saved" : "Tracking number cleared")}>
              Save
            </Button>
          </div>
          {order.courier && <p className="ax-caption mt-1.5">{order.courier.provider} · booked {timeAgo(order.courier.bookedAt)}</p>}
        </section>

        {/* warranty */}
        <section className="ax-drawer-section">
          <header className="ax-drawer-section-head">
            <h3><Wrench size={14} /> Warranty / RMA</h3>
            {order.warranty && <Badge tone={order.warranty.status === "open" ? "violet" : "emerald"}>{order.warranty.status === "open" ? "Open" : "Resolved"}</Badge>}
          </header>
          {order.warranty ? (
            <p className="ax-caption">{order.warranty.issue} · opened {timeAgo(order.warranty.openedAt)}</p>
          ) : (
            <p className="ax-caption">No claim. Open one when a customer reports a fault inside the warranty window.</p>
          )}
          <div className="ax-inline-form mt-2">
            <input className="adm-input" value={issue} onChange={(event) => setIssue(event.target.value)} placeholder="Fault reported…" aria-label="Warranty issue" disabled={!manage || order.warranty?.status === "open"} />
            <Button size="sm" variant={order.warranty?.status === "open" ? "default" : "ghost"} disabled={!manage}
              onClick={() => act(
                () => setOrderWarranty(order.orderNumber, order.warranty?.status === "open" ? "resolve" : "open", issue),
                order.warranty?.status === "open" ? "Warranty claim resolved" : "Warranty claim opened",
              )}>
              {order.warranty?.status === "open" ? "Resolve" : "Open claim"}
            </Button>
          </div>
        </section>

        {/* activity */}
        {order.events.length > 0 && (
          <details className="ax-drawer-section">
            <summary className="ax-drawer-section-head cursor-pointer"><h3><AlertTriangle size={14} /> Activity ({order.events.length})</h3></summary>
            <ul className="ax-timeline">
              {order.events.slice(-6).reverse().map((event) => (
                <li key={event.id}>
                  <p className="ax-body font-medium">{event.label}</p>
                  <p className="ax-caption">{new Date(event.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {event.actor}</p>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Drawer>
  );
}
